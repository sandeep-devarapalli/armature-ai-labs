import { adminClient, authenticatedUser, requireStaff } from "./supabase.ts";
import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { liveRazorpay, liveWebhookSettings, productionBackend, reconcileLivePayment } from "./live-desk-payment.ts";

const modeConfig = {
  test: { origin: "https://booking-staging.armature-lab.pages.dev", backend: "https://gwrdmpvczwuypvvzfyty.supabase.co",
    rpc: "connected_desk_checkout", prefix: "CONNECTED_DESK_", enabled: "CONNECTED_DESK_TEST_ENABLED" },
  live: { origin: "https://armatureailabs.com", backend: productionBackend,
    rpc: "live_desk_checkout", prefix: "LIVE_DESK_", enabled: "LIVE_DESK_CHECKOUT_ENABLED" },
} as const;
function cors(origin: string) { return {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}; }
const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
class Rejected extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
type Quote = {
  id: string;
  chair: string;
  unit: string;
  starts_on: string;
  ends_on: string;
  amount_paise: number;
  agreement_hash: string;
  document_id: string | null;
  sealed_revision: string | null;
  order_id: string | null;
  order_claimed_at: string | null;
  policy_version?: string;
  status?: string;
  bookingId?: string;
  bookingIds?: string[];
  membership?: string;
  reviewReason?: string;
};
type Recipient = { email: string; signing_order: number; has_completed: boolean; date_current_revision_signed?: string };
type Document = {
  id: string;
  status: string;
  content_date_modified: string;
  metadata?: Record<string, unknown>;
  recipients?: Recipient[];
  fields?: { type: string; assigned_to?: { email: string }; is_filled?: boolean }[];
};
type Payment = { id: string; order_id: string; amount: number; currency: string; status: string; amount_refunded: number };
type Order = { id: string; receipt: string; amount: number; currency: string };

