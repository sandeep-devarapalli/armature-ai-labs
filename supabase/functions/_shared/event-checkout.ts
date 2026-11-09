import { adminClient, authenticatedUser, requireStaff } from "./supabase.ts";
import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { liveWebhookSettings, orderIdPattern, paymentIdPattern, reconcileLivePayment, type Payment } from "./live-desk-payment.ts";
import { rentalProvider } from "./rental-payment.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
const hour = /^(0[89]|1\d|2[0-2]):00$/;
type Quote = {
  id: string; member_id?: string; event_date: string; start_time: string; hours: number; attendees: number; purpose: string;
  starts_at: string; ends_at: string; rent_paise: number; amount_paise: number; agreement_hash: string; policy_version: string;
  particulars?: object; prepared_at?: string | null; approved_at: string | null; payment_window_at?: string | null; document_id: string | null;
  order_id: string | null; order_claimed_at: string | null; payment_id?: string | null; refunded_amount?: number; refund_due_paise?: number | null;
  cancelled_at?: string | null; declined_at?: string | null; decline_reason?: string | null; review_reason?: string | null; status: string; bookingId?: string | null;
};
class Rejected extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
function present(q: Quote) {
  return { quoteId: q.id, date: q.event_date, startTime: q.start_time.slice(0, 5), hours: q.hours, attendees: q.attendees, purpose: q.purpose,
    startsAt: q.starts_at, endsAt: q.ends_at, rentPaise: q.rent_paise, amountPaise: q.amount_paise,
    agreementHash: q.agreement_hash, policyVersion: q.policy_version, preparedAt: q.prepared_at, approvedAt: q.approved_at,
    paymentWindowAt: q.payment_window_at ?? q.approved_at, hasAgreement: Boolean(q.document_id),
    hasOrder: Boolean(q.order_id), orderPending: Boolean(q.order_claimed_at && !q.order_id),
    refundedAmount: q.refunded_amount ?? 0, refundDuePaise: q.refund_due_paise ?? null, cancelledAt: q.cancelled_at ?? null,
    declineReason: q.decline_reason ?? null, status: q.status, reviewReason: q.review_reason ?? null, bookingId: q.bookingId ?? null };
}
const reasonOk = (value: unknown) => typeof value === "string" && value.trim().length >= 10 && value.trim().length <= 1000;

