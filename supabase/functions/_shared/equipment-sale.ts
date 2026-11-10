import { adminClient, authenticatedUser, requireStaff } from "./supabase.ts";
import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { liveWebhookSettings, orderIdPattern, paymentIdPattern, reconcileLivePayment, type Payment } from "./live-desk-payment.ts";
import { rentalProvider } from "./rental-payment.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const code = /^[a-z0-9-]{2,40}$/;
type Sale = {
  id: string; member_id?: string; amount_paise: number; status: string; created_at: string; checked_at: string | null;
  paymentExpiresAt: string | null; order_id: string | null; order_claimed_at: string | null; payment_id?: string | null;
  refunded_amount?: number; refund_approved_at?: string | null; collected_at?: string | null; decline_reason?: string | null;
  review_reason?: string | null; lines: { code: string; name: string; maker: string | null; pricePaise: number }[];
};
class Rejected extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
const present = (s: Sale) => ({ saleId: s.id, amountPaise: s.amount_paise, status: s.status, lines: s.lines, createdAt: s.created_at,
  checkedAt: s.checked_at, paymentExpiresAt: s.paymentExpiresAt, hasOrder: Boolean(s.order_id), orderPending: Boolean(s.order_claimed_at && !s.order_id),
  refundedAmount: s.refunded_amount ?? 0, refundApprovedAt: s.refund_approved_at ?? null, collectedAt: s.collected_at ?? null,
  declineReason: s.decline_reason ?? null, reviewReason: s.review_reason ?? null });
const reasonOk = (value: unknown) => typeof value === "string" && value.trim().length >= 10 && value.trim().length <= 1000;