function view(q: Quote) {
  return { quoteId: q.id, chair: q.chair, unit: q.unit, start: q.starts_on, end: q.ends_on,
    amountPaise: q.amount_paise, agreementHash: q.agreement_hash, hasAgreement: Boolean(q.document_id),
    orderPending: Boolean(q.order_claimed_at && !q.order_id), hasOrder: Boolean(q.order_id),
    status: q.status, bookingId: q.bookingId, bookingIds: q.bookingIds, membership: q.membership, reviewReason: q.reviewReason };
}
export async function handleDeskCheckout(request: Request, mode: "test" | "live"): Promise<Response> {
  const config = modeConfig[mode];
  const headers = cors(config.origin);
  const reply = (value: object, status = 200) => Response.json(value, { status, headers });
  if (request.headers.get("origin") !== config.origin) return reply({ error: "checkout_origin_required" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const live = mode === "live";
  const razor = live ? liveRazorpay() : null;
  const key = live ? razor?.keyId ?? "" : Deno.env.get("CONNECTED_DESK_RAZORPAY_KEY_ID") ?? "";
  const secret = live ? razor?.keySecret ?? "" : Deno.env.get("CONNECTED_DESK_RAZORPAY_KEY_SECRET") ?? "";
  const pandaKey = Deno.env.get(config.prefix + (live ? "PANDADOC_API_KEY" : "PANDADOC_SANDBOX_KEY")) ?? "";
  const staffSigner = Deno.env.get(config.prefix + "PANDADOC_SIGNER")?.trim().toLowerCase() ?? "";
  const manualPilot = live && Deno.env.get(config.prefix + "MANUAL_AGREEMENT_ENABLED") === "true";
  const enabled = Deno.env.get(config.enabled) === "true" && (!live || Boolean(liveWebhookSettings(razor)));
  const policyVersion = live ? Deno.env.get("LIVE_DESK_POLICY_VERSION") ?? "" : "";
  if (Deno.env.get("SUPABASE_URL") !== config.backend || (!live && !enabled)
      || !new RegExp("^rzp_" + mode + "_[A-Za-z0-9]+$").test(key) || !secret
      || (live && !/^[A-Za-z0-9._-]{4,80}$/.test(policyVersion)) || (!pandaKey && !manualPilot) || !staffSigner) {
    return reply({ error: live ? "checkout_not_configured" : "test_checkout_not_configured" }, 503);
  }
  const isManualQuote = (q: Quote) => q.chair === "S01" && (({ day: 35000, week: 175000, month: 1300000 } as Record<string, number>)[q.unit] === q.amount_paise)
    && ((manualPilot && !q.document_id) || q.sealed_revision === "manual-pilot-v1");
  const present = (q: Quote) => ({ ...view(q), manualAgreement: isManualQuote(q), ...(live ? { policyVersion } : {}) });

  try {
    const user = await authenticatedUser(request);
    const raw = new TextDecoder().decode(await bodyBytes(request, 4096));
    let input;
    try { input = JSON.parse(raw); } catch { throw new Rejected(400, "invalid_request"); }
    if (!input || typeof input !== "object" || typeof input.action !== "string") throw new Rejected(400, "invalid_request");
    const client = adminClient();
    const action = input.action;
    if (!enabled && !["status", "verify", "list_own", "staff_queue", "manual_review", "recover_order"].includes(action)) throw new Rejected(503, "checkout_disabled");
    if (action === "list_own" || action === "staff_queue") {
      if (!live) throw new Rejected(400, "invalid_request");
      const staff = action === "staff_queue";
      if (staff) {
        if (user.claims.aal !== "aal2") throw new Rejected(403, "staff_mfa_required");
        await requireStaff(user.id, ["admin", "super_admin"]);
      }
      const offset = input.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Rejected(400, "invalid_request");
      const { data, error } = await client.rpc("list_desk_requests", {
        p_member: user.id, p_staff: staff, p_offset: offset,
      }).abortSignal(AbortSignal.timeout(10000));
      if (error) throw new Rejected(503, "checkout_state_unavailable");
      return reply({ mode, nextOffset: data.nextOffset, quotes: data.quotes.map((q: Quote & {
        approvedAt?: string; memberId?: string; customerEmail?: string;
      }) => ({ ...present(q), approvedAt: q.approvedAt ?? null,
        agreementSigned: Boolean(q.approvedAt),
        ...(staff ? { memberId: q.memberId, customerEmail: q.customerEmail } : {}),
      })) });
    }
    let member = user.id;
    let customer = user.email?.toLowerCase() ?? "";
    const manualReview = action === "manual_review" || action === "approve_manual";
    if (manualReview && !manualPilot) throw new Rejected(403, "manual_agreement_unavailable");
    const recovery = action === "recover_order";
    if (recovery && !live) throw new Rejected(403, "order_recovery_unavailable");
    if (action === "seal" || manualReview || recovery) {
      if ((live || manualReview || recovery) && user.claims.aal !== "aal2") throw new Rejected(403, "staff_mfa_required");
      await requireStaff(user.id, ["admin", "super_admin"]);
      if (!pattern.test(input.memberId ?? "")) throw new Rejected(400, "invalid_member");
      member = input.memberId;
      if ((manualReview || recovery) && member === user.id) throw new Rejected(403, "independent_reviewer_required");
      const owner = await client.auth.admin.getUserById(member);
      customer = owner.data.user?.email?.toLowerCase() ?? "";
    }
    if (!customer || customer === staffSigner) throw new Rejected(409, "separate_signers_required");

    async function operation<T>(name: string, payload: object): Promise<T> {
      const { data, error } = await client.rpc(config.rpc, {
        p_action: name, p_member: member, p_input: payload,
      }).abortSignal(AbortSignal.timeout(10000));
      if (error?.code === "42501") throw new Rejected(403, "checkout_state_rejected");
      if (error?.code === "P0002" || error?.code === "22023") throw new Rejected(409, "checkout_state_rejected");
      if (error || !data) throw new Rejected(503, "checkout_state_unavailable");
      return data as T;
    }
    async function manualApproval(q: Quote, review?: object): Promise<number> {
      const { data, error } = await client.rpc("manual_desk_agreement", {
        p_member: member, p_quote: q.id, ...(review ? { p_review: review } : {}),
      }).abortSignal(AbortSignal.timeout(10000));
      if (error?.code === "42501") throw new Rejected(403, "checkout_state_rejected");
      if (["P0002", "22023"].includes(error?.code ?? "")) throw new Rejected(409, "checkout_state_rejected");
      if (error) throw new Rejected(503, "checkout_state_unavailable");
      return typeof data === "string" ? Date.parse(data) : NaN;
    }
    async function provider<T>(kind: "panda" | "razorpay", path: string, body?: object): Promise<T> {
      if (kind === "razorpay" && razor) return razor.request<T>(path, body);
      if (kind === "panda" && !pandaKey) throw new Rejected(503, "checkout_not_configured");
      const base = kind === "panda" ? "https://api.pandadoc.com/public/v1" : "https://api.razorpay.com/v1";
      const authorization = kind === "panda" ? "API-Key " + pandaKey : "Basic " + btoa(key + ":" + secret);
      const response = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { Authorization: authorization, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Rejected(502, "provider_request_rejected");
      return response.json() as Promise<T>;
    }
    async function agreement(q: Quote, id: string) {
      const doc = await provider<Document>("panda", "/documents/" + id + "/details");
      const recipients = doc.recipients ?? [];
      const signer = (email: string, order: number) => recipients.find(r => r.email?.toLowerCase() === email && r.signing_order === order);
      const customerRecipient = signer(customer, 1), staffRecipient = signer(staffSigner, 2);
      if (doc.id !== id || !doc.content_date_modified || (q.sealed_revision && doc.content_date_modified !== q.sealed_revision)
        || doc.metadata?.booking_id !== q.id || doc.metadata?.agreement_hash !== q.agreement_hash
        || (live && doc.metadata?.purpose !== "armature_live_desk")
        || String(doc.metadata?.version) !== "1" || recipients.length !== 2 || !customerRecipient || !staffRecipient) {
        throw new Rejected(409, "agreement_binding_mismatch");
      }
      const signedTime = (recipient: Recipient) => recipient.has_completed && doc.fields?.some(
        field => field.type === "signature" && field.is_filled && field.assigned_to?.email?.toLowerCase() === recipient.email.toLowerCase(),
      ) ? Date.parse(recipient.date_current_revision_signed ?? "") : NaN;
      const first = signedTime(customerRecipient), second = signedTime(staffRecipient);
      return { doc, customerSigned: Number.isFinite(first),
        completed: doc.status === "document.completed" && Number.isFinite(first) && Number.isFinite(second) && second >= first,
        signedAt: second };
    }
    async function capture(q: Quote, payment: Payment) {
      if (payment.order_id !== q.order_id || payment.status !== "captured" || payment.amount_refunded !== 0
        || payment.amount !== q.amount_paise || payment.currency !== "INR" || !/^pay_[A-Za-z0-9]+$/.test(payment.id)) {
        throw new Rejected(409, "payment_not_captured_for_quote");
      }
      return operation<object>("capture", { quoteId: q.id, orderId: q.order_id, paymentId: payment.id,
        amount: payment.amount, currency: payment.currency });
    }

    if (live && action === "availability") {
      const { chair, unit, from, to } = input;
      if (chair !== undefined && (!/^S(0[1-9]|1[0-9]|2[0-5])$/.test(chair)
        || !["day", "week", "month"].includes(unit)
        || !/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? ""))) {
        throw new Rejected(400, "invalid_selection");
      }
      if (manualPilot && chair !== undefined && (chair !== "S01")) {
        return reply({ mode, chairs: [], dates: [] });
      }
      const availability = await operation<{ chairs: string[] }>("availability", { chair, unit, from, to });
      if (manualPilot) availability.chairs = availability.chairs.filter(code => code === "S01");
      return reply({ mode, ...availability });
    }
    if (action === "quote") {
      if (!/^S(0[1-9]|1[0-9]|2[0-5])$/.test(input.chair ?? "") || !["day", "week", "month"].includes(input.unit)
        || !/^\d{4}-\d{2}-\d{2}$/.test(input.start ?? "")) throw new Rejected(400, "invalid_selection");
      if (manualPilot && (input.chair !== "S01")) throw new Rejected(409, "manual_agreement_unavailable");
      const quote = await operation<Quote>("quote", { chair: input.chair, unit: input.unit, start: input.start });
      if (manualPilot && !isManualQuote(quote) && !quote.document_id) throw new Rejected(409, "manual_agreement_unavailable");
      return reply({ mode, ...present(quote) });
    }
    if (!pattern.test(input.quoteId ?? "")) throw new Rejected(400, "invalid_quote");
    const q = await operation<Quote>("status", { quoteId: input.quoteId });
    if (recovery) {
      if (!q.order_claimed_at || !q.document_id || q.status || !/^order_[A-Za-z0-9]{1,80}$/.test(input.orderId ?? "")
        || (q.order_id && q.order_id !== input.orderId)) throw new Rejected(409, "order_recovery_unavailable");
      const signed = isManualQuote(q) ? Number.isFinite(await manualApproval(q)) : (await agreement(q, q.document_id)).completed;
      if (!signed) throw new Rejected(409, "agreement_required");
      const order = await provider<Order>("razorpay", "/orders/" + input.orderId);
      if (order.id !== input.orderId || order.receipt !== q.id || order.amount !== q.amount_paise || order.currency !== "INR") {
        throw new Rejected(409, "provider_order_mismatch");
      }
      const bound = await operation<Quote>("bind_order", { quoteId: q.id, orderId: order.id });
      return reply({ mode, ...present(bound), recovered: true });
    }
    if (manualReview) {
      if (!isManualQuote(q)) throw new Rejected(409, "manual_agreement_unavailable");
      if (action === "manual_review") return reply({ mode, ...present(q), customerEmail: customer, staffEmail: staffSigner,
        agreementSigned: Boolean(q.document_id && Number.isFinite(await manualApproval(q))) });
      if (input.confirmed !== true || input.agreementHash !== q.agreement_hash
        || !/^[A-Za-z0-9_-]{8,80}$/.test(input.documentId ?? "")
        || !/^[0-9a-f]{64}$/.test(input.evidenceSha256 ?? "")) {
        throw new Rejected(400, "invalid_manual_agreement_evidence");
      }
      const signedAt = await manualApproval(q, {
        reviewerId: user.id, documentId: input.documentId, agreementHash: input.agreementHash, evidenceSha256: input.evidenceSha256,
      });
      if (!Number.isFinite(signedAt)) throw new Rejected(503, "checkout_state_unavailable");
      return reply({ mode, ...present(q), hasAgreement: true, agreementSigned: true });
    }
    if (action === "seal") {
      if (isManualQuote(q) || q.document_id || !/^[A-Za-z0-9_-]{8,80}$/.test(input.documentId ?? "")) throw new Rejected(409, "invalid_document");
      const { doc, customerSigned } = await agreement(q, input.documentId);
      if (!["document.sent", "document.viewed"].includes(doc.status) || customerSigned) throw new Rejected(409, "seal_before_signing");
      return reply({ mode, ...present(await operation<Quote>("seal", { quoteId: q.id, documentId: doc.id, revision: doc.content_date_modified })) });
    }
    if (action === "verify") {
      if (!q.order_id || input.razorpay_order_id !== q.order_id || !/^pay_[A-Za-z0-9]+$/.test(input.razorpay_payment_id ?? "")
        || !/^[0-9a-f]{64}$/.test(input.razorpay_signature ?? "")) throw new Rejected(400, "invalid_callback");
      if (!await validHmac(secret, new TextEncoder().encode(q.order_id + "|" + input.razorpay_payment_id), input.razorpay_signature)) throw new Rejected(400, "invalid_callback_signature");
      const payment = await provider<Payment>("razorpay", "/payments/" + input.razorpay_payment_id);
      if (payment.id !== input.razorpay_payment_id || payment.order_id !== q.order_id) throw new Rejected(409, "payment_mismatch");
      if (razor) {
        return reply({ mode, ...present(q), ...await reconcileLivePayment(razor, payment, q, operation) });
      }
      return reply({ mode, ...await capture(q, payment) });
    }
    if (live && action === "status" && q.status) return reply({ mode, ...present(q) });
    if (action === "status" && q.order_id) {
      const payments = await provider<{ items: Payment[] }>("razorpay", "/orders/" + q.order_id + "/payments");
      const payment = payments.items.find(item => live
        ? ["captured", "refunded"].includes(item.status) : item.status === "captured" && item.amount_refunded === 0);
      if (payment && razor) return reply({ mode, ...present(q), ...await reconcileLivePayment(razor, payment, q, operation) });
      if (payment?.amount_refunded === 0) return reply({ mode, ...present(q), ...await capture(q, payment) });
    }
    if (action === "status" && !q.document_id) return reply({ mode, ...present(q) });
    if (!q.document_id) throw new Rejected(409, "agreement_required");
    const signedAt = isManualQuote(q) ? await manualApproval(q) : NaN;
    const state = isManualQuote(q) ? {
      signedAt, customerSigned: Number.isFinite(signedAt), completed: Number.isFinite(signedAt), doc: null,
    } : await agreement(q, q.document_id);
    if (action === "status") return reply({ mode, ...present(q), customerSigned: state.customerSigned, agreementSigned: state.completed,
      approvedAt: isManualQuote(q) && Number.isFinite(state.signedAt) ? new Date(state.signedAt).toISOString() : null });
    if (action === "sign") {
      if (!state.doc || state.customerSigned || !["document.sent", "document.viewed"].includes(state.doc.status)) throw new Rejected(409, "customer_signing_unavailable");
      const session = await provider<{ id: string }>("panda", "/documents/" + q.document_id + "/session", { recipient: customer, lifetime: 900 });
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(session.id)) throw new Rejected(502, "invalid_signing_session");
      return reply({ mode, signingUrl: "https://app.pandadoc.com/s/" + session.id + "/" });
    }
    if (action !== "order" || !state.completed || input.acceptedPolicies !== true) throw new Rejected(409, "signed_agreement_and_policy_acceptance_required");
    if (live && (input.policyVersion !== policyVersion || (q.policy_version && q.policy_version !== policyVersion))) throw new Rejected(409, "policy_version_changed");
    if (live && q.status) throw new Rejected(409, "checkout_already_resolved");
    if (Date.now() >= state.signedAt + 30 * 60_000) throw new Rejected(409, "signed_payment_window_expired");
    if (q.order_id) return reply({ mode, orderId: q.order_id, keyId: key, amountPaise: q.amount_paise, currency: "INR" });
    await operation<Quote>("claim_order", { quoteId: q.id, signedAt: new Date(state.signedAt).toISOString(), ...(live ? { policyVersion } : {}) });
    const order = await provider<Order>("razorpay", "/orders", { amount: q.amount_paise, currency: "INR", receipt: q.id,
      notes: { mode: live ? "armature_live_desk" : "armature_connected_test" } });
    if (!/^order_[A-Za-z0-9]+$/.test(order.id) || order.receipt !== q.id || order.amount !== q.amount_paise || order.currency !== "INR") {
      throw new Rejected(502, "provider_order_mismatch");
    }
    await operation<Quote>("bind_order", { quoteId: q.id, orderId: order.id });
    return reply({ mode, orderId: order.id, keyId: key, amountPaise: q.amount_paise, currency: "INR" });
  } catch (error) {
    if (error instanceof Rejected || error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
    const status = (error as { status?: number })?.status;
    return status === 401 || status === 403 ? reply({ error: "checkout_account_required" }, status)
      : reply({ error: "checkout_unavailable" }, 503);
  }
}
