// Refrens invoicing worker logic. The Supabase billing ledger is the source of truth;
// Refrens idempotency (24h, bound to one token) is only extra protection.
const base = "https://api.refrens.com";

export type Env = (name: string) => string | undefined;
export type Operation = {
  id: string; kind: "invoice_create" | "payment_apply"; claimToken: string; attempts: number; reconcileFirst: boolean;
  invoiceNumber: string | null; createdAt: string; payload: Record<string, unknown>; providerInvoiceId: string | null;
};
export type Outcome = { outcome: "succeeded" | "ambiguous" | "needs_staff"; providerInvoiceId?: string; providerPaymentId?: string; error?: string };
type Reply = { status: number; body: Record<string, unknown> };

export function refrensSettings(env: Env) {
  const appId = env("REFRENS_APP_ID") ?? "", appSecret = env("REFRENS_APP_SECRET") ?? "", urlKey = env("REFRENS_BUSINESS_URL_KEY") ?? "";
  const configured = appId.length > 0 && appSecret.length > 0 && /^[A-Za-z0-9_-]{2,80}$/.test(urlKey);
  return { appId, appSecret, urlKey, configured, enabled: configured && env("REFRENS_INVOICING_ENABLED") === "true" };
}

// Checks run before anything leaves the ledger. Returns problem codes only, never payload values.
export function payloadProblems(op: Pick<Operation, "kind" | "payload">): string[] {
  const p = op.payload, problems: string[] = [];
  if ("email" in p) problems.push("email_delivery_not_allowed");
  if (op.kind === "payment_apply") {
    if (!(Number(p.amount) > 0)) problems.push("invalid_amount");
    if (typeof p.refId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(p.refId)) problems.push("invalid_payment_reference");
    return problems;
  }
  const billedTo = p.billedTo as Record<string, unknown> | undefined;
  const items = p.items as Record<string, unknown>[] | undefined;
  if (p.invoiceType !== "BOS" && p.invoiceType !== "INVOICE") problems.push("invalid_invoice_type");
  if (p.invoiceType === "BOS" && ("billedBy" in p || (billedTo && "gstin" in billedTo) || items?.some(i => "gstRate" in i)))
    problems.push("tax_fields_on_bill_of_supply");
  if (p.invoiceType === "INVOICE" && !(p.billedBy as Record<string, unknown> | undefined)?.gstin) problems.push("gstin_required");
  if (typeof p.invoiceNumber !== "string" || !/^ARM-[DR]-\d{6}-[0-9A-F]{10}$/.test(p.invoiceNumber)) problems.push("invalid_invoice_number");
  if (!billedTo || typeof billedTo.name !== "string" || billedTo.name.length < 2 || billedTo.country !== "IN") problems.push("invalid_billed_to");
  if (!Array.isArray(items) || items.length !== 1 || !(Number(items[0].rate) > 0) || items[0].quantity !== 1) problems.push("invalid_items");
  if (p.currency !== "INR") problems.push("invalid_currency");
  return problems;
}

class Ambiguous extends Error {}

export class RefrensClient {
  private accessToken: string | null = null;
  constructor(private readonly settings: ReturnType<typeof refrensSettings>, private readonly fetcher: typeof fetch = fetch) {}

  private async call(method: string, path: string, body?: object, idempotencyKey?: string, auth = true): Promise<Reply> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) headers.authorization = "Bearer " + await this.token();
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    let response: Response;
    try {
      response = await this.fetcher(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    } catch { throw new Ambiguous("network"); }
    const parsed = await response.json().catch(() => ({}));
    return { status: response.status, body: parsed && typeof parsed === "object" ? parsed : {} };
  }

  async token(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const reply = await this.call("POST", "/authentication", { strategy: "app-secret", appId: this.settings.appId, appSecret: this.settings.appSecret }, undefined, false);
    if (reply.status >= 300 || typeof reply.body.accessToken !== "string") throw new Error("refrens_authentication_failed");
    return this.accessToken = reply.body.accessToken;
  }

  request(method: string, path: string, body?: object, idempotencyKey?: string) {
    return this.call(method, "/businesses/" + encodeURIComponent(this.settings.urlKey) + path, body, idempotencyKey);
  }
}

