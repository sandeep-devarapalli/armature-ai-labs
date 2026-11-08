import { adminClient, authenticatedUser, requireStaff } from "./supabase.ts";
import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { liveWebhookSettings, orderIdPattern, paymentIdPattern, refundIdPattern, reconcileLivePayment, type Payment } from "./live-desk-payment.ts";
import { rentalProvider } from "./rental-payment.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
type Quote = {
  id: string; parent_quote_id?: string | null; product: string; unit: string; starts_on: string; ends_on: string;
  rent_paise: number; deposit_paise: number; amount_paise: number; agreement_hash: string;
  prepared_at?: string | null; particulars?: object; operations?: object; bookingId?: string; rent_refunded?: number; deposit_refunded?: number; refunded_amount?: number; refund_allocation_pending?: boolean; policy_version: string; order_id: string | null; order_claimed_at: string | null;
  payment_id?: string | null; approved_at: string | null; document_id: string | null; status: string; review_reason?: string;
};
class Rejected extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
function present(q: Quote) {
  return { quoteId: q.id, parentQuoteId: q.parent_quote_id, product: q.product, unit: q.unit, start: q.starts_on, end: q.ends_on,
    rentPaise: q.rent_paise, depositPaise: q.deposit_paise, amountPaise: q.amount_paise,
    agreementHash: q.agreement_hash, policyVersion: q.policy_version, approvedAt: q.approved_at, preparedAt: q.prepared_at,
    hasAgreement: Boolean(q.document_id), agreementSigned: Boolean(q.approved_at && q.document_id),
    hasOrder: Boolean(q.order_id), orderPending: Boolean(q.order_claimed_at && !q.order_id),
    status: q.status, reviewReason: q.review_reason, bookingId: q.bookingId, rentRefunded: q.rent_refunded, depositRefunded: q.deposit_refunded, refundedAmount: q.refunded_amount, refundAllocationPending: q.refund_allocation_pending };
}
export async function handleRentalCheckout(request: Request, mode: "test" | "live"): Promise<Response> {
  const origin = mode === "live" ? "https://armatureailabs.com" : "https://booking-staging.armature-lab.pages.dev";
  const prefix = mode === "live" ? "LIVE_RENTAL_" : "RENTAL_TEST_";
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (value: object, status = 200) => Response.json(value, { status, headers });
  if (request.headers.get("origin") !== origin) return reply({ error: "checkout_origin_required" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const provider = rentalProvider(mode);
  const signer = Deno.env.get(prefix + "PANDADOC_SIGNER")?.trim().toLowerCase() ?? "";
  const policyVersion = Deno.env.get(prefix + "POLICY_VERSION") ?? "";
  if (!provider || !signer || !/^[A-Za-z0-9._-]{4,80}$/.test(policyVersion)
    || (mode === "live" && !liveWebhookSettings(provider))) return reply({ error: "rental_not_configured" }, 503);
  try {
    const user = await authenticatedUser(request);
    let input;
    let completedPdf: File | null = null;
    try {
      if (request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
        const raw = await bodyBytes(request, 20 * 1024 * 1024 + 16384);
        const form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: new Uint8Array(raw).buffer }).formData();
        const metadata = form.get("metadata");
        if (typeof metadata !== "string" || metadata.length > 8192) throw new Error("Invalid metadata");
        input = JSON.parse(metadata);
        const pdf = form.get("completedPdf");
        if (!pdf || typeof pdf === "string") throw new Error("Missing completed PDF");
        completedPdf = pdf;
      } else input = JSON.parse(new TextDecoder().decode(await bodyBytes(request, 8192)));
    }
    catch { throw new Rejected(400, "invalid_request"); }
    if (!input || typeof input !== "object" || typeof input.action !== "string") throw new Rejected(400, "invalid_request");
    const action = input.action;
    const recoveryActions = ["status", "verify", "list_own", "staff_queue", "manual_review", "recover_order", "handover", "return", "allocate_refund"];
    if (Deno.env.get(prefix + "CHECKOUT_ENABLED") !== "true" && !recoveryActions.includes(action)) throw new Rejected(503, "checkout_disabled");
    const client = adminClient();
    let member = user.id;
    const staff = ["staff_queue", "manual_review", "prepare", "renewal_quote", "approve_manual", "recover_order", "handover", "return", "allocate_refund"].includes(action);
    if (staff) {
      if (user.claims.aal !== "aal2") throw new Rejected(403, "staff_mfa_required");
      await requireStaff(user.id, ["admin", "super_admin"]);
      if (action !== "staff_queue") {
        if (!uuid.test(input.memberId ?? "") || input.memberId === user.id) throw new Rejected(403, "independent_reviewer_required");
        member = input.memberId;
      }
    }
    async function operation<T>(name: string, payload: object): Promise<T> {
      const { data, error } = await client.rpc("rental_checkout", { p_action: name, p_member: member, p_input: payload })
        .abortSignal(AbortSignal.timeout(10000));
      if (error?.code === "42501") throw new Rejected(403, "rental_state_rejected");
      if (["22023", "P0002", "23505", "23P01"].includes(error?.code ?? "")) throw new Rejected(409, "rental_state_rejected");
      if (error || !data) throw new Rejected(503, "rental_state_unavailable");
      return data as T;
    }
    if (action === "list_own" || action === "staff_queue") {
      const offset = input.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Rejected(400, "invalid_offset");
      const result = await operation<{ quotes: (Quote & { member_id: string })[] }>(action, { offset, ...(staff ? { reviewerId: user.id, reviewerAal: "aal2" } : {}) });
      return reply({ mode, quotes: result.quotes.map(q => ({ ...present(q), ...(staff ? { memberId: q.member_id } : {}) })) });
    }
    if (action === "availability" || action === "quote") {
      if (!["cabin101", "hiwonder"].includes(input.product) || !date.test(input.start ?? "")
        || (input.product === "cabin101" ? !date.test(input.end ?? "") : !["week", "month"].includes(input.unit))) throw new Rejected(400, "invalid_selection");
      const result = await operation<Quote>(action, { product: input.product, unit: input.unit, start: input.start, end: input.end, partyType: input.partyType, policyVersion });
      return reply({ mode, ...(action === "quote" ? present(result) : result) });
    }
    if (action === "renewal_quote") {
      if (!uuid.test(input.parentQuoteId ?? "") || !date.test(input.start ?? "")) throw new Rejected(400, "invalid_renewal");
      return reply({ mode, ...present(await operation<Quote>("renewal_quote", { parentQuoteId: input.parentQuoteId,
        start: input.start, reviewerId: user.id, reviewerAal: "aal2", policyVersion })) });
    }
    if (!uuid.test(input.quoteId ?? "")) throw new Rejected(400, "invalid_quote");
    const q = await operation<Quote>("status", { quoteId: input.quoteId });
    const customer = staff ? (await client.auth.admin.getUserById(member)).data.user?.email : user.email;
    if (!customer || customer.toLowerCase() === signer) throw new Rejected(409, "separate_signers_required");
    if (["prepare", "approve_manual", "order"].includes(action) && q.policy_version !== policyVersion) throw new Rejected(409, "policy_version_changed");
    if (action === "manual_review") return reply({ mode, ...present(q), particulars: q.particulars, operations: q.operations, customerEmail: customer, staffEmail: signer });
    if (action === "prepare") {
      if (!input.particulars || typeof input.particulars !== "object" || Array.isArray(input.particulars)) throw new Rejected(400, "invalid_particulars");
      const prepared = await operation<Quote>("prepare", { quoteId: q.id, reviewerId: user.id, reviewerAal: "aal2", particulars: input.particulars });
      return reply({ mode, ...present(prepared), particulars: prepared.particulars, operations: prepared.operations, customerEmail: customer, staffEmail: signer });
    }
    if (action === "approve_manual") {
      if (input.confirmed !== true || input.agreementHash !== q.agreement_hash
        || !/^[A-Za-z0-9_-]{8,80}$/.test(input.documentId ?? "") || !completedPdf
        || completedPdf.type !== "application/pdf" || completedPdf.size < 5 || completedPdf.size > 20 * 1024 * 1024
        || await completedPdf.slice(0, 5).text() !== "%PDF-") throw new Rejected(400, "invalid_agreement_evidence");
      const bytes = await completedPdf.arrayBuffer();
      const evidenceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
      const evidencePath = q.id + "/" + evidenceSha256 + ".pdf";
      const upload = await client.storage.from("rental-agreements").upload(evidencePath, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
      if (upload.error && String((upload.error as { statusCode?: string }).statusCode) !== "409") throw new Rejected(503, "agreement_storage_unavailable");
      const result = await operation<Quote>("approve_manual", { quoteId: q.id, reviewerId: user.id, reviewerAal: "aal2",
        documentId: input.documentId, agreementHash: input.agreementHash, evidenceSha256, evidencePath,
        confirmedBothSigners: true });
      return reply({ mode, ...present(result) });
    }
    if (action === "handover" || action === "return") {
      if (typeof input.evidence !== "string" || input.evidence.trim().length < 10 || input.evidence.length > 4000) throw new Rejected(400, "condition_evidence_required");
      const updated = await operation<Quote>(action, { quoteId: q.id, reviewerId: user.id, reviewerAal: "aal2", evidence: input.evidence.trim() });
      return reply({ mode, ...present(updated), particulars: updated.particulars, operations: updated.operations, customerEmail: customer, staffEmail: signer });
    }
    if (action === "allocate_refund") {
      if (!q.payment_id || !refundIdPattern.test(input.refundId ?? "") || !Number.isSafeInteger(input.rentPaise)
        || !Number.isSafeInteger(input.depositPaise) || input.rentPaise < 0 || input.depositPaise < 0
        || input.rentPaise + input.depositPaise <= 0 || typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 1000) throw new Rejected(400, "invalid_refund_allocation");
      const refund = await provider.request<{ id: string; payment_id: string; amount: number; currency: string; status: string }>("/refunds/" + input.refundId);
      if (refund.id !== input.refundId || refund.payment_id !== q.payment_id || refund.currency !== "INR"
        || refund.status !== "processed" || refund.amount !== input.rentPaise + input.depositPaise) throw new Rejected(409, "refund_mismatch");
      const payment = await provider.request<Payment>("/payments/" + q.payment_id);
      if (payment.id !== q.payment_id) throw new Rejected(409, "payment_mismatch");
      await reconcileLivePayment(provider, payment, q, operation, refund.id);
      return reply({ mode, ...present(await operation<Quote>("allocate_refund", { quoteId: q.id, reviewerId: user.id,
        reviewerAal: "aal2", refundId: refund.id, rentPaise: input.rentPaise, depositPaise: input.depositPaise, reason: input.reason.trim() })) });
    }
    if (action === "recover_order") {
      if (!q.order_claimed_at || !q.approved_at || !q.document_id || !orderIdPattern.test(input.orderId ?? "")
        || (q.order_id && q.order_id !== input.orderId)) throw new Rejected(409, "order_recovery_unavailable");
      const order = await provider.request<{ id: string; receipt: string; amount: number; currency: string }>("/orders/" + input.orderId);
      if (order.id !== input.orderId || order.receipt !== q.id || order.amount !== q.amount_paise || order.currency !== "INR") throw new Rejected(409, "provider_order_mismatch");
      return reply({ mode, ...present(await operation<Quote>("bind_order", { quoteId: q.id, orderId: order.id })), recovered: true });
    }
    if (action === "verify") {
      if (!q.order_id || input.razorpay_order_id !== q.order_id || !paymentIdPattern.test(input.razorpay_payment_id ?? "")
        || !await validHmac(provider.keySecret, new TextEncoder().encode(q.order_id + "|" + input.razorpay_payment_id), input.razorpay_signature)) throw new Rejected(400, "invalid_callback");
      const payment = await provider.request<Payment>("/payments/" + input.razorpay_payment_id);
      if (payment.id !== input.razorpay_payment_id) throw new Rejected(409, "payment_mismatch");
      return reply({ mode, ...present(q), ...await reconcileLivePayment(provider, payment, q, operation) });
    }
    if (action === "status") {
      if (q.order_id) {
        const payments = await provider.request<{ items: Payment[] }>("/orders/" + q.order_id + "/payments");
        if (!Array.isArray(payments.items)) throw new Rejected(502, "invalid_payments");
        const captured = payments.items.filter(p => p.captured && ["captured", "refunded"].includes(p.status));
        if (captured.length > 1) throw new Rejected(409, "multiple_payments_require_review");
        if (captured[0]) return reply({ mode, ...present(q), ...await reconcileLivePayment(provider, captured[0], q, operation) });
      }
      return reply({ mode, ...present(q) });
    }
    if (action !== "order" || input.acceptedPolicies !== true || input.policyVersion !== policyVersion || !q.approved_at || !q.document_id) throw new Rejected(409, "approved_agreement_required");
    if (["confirmed", "refunded", "needs_review", "superseded"].includes(q.status)) throw new Rejected(409, "checkout_already_resolved");
    const approved = Date.parse(q.approved_at);
    if (!Number.isFinite(approved) || approved > Date.now() || Date.now() >= approved + 30 * 60_000) throw new Rejected(409, "signed_payment_window_expired");
    if (q.order_id) return reply({ mode, orderId: q.order_id, keyId: provider.keyId, amountPaise: q.amount_paise, currency: "INR" });
    const claimed = await operation<Quote & { claimed: boolean }>("claim_order", { quoteId: q.id, policyVersion });
    if (claimed.claimed !== true) {
      if (claimed.order_id) return reply({ mode, orderId: claimed.order_id, keyId: provider.keyId, amountPaise: claimed.amount_paise, currency: "INR" });
      throw new Rejected(409, "order_pending_staff_recovery");
    }
    const order = await provider.request<{ id: string; receipt: string; amount: number; currency: string }>("/orders", {
      amount: q.amount_paise, currency: "INR", receipt: q.id, notes: { purpose: "armature_rental_" + mode, product: q.product },
    });
    if (!orderIdPattern.test(order.id) || order.receipt !== q.id || order.amount !== q.amount_paise || order.currency !== "INR") throw new Rejected(502, "provider_order_mismatch");
    await operation<Quote>("bind_order", { quoteId: q.id, orderId: order.id });
    return reply({ mode, orderId: order.id, keyId: provider.keyId, amountPaise: q.amount_paise, currency: "INR" });
  } catch (error) {
    if (error instanceof Rejected || error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
    const status = (error as { status?: number })?.status;
    return reply({ error: status === 401 || status === 403 ? "checkout_account_required" : "rental_checkout_unavailable" }, status === 401 || status === 403 ? status : 503);
  }
}
