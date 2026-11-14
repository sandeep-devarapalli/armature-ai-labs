// @vitest-environment node
// Edge functions run in Deno, a single-realm runtime; jsdom globals here break undici body parsing on Node 26.
import { beforeEach, expect, it, vi } from "vitest";
import { dispatchOperation, payloadProblems, RefrensClient, refrensSettings, runBillingDispatch, type Operation } from "../../supabase/functions/_shared/refrens";

const env: Record<string, string> = {};
const fetcher = vi.fn();
const settings = () => refrensSettings(name => env[name]);
const invoice: Operation = { id: "b0000000-0000-4000-8000-000000000001", kind: "invoice_create", claimToken: "t", attempts: 1, reconcileFirst: false,
  invoiceNumber: "ARM-R-202702-B000000000", createdAt: "2026-11-08T05:00:00Z", providerInvoiceId: null,
  payload: { invoiceType: "BOS", invoiceNumber: "ARM-R-202702-B000000000", currency: "INR", invoiceDate: "2026-11-08",
    billedTo: { name: "Synthetic Renter", country: "IN", emailShowInInvoice: false }, items: [{ name: "Cabin 101 licence fee", rate: 50, quantity: 1 }] } };
const payment: Operation = { ...invoice, id: "b0000000-0000-4000-8000-000000000002", kind: "payment_apply", invoiceNumber: null,
  providerInvoiceId: "inv_1", payload: { amount: 50, paymentDate: "2026-11-08T05:00:00Z", refId: "pay_Synthetic", notes: "Razorpay payment pay_Synthetic" } };
const reply = (status: number, body: object) => Promise.resolve(Response.json(body, { status }));
function route(handlers: Record<string, () => Promise<Response>>) {
  fetcher.mockImplementation((url: string, init: RequestInit) => {
    const key = init.method + " " + new URL(url).pathname;
    if (key === "POST /authentication") return reply(201, { accessToken: "synthetic-token-" + fetcher.mock.calls.length });
    const handler = handlers[key];
    if (!handler) throw new Error("unexpected " + key);
    return handler();
  });
}
const calls = (method: string) => fetcher.mock.calls.filter(([url, init]) => init.method === method && !String(url).endsWith("/authentication"));
beforeEach(() => {
  vi.resetAllMocks();
  Object.keys(env).forEach(key => delete env[key]);
  Object.assign(env, { REFRENS_APP_ID: "synthetic-app", REFRENS_APP_SECRET: "synthetic-secret-value", REFRENS_BUSINESS_URL_KEY: "armature-test" });
});