// Refrens has no documented search by number, so page newest-first until we pass the operation's creation time.
export async function findInvoice(client: RefrensClient, invoiceNumber: string, since: string): Promise<string | null | "unknown"> {
  const cutoff = Date.parse(since) - 60 * 60 * 1000;
  for (let skip = 0; skip < 2000; skip += 100) {
    const reply = await client.request("GET", "/invoices?$limit=100&$skip=" + skip + "&$sort[createdAt]=-1");
    const data = reply.body.data;
    if (reply.status !== 200 || !Array.isArray(data)) return "unknown";
    for (const invoice of data as Record<string, unknown>[]) {
      if (invoice.invoiceNumber === invoiceNumber && typeof invoice._id === "string") return invoice._id;
    }
    const oldest = Date.parse(String((data.at(-1) as Record<string, unknown> | undefined)?.createdAt ?? ""));
    if (data.length < 100 || (Number.isFinite(oldest) && oldest < cutoff)) return null;
  }
  return "unknown";
}

function classify(reply: Reply): Outcome | null {
  if (reply.status >= 200 && reply.status < 300) return null;
  const code = String(reply.body.errorCode ?? reply.body.name ?? "error").replace(/[^A-Za-z0-9_]/g, "").slice(0, 60);
  // In-progress duplicates, throttling and server errors may have taken effect: reconcile, never blindly resend.
  if (reply.status === 429 || reply.status >= 500 || code === "IDEMPOTENCY_REQUEST_IN_PROGRESS") return { outcome: "ambiguous", error: "http_" + reply.status + "_" + code };
  return { outcome: "needs_staff", error: "http_" + reply.status + "_" + code };
}

export async function dispatchOperation(op: Operation, client: RefrensClient): Promise<Outcome> {
  const problems = payloadProblems(op);
  if (problems.length) return { outcome: "needs_staff", error: problems.join(",") };
  try {
    if (op.kind === "invoice_create") {
      if (op.reconcileFirst) {
        const found = await findInvoice(client, op.invoiceNumber ?? "", op.createdAt);
        if (found === "unknown") return { outcome: "needs_staff", error: "reconcile_incomplete" };
        if (found) return { outcome: "succeeded", providerInvoiceId: found };
      }
      const reply = await client.request("POST", "/invoices", op.payload, op.id);
      const failure = classify(reply);
      if (failure) return failure;
      return typeof reply.body._id === "string" ? { outcome: "succeeded", providerInvoiceId: reply.body._id } : { outcome: "ambiguous", error: "missing_invoice_id" };
    }
    if (!op.providerInvoiceId) return { outcome: "needs_staff", error: "invoice_missing" };
    const path = "/invoices/" + encodeURIComponent(op.providerInvoiceId) + "/payments";
    // Always check first: a payment applied under an earlier token is invisible to provider idempotency.
    const existing = await client.request("GET", path);
    if (existing.status !== 200 || !Array.isArray(existing.body.payments)) return { outcome: "ambiguous", error: "payments_unreadable" };
    const applied = (existing.body.payments as Record<string, unknown>[]).find(p => p.refId === op.payload.refId && !p.isRemoved);
    if (applied) return { outcome: "succeeded", providerPaymentId: typeof applied._id === "string" ? applied._id : undefined };
    const reply = await client.request("POST", path, op.payload, op.id);
    const failure = classify(reply);
    if (failure) return failure;
    return { outcome: "succeeded", providerPaymentId: typeof reply.body._id === "string" ? reply.body._id : undefined };
  } catch (error) {
    if (error instanceof Ambiguous) return { outcome: "ambiguous", error: "network_or_timeout" };
    return { outcome: "ambiguous", error: error instanceof Error && error.message === "refrens_authentication_failed" ? error.message : "unexpected_error" };
  }
}

export type Rpc = (action: string, input: object) => Promise<Record<string, unknown>>;

export async function runBillingDispatch(env: Env, rpc: Rpc, fetcher: typeof fetch = fetch) {
  const settings = refrensSettings(env);
  const db = await rpc("settings", {});
  if (!settings.enabled || db.invoicingEnabled !== true) {
    const preview = (await rpc("preview", {})).operations as { id: string; kind: Operation["kind"]; state: string; payload: Record<string, unknown>; testFixture: boolean }[];
    return { dryRun: true, configured: settings.configured, operations: preview.map(op => ({ id: op.id, kind: op.kind, state: op.state,
      testFixture: op.testFixture, problems: op.kind === "refund_review" as string ? [] : payloadProblems(op) })) };
  }
  const client = new RefrensClient(settings, fetcher);
  // Staging fixtures are never sent to the provider by the live worker.
  const claimed = (await rpc("claim", { limit: 10, testFixture: false })).operations as Operation[];
  const results = [];
  for (const op of claimed) {
    const outcome = await dispatchOperation(op, client);
    await rpc("complete", { id: op.id, claimToken: op.claimToken, ...outcome });
    results.push({ id: op.id, kind: op.kind, outcome: outcome.outcome, error: outcome.error });
  }
  return { dryRun: false, claimed: claimed.length, results };
}