export async function handleEventCheckout(request: Request, mode: "test" | "live"): Promise<Response> {
  const origin = mode === "live" ? "https://armatureailabs.com" : "https://booking-staging.armature-lab.pages.dev";
  const prefix = mode === "live" ? "LIVE_EVENT_" : "EVENT_TEST_";
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
    || (mode === "live" && !liveWebhookSettings(provider))) return reply({ error: "event_not_configured" }, 503);
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
    // Closing checkout still lets people finish, cancel and get help with existing requests.
    const recoveryActions = ["status", "verify", "list_own", "staff_queue", "manual_review", "recover_order", "decline", "cancel"];
    if (Deno.env.get(prefix + "CHECKOUT_ENABLED") !== "true" && !recoveryActions.includes(action)) throw new Rejected(503, "checkout_disabled");
    const client = adminClient();
    let member = user.id;
    const staff = ["staff_queue", "manual_review", "prepare", "decline", "approve_manual", "reopen_payment", "recover_order"].includes(action)
      || (action === "cancel" && input.memberId !== undefined);
    if (staff) {
      if (user.claims.aal !== "aal2") throw new Rejected(403, "staff_mfa_required");
      await requireStaff(user.id, ["admin", "super_admin"]);
      if (action !== "staff_queue") {
        if (!uuid.test(input.memberId ?? "") || input.memberId === user.id) throw new Rejected(403, "independent_reviewer_required");
        member = input.memberId;
      }
    }
    const reviewer = staff ? { reviewerId: user.id, reviewerAal: "aal2" } : {};
    async function operation<T>(name: string, payload: object): Promise<T> {
      const { data, error } = await client.rpc("event_checkout", { p_action: name, p_member: member, p_input: payload })
        .abortSignal(AbortSignal.timeout(10000));
      if (error?.code === "42501") throw new Rejected(403, "event_state_rejected");
      if (error?.code === "23P01") throw new Rejected(409, "event_slot_unavailable");
      if (["22023", "P0002", "23505"].includes(error?.code ?? "")) throw new Rejected(409, "event_state_rejected");
      if (error || !data) throw new Rejected(503, "event_state_unavailable");
      return data as T;
    }
    if (action === "list_own" || action === "staff_queue") {
      const offset = input.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Rejected(400, "invalid_offset");
      const result = await operation<{ quotes: (Quote & { member_id: string })[] }>(action, { offset, ...reviewer });
      return reply({ mode, quotes: result.quotes.map(q => ({ ...present(q), ...(staff ? { memberId: q.member_id } : {}) })) });
    }
    if (action === "availability") {
      if (!date.test(input.date ?? "")) throw new Rejected(400, "invalid_selection");
      return reply({ mode, ...await operation<object>("availability", { date: input.date }) });
    }
    if (action === "quote") {
      if (!date.test(input.date ?? "") || !hour.test(input.startTime ?? "") || !Number.isInteger(input.hours) || input.hours < 1
        || Number(input.startTime.slice(0, 2)) + input.hours > 23 || !Number.isInteger(input.attendees) || input.attendees < 1
        || input.attendees > 35 || !reasonOk(input.purpose)) throw new Rejected(400, "invalid_selection");
      return reply({ mode, ...present(await operation<Quote>("quote", { date: input.date, startTime: input.startTime,
        hours: input.hours, attendees: input.attendees, purpose: input.purpose.trim() })) });
    }
    if (!uuid.test(input.quoteId ?? "")) throw new Rejected(400, "invalid_quote");
    const q = await operation<Quote>("status", { quoteId: input.quoteId });
    const customer = staff ? (await client.auth.admin.getUserById(member)).data.user?.email : user.email;
    if (!customer || customer.toLowerCase() === signer) throw new Rejected(409, "separate_signers_required");
    if (["prepare", "approve_manual", "order"].includes(action) && q.policy_version !== policyVersion) throw new Rejected(409, "policy_version_changed");
    if (action === "manual_review") return reply({ mode, ...present(q), particulars: q.particulars, customerEmail: customer, staffEmail: signer });
    if (action === "prepare") {
      const p = input.particulars;
      if (!p || typeof p !== "object" || Array.isArray(p) || p.availabilityConfirmed !== true || p.eventDetailsReviewed !== true
        || p.termsVersion !== policyVersion || !reasonOk(p.setupNotes)) throw new Rejected(400, "invalid_particulars");
      const prepared = await operation<Quote>("prepare", { quoteId: q.id, ...reviewer, particulars: {
        availabilityConfirmed: true, eventDetailsReviewed: true, termsVersion: policyVersion, setupNotes: p.setupNotes.trim() } });
      return reply({ mode, ...present(prepared), particulars: prepared.particulars, customerEmail: customer, staffEmail: signer });
    }
    if (action === "decline" || action === "cancel") {
      if (!reasonOk(input.reason) || (action === "cancel" && input.confirmed !== true)) throw new Rejected(400, "reason_required");
      return reply({ mode, ...present(await operation<Quote>(action, { quoteId: q.id, ...reviewer, reason: input.reason.trim(),
        ...(action === "cancel" ? { confirmed: true } : {}) })) });
    }
    if (action === "reopen_payment") return reply({ mode, ...present(await operation<Quote>("reopen_payment", { quoteId: q.id, ...reviewer })) });
    if (action === "approve_manual") {
      if (input.confirmed !== true || input.agreementHash !== q.agreement_hash || !/^[A-Za-z0-9_-]{8,80}$/.test(input.documentId ?? "") || !completedPdf
        || completedPdf.type !== "application/pdf" || completedPdf.size < 5 || completedPdf.size > 20 * 1024 * 1024
        || await completedPdf.slice(0, 5).text() !== "%PDF-") throw new Rejected(400, "invalid_agreement_evidence");
      const bytes = await completedPdf.arrayBuffer();
      const evidenceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
      const evidencePath = q.id + "/" + evidenceSha256 + ".pdf";
      const upload = await client.storage.from("event-agreements").upload(evidencePath, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
      if (upload.error && String((upload.error as { statusCode?: string }).statusCode) !== "409") throw new Rejected(503, "agreement_storage_unavailable");
      return reply({ mode, ...present(await operation<Quote>("approve_manual", { quoteId: q.id, ...reviewer,
        documentId: input.documentId, agreementHash: input.agreementHash, evidenceSha256, evidencePath, confirmedBothSigners: true })) });
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
      return reply({ mode, ...present(await reconcileLivePayment(provider, payment, q, operation) as Quote) });
    }
    if (action === "status") {
      if (q.order_id && !q.payment_id) {
        const payments = await provider.request<{ items: Payment[] }>("/orders/" + q.order_id + "/payments");
        if (!Array.isArray(payments.items)) throw new Rejected(502, "invalid_payments");
        const captured = payments.items.filter(p => p.captured && ["captured", "refunded"].includes(p.status));
        if (captured.length > 1) throw new Rejected(409, "multiple_payments_require_review");
        if (captured[0]) return reply({ mode, ...present(await reconcileLivePayment(provider, captured[0], q, operation) as Quote) });
      }
      return reply({ mode, ...present(q) });
    }
    if (action !== "order" || input.acceptedPolicies !== true || input.policyVersion !== policyVersion || !q.approved_at || !q.document_id) throw new Rejected(409, "approved_agreement_required");
    if (q.status !== "approved" && q.status !== "awaiting_payment") throw new Rejected(409, "checkout_already_resolved");
    const opened = Date.parse(q.payment_window_at ?? q.approved_at);
    if (!Number.isFinite(opened) || opened > Date.now() || Date.now() >= opened + 30 * 60_000) throw new Rejected(409, "signed_payment_window_expired");
    if (q.order_id) return reply({ mode, orderId: q.order_id, keyId: provider.keyId, amountPaise: q.amount_paise, currency: "INR" });
    const claimed = await operation<Quote & { claimed: boolean }>("claim_order", { quoteId: q.id });
    if (claimed.claimed !== true) {
      if (claimed.order_id) return reply({ mode, orderId: claimed.order_id, keyId: provider.keyId, amountPaise: claimed.amount_paise, currency: "INR" });
      throw new Rejected(409, "order_pending_staff_recovery");
    }
    const order = await provider.request<{ id: string; receipt: string; amount: number; currency: string }>("/orders", {
      amount: q.amount_paise, currency: "INR", receipt: q.id, notes: { purpose: "armature_event_" + mode, hours: String(q.hours) },
    });
    if (!orderIdPattern.test(order.id) || order.receipt !== q.id || order.amount !== q.amount_paise || order.currency !== "INR") throw new Rejected(502, "provider_order_mismatch");
    await operation<Quote>("bind_order", { quoteId: q.id, orderId: order.id });
    return reply({ mode, orderId: order.id, keyId: provider.keyId, amountPaise: q.amount_paise, currency: "INR" });
  } catch (error) {
    if (error instanceof Rejected || error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
    const status = (error as { status?: number })?.status;
    return reply({ error: status === 401 || status === 403 ? "checkout_account_required" : "event_checkout_unavailable" }, status === 401 || status === 403 ? status : 503);
  }
}