it("stays disabled unless the explicit flag is on", () => {
  expect(settings().enabled).toBe(false);
  env.REFRENS_INVOICING_ENABLED = "true";
  expect(settings().enabled).toBe(true);
});
it("accepts a no-tax bill of supply and rejects tax fields, email delivery and deposits-sized items", () => {
  expect(payloadProblems(invoice)).toEqual([]);
  expect(payloadProblems({ kind: "invoice_create", payload: { ...invoice.payload, email: { to: ["x@example.test"] } } })).toContain("email_delivery_not_allowed");
  expect(payloadProblems({ kind: "invoice_create", payload: { ...invoice.payload, billedTo: { name: "A B", country: "IN", gstin: "29ABCDE1234F1Z5" } } })).toContain("tax_fields_on_bill_of_supply");
  expect(payloadProblems({ kind: "invoice_create", payload: { ...invoice.payload, invoiceType: "INVOICE" } })).toContain("gstin_required");
  expect(payloadProblems({ kind: "invoice_create", payload: { ...invoice.payload, items: [{ name: "Rent", rate: 50, quantity: 1 }, { name: "Deposit", rate: 100, quantity: 1 }] } })).toContain("invalid_items");
});
it("creates an invoice once with the operation id as idempotency key", async () => {
  route({ "POST /businesses/armature-test/invoices": () => reply(201, { _id: "inv_1", invoiceNumber: invoice.invoiceNumber }) });
  expect(await dispatchOperation(invoice, new RefrensClient(settings(), fetcher))).toEqual({ outcome: "succeeded", providerInvoiceId: "inv_1" });
  const [, init] = calls("POST")[0];
  expect(init.headers["idempotency-key"]).toBe(invoice.id);
  expect(init.headers.authorization).toMatch(/^Bearer synthetic-token-/);
  expect(JSON.parse(init.body)).not.toHaveProperty("email");
});
it.each([[500, {}], [429, {}], [409, { errorCode: "IDEMPOTENCY_REQUEST_IN_PROGRESS" }]])("treats %s as ambiguous", async (status, body) => {
  route({ "POST /businesses/armature-test/invoices": () => reply(status, body) });
  expect((await dispatchOperation(invoice, new RefrensClient(settings(), fetcher))).outcome).toBe("ambiguous");
});
it("treats a network drop as ambiguous and a validation error as staff review", async () => {
  route({ "POST /businesses/armature-test/invoices": () => Promise.reject(new TypeError("network")) });
  expect(await dispatchOperation(invoice, new RefrensClient(settings(), fetcher))).toEqual({ outcome: "ambiguous", error: "network_or_timeout" });
  route({ "POST /businesses/armature-test/invoices": () => reply(400, { name: "BadRequest", message: "secret-looking detail" }) });
  const outcome = await dispatchOperation(invoice, new RefrensClient(settings(), fetcher));
  expect(outcome).toEqual({ outcome: "needs_staff", error: "http_400_BadRequest" });
});
it("reconciles an ambiguous create by invoice number before resending under a new token", async () => {
  route({ "GET /businesses/armature-test/invoices": () => reply(200, { data: [{ _id: "inv_found", invoiceNumber: invoice.invoiceNumber, createdAt: "2026-11-08T05:00:01Z" }] }) });
  expect(await dispatchOperation({ ...invoice, attempts: 2, reconcileFirst: true }, new RefrensClient(settings(), fetcher)))
    .toEqual({ outcome: "succeeded", providerInvoiceId: "inv_found" });
  expect(calls("POST")).toHaveLength(0);
});
it("routes to staff when reconciliation cannot prove absence", async () => {
  route({ "GET /businesses/armature-test/invoices": () => reply(503, {}) });
  expect(await dispatchOperation({ ...invoice, reconcileFirst: true }, new RefrensClient(settings(), fetcher)))
    .toEqual({ outcome: "needs_staff", error: "reconcile_incomplete" });
  expect(calls("POST")).toHaveLength(0);
});
it("recreates only after the newest-first scan passes the operation time without a match", async () => {
  route({ "GET /businesses/armature-test/invoices": () => reply(200, { data: [{ _id: "other", invoiceNumber: "ARM-R-202701-0000000000", createdAt: "2026-11-01T00:00:00Z" }] }),
    "POST /businesses/armature-test/invoices": () => reply(201, { _id: "inv_2" }) });
  expect((await dispatchOperation({ ...invoice, reconcileFirst: true }, new RefrensClient(settings(), fetcher))).providerInvoiceId).toBe("inv_2");
});
it("never applies the same Razorpay payment twice", async () => {
  route({ "GET /businesses/armature-test/invoices/inv_1/payments": () => reply(200, { payments: [{ _id: "p1", refId: "pay_Synthetic", isRemoved: false }] }) });
  expect(await dispatchOperation(payment, new RefrensClient(settings(), fetcher))).toEqual({ outcome: "succeeded", providerPaymentId: "p1" });
  expect(calls("POST")).toHaveLength(0);
  route({ "GET /businesses/armature-test/invoices/inv_1/payments": () => reply(200, { payments: [{ _id: "p0", refId: "pay_Synthetic", isRemoved: true }] }),
    "POST /businesses/armature-test/invoices/inv_1/payments": () => reply(201, { _id: "p2" }) });
  expect(await dispatchOperation(payment, new RefrensClient(settings(), fetcher))).toEqual({ outcome: "succeeded", providerPaymentId: "p2" });
});
it("dry-runs without any provider call when either gate is off", async () => {
  const rpc = vi.fn(async (action: string) => action === "settings" ? { invoicingEnabled: true }
    : { operations: [{ id: invoice.id, kind: "invoice_create", state: "pending", testFixture: true, payload: invoice.payload }] });
  const result = await runBillingDispatch(name => env[name], rpc, fetcher);
  expect(result).toMatchObject({ dryRun: true, operations: [{ id: invoice.id, problems: [] }] });
  expect(JSON.stringify(result)).not.toContain("Synthetic Renter");
  expect(fetcher).not.toHaveBeenCalled();
  expect(rpc.mock.calls.map(([action]) => action)).toEqual(["settings", "preview"]);
});
it("claims only non-fixture work and never echoes secrets", async () => {
  env.REFRENS_INVOICING_ENABLED = "true";
  route({ "POST /businesses/armature-test/invoices": () => reply(201, { _id: "inv_1" }) });
  const rpc = vi.fn(async (action: string) => action === "settings" ? { invoicingEnabled: true } : action === "claim" ? { operations: [invoice] } : { state: "succeeded" });
  const result = await runBillingDispatch(name => env[name], rpc, fetcher);
  expect(rpc.mock.calls.find(([action]) => action === "claim")?.[1]).toMatchObject({ testFixture: false });
  expect(rpc.mock.calls.find(([action]) => action === "complete")?.[1]).toMatchObject({ id: invoice.id, claimToken: "t", outcome: "succeeded", providerInvoiceId: "inv_1" });
  expect(JSON.stringify(result)).not.toContain("synthetic-secret-value");
  expect(JSON.stringify(result)).not.toContain("synthetic-token");
});