// In-lab equipment sales: staff confirm the buyer checked the item, then only that buyer can pay within 30 minutes.
export async function handleEquipmentSale(request: Request, mode: "test" | "live"): Promise<Response> {
  const origin = mode === "live" ? "https://armatureailabs.com" : "https://booking-staging.armature-lab.pages.dev";
  const prefix = mode === "live" ? "LIVE_SALE_" : "SALE_TEST_";
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (value: object, status = 200) => Response.json(value, { status, headers });
  if (request.headers.get("origin") !== origin) return reply({ error: "checkout_origin_required" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const provider = rentalProvider(mode);
  if (!provider || (mode === "live" && !liveWebhookSettings(provider))) return reply({ error: "sale_not_configured" }, 503);
  try {
    const user = await authenticatedUser(request);
    let input;
    try { input = JSON.parse(new TextDecoder().decode(await bodyBytes(request, 8192))); }
    catch { throw new Rejected(400, "invalid_request"); }
    if (!input || typeof input !== "object" || typeof input.action !== "string") throw new Rejected(400, "invalid_request");
    const action = input.action;
    // Closing sales still lets people finish, cancel and get help with existing requests.
    const recoveryActions = ["status", "verify", "list_own", "staff_queue", "recover_order", "decline", "cancel", "mark_collected", "approve_refund"];
    if (Deno.env.get(prefix + "CHECKOUT_ENABLED") !== "true" && !recoveryActions.includes(action)) throw new Rejected(503, "checkout_disabled");
    const client = adminClient();
    let member = user.id;
    const staff = ["staff_queue", "mark_checked", "reopen_payment", "decline", "mark_collected", "approve_refund", "recover_order"].includes(action);
    if (staff) {
      if (user.claims.aal !== "aal2") throw new Rejected(403, "staff_mfa_required");
      await requireStaff(user.id, ["admin", "super_admin"]);
      if (action !== "staff_queue") {
        if (!uuid.test(input.memberId ?? "") || input.memberId === user.id) throw new Rejected(403, "independent_reviewer_required");
        member = input.memberId;
      }
    }
    const reviewer = staff ? { reviewerId: user.id, reviewerAal: "aal2" } : {};
    // Shared payment reconciliation names the record quoteId; the sale ledger calls it saleId.
    async function operation<T>(name: string, payload: object): Promise<T> {
      const { quoteId, ...rest } = payload as { quoteId?: string };
      const { data, error } = await client.rpc("equipment_sale", { p_action: name, p_member: member, p_input: quoteId ? { saleId: quoteId, ...rest } : rest })
        .abortSignal(AbortSignal.timeout(10000));
      if (error?.code === "42501") throw new Rejected(403, "sale_state_rejected");
      if (error?.code === "23P01") throw new Rejected(409, "sale_out_of_stock");
      if (error?.code === "23505") throw new Rejected(409, "sale_already_requested");
      if (["22023", "P0002"].includes(error?.code ?? "")) throw new Rejected(409, "sale_state_rejected");
      if (error || !data) throw new Rejected(503, "sale_state_unavailable");
      return data as T;
    }
    if (action === "list_own" || action === "staff_queue") {
      const offset = input.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Rejected(400, "invalid_offset");
      const result = await operation<{ sales: Sale[] }>(action, { offset, ...reviewer });
      return reply({ mode, sales: result.sales.map(s => ({ ...present(s), ...(staff ? { memberId: s.member_id } : {}) })) });
    }
    if (action === "request") {
      const items = input.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 2 || new Set(items).size !== items.length
        || !items.every(item => typeof item === "string" && code.test(item))) throw new Rejected(400, "invalid_selection");
      return reply({ mode, ...present(await operation<Sale>("request", { items })) });
    }
    if (!uuid.test(input.saleId ?? "")) throw new Rejected(400, "invalid_sale");
    const s = await operation<Sale>("status", { quoteId: input.saleId });
    if (action === "mark_checked") {
      if (input.itemChecked !== true) throw new Rejected(400, "item_check_required");
      return reply({ mode, ...present(await operation<Sale>("mark_checked", { quoteId: s.id, ...reviewer, itemChecked: true })) });
    }
    if (action === "reopen_payment" || action === "mark_collected") return reply({ mode, ...present(await operation<Sale>(action, { quoteId: s.id, ...reviewer })) });
    if (action === "decline" || action === "cancel" || action === "approve_refund") {
      if (!reasonOk(input.reason) || (action === "cancel" && input.confirmed !== true)) throw new Rejected(400, "reason_required");
      return reply({ mode, ...present(await operation<Sale>(action, { quoteId: s.id, ...reviewer, reason: input.reason.trim(),
        ...(action === "cancel" ? { confirmed: true } : {}) })) });
    }
    if (action === "recover_order") {
      if (!s.order_claimed_at || !s.checked_at || !orderIdPattern.test(input.orderId ?? "")
        || (s.order_id && s.order_id !== input.orderId)) throw new Rejected(409, "order_recovery_unavailable");
      const order = await provider.request<{ id: string; receipt: string; amount: number; currency: string }>("/orders/" + input.orderId);
      if (order.id !== input.orderId || order.receipt !== s.id || order.amount !== s.amount_paise || order.currency !== "INR") throw new Rejected(409, "provider_order_mismatch");
      return reply({ mode, ...present(await operation<Sale>("bind_order", { quoteId: s.id, orderId: order.id })), recovered: true });
    }
    if (action === "verify") {
      if (!s.order_id || input.razorpay_order_id !== s.order_id || !paymentIdPattern.test(input.razorpay_payment_id ?? "")
        || !await validHmac(provider.keySecret, new TextEncoder().encode(s.order_id + "|" + input.razorpay_payment_id), input.razorpay_signature)) throw new Rejected(400, "invalid_callback");
      const payment = await provider.request<Payment>("/payments/" + input.razorpay_payment_id);
      if (payment.id !== input.razorpay_payment_id) throw new Rejected(409, "payment_mismatch");
      return reply({ mode, ...present(await reconcileLivePayment(provider, payment, s, operation) as Sale) });
    }
    if (action === "status") {
      if (s.order_id && !s.payment_id) {
        const payments = await provider.request<{ items: Payment[] }>("/orders/" + s.order_id + "/payments");
        if (!Array.isArray(payments.items)) throw new Rejected(502, "invalid_payments");
        const captured = payments.items.filter(p => p.captured && ["captured", "refunded"].includes(p.status));
        if (captured.length > 1) throw new Rejected(409, "multiple_payments_require_review");
        if (captured[0]) return reply({ mode, ...present(await reconcileLivePayment(provider, captured[0], s, operation) as Sale) });
      }
      return reply({ mode, ...present(s) });
    }
    if (action !== "order" || input.acceptedTerms !== true) throw new Rejected(409, "accepted_terms_required");
    if (s.status !== "ready_to_pay" && s.status !== "awaiting_payment") throw new Rejected(409, "checkout_already_resolved");
    const expires = Date.parse(s.paymentExpiresAt ?? "");
    if (!Number.isFinite(expires) || Date.now() >= expires) throw new Rejected(409, "signed_payment_window_expired");
    if (s.order_id) return reply({ mode, orderId: s.order_id, keyId: provider.keyId, amountPaise: s.amount_paise, currency: "INR" });
    const claimed = await operation<Sale & { claimed: boolean }>("claim_order", { quoteId: s.id });
    if (claimed.claimed !== true) {
      if (claimed.order_id) return reply({ mode, orderId: claimed.order_id, keyId: provider.keyId, amountPaise: claimed.amount_paise, currency: "INR" });
      throw new Rejected(409, "order_pending_staff_recovery");
    }
    const order = await provider.request<{ id: string; receipt: string; amount: number; currency: string }>("/orders", {
      amount: s.amount_paise, currency: "INR", receipt: s.id, notes: { purpose: "armature_sale_" + mode, items: s.lines.map(l => l.code).join(",") },
    });
    if (!orderIdPattern.test(order.id) || order.receipt !== s.id || order.amount !== s.amount_paise || order.currency !== "INR") throw new Rejected(502, "provider_order_mismatch");
    await operation<Sale>("bind_order", { quoteId: s.id, orderId: order.id });
    return reply({ mode, orderId: order.id, keyId: provider.keyId, amountPaise: s.amount_paise, currency: "INR" });
  } catch (error) {
    if (error instanceof Rejected || error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
    const status = (error as { status?: number })?.status;
    return reply({ error: status === 401 || status === 403 ? "checkout_account_required" : "sale_checkout_unavailable" }, status === 401 || status === 403 ? status : 503);
  }
}
