import { adminClient, authenticatedUser } from "./supabase.ts";
import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { liveWebhookSettings, orderIdPattern, paymentIdPattern, type LiveRazorpay, type Payment } from "./live-desk-payment.ts";
import { rentalProvider } from "./rental-payment.ts";

type Mode = "test" | "live";
type Pass = {
  id?: string | null;
  member_id?: string;
  amount_paise: number;
  status: string;
  eligible: boolean;
  order_id?: string | null;
  payment_id?: string | null;
  captured_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  refund_requested_at?: string | null;
  refunded_amount?: number | null;
  claimed?: boolean;
};
type Order = { id: string; receipt: string; amount: number; currency: string };
type Operation = (action: string, member: string | null, input: object) => Promise<Pass>;
const amountPaise = 10000000;
const passIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function operateGoldenPass(action: string, member: string | null, input: object): Promise<Pass> {
  const { data, error } = await adminClient().rpc("golden_pass_checkout", {
    p_action: action, p_member: member, p_input: input,
  }).abortSignal(AbortSignal.timeout(10000));
  if (error?.code === "42501") throw new RazorpayRequestError(403, "golden_pass_not_eligible");
  if (error && ["22023", "P0002", "23505"].includes(error.code)) throw new RazorpayRequestError(409, "golden_pass_state_rejected");
  if (error || !data) throw new RazorpayRequestError(503, "golden_pass_state_unavailable");
  return data as Pass;
}

export function applyGoldenPayment(
  operation: Operation, action: string, input: object, confirmedAt?: string,
) {
  return operation(action, null, confirmedAt ? { ...input, confirmedAt } : input);
}

function boundPass(pass: Pass) {
  if (!pass.id || !passIdPattern.test(pass.id) || !pass.order_id || !orderIdPattern.test(pass.order_id) || pass.amount_paise !== amountPaise) {
    throw new RazorpayRequestError(409, "golden_pass_order_unavailable");
  }
  return { id: pass.id, order_id: pass.order_id, amount_paise: pass.amount_paise };
}

function assertCapturedPayment(payment: Payment, bound: ReturnType<typeof boundPass>) {
  if (!paymentIdPattern.test(payment.id) || payment.order_id !== bound.order_id ||
      payment.amount !== bound.amount_paise || payment.currency !== "INR") {
    throw new RazorpayRequestError(409, "payment_mismatch");
  }
  if (payment.captured !== true || !["captured", "refunded"].includes(payment.status)) {
    throw new RazorpayRequestError(409, "payment_not_captured_for_quote");
  }
}

async function orderCapturePending(provider: LiveRazorpay, pass: Pass): Promise<boolean> {
  const bound = boundPass(pass);
  const result = await provider.request<{ items: Payment[] }>("/orders/" + bound.order_id + "/payments");
  if (!Array.isArray(result.items)) throw new RazorpayRequestError(502, "invalid_payments");
  const captured = result.items.filter(p => p.captured === true && ["captured", "refunded"].includes(p.status));
  if (captured.length > 1) throw new RazorpayRequestError(409, "multiple_payments_require_review");
  if (!captured.length) return false;
  assertCapturedPayment(captured[0], bound);
  return true;
}

async function createOrRecoverOrder(provider: LiveRazorpay, pass: Pass, mode: Mode): Promise<Order> {
  const id = pass.id;
  if (!id || !passIdPattern.test(id) || pass.amount_paise !== amountPaise) throw new RazorpayRequestError(409, "golden_pass_order_unavailable");
  // After an ambiguous create, recover by the exact ledger receipt. Never send a second create.
  let order: Order;
  if (pass.claimed === true) {
    order = await provider.request<Order>("/orders", { amount: amountPaise, currency: "INR", receipt: id,
      notes: { purpose: "armature_golden_pass_" + mode } });
  } else {
    const result = await provider.request<{ items: Order[] }>("/orders?receipt=" + encodeURIComponent(id) + "&count=2");
    if (!Array.isArray(result.items) || result.items.length !== 1) {
      throw new RazorpayRequestError(409, "order_pending_staff_recovery");
    }
    order = result.items[0];
  }
  if (!orderIdPattern.test(order?.id) || order.receipt !== id || order.amount !== amountPaise || order.currency !== "INR") {
    throw new RazorpayRequestError(409, "provider_order_mismatch");
  }
  return order;
}

type Dependencies = {
  env: (name: string) => string | undefined;
  provider: (mode: Mode, env: Dependencies["env"]) => LiveRazorpay | null;
  authenticate: (request: Request) => Promise<{ id: string }>;
  operate: Operation;
};
const defaults: Dependencies = {
  env: name => Deno.env.get(name),
  provider: rentalProvider,
  authenticate: authenticatedUser,
  operate: operateGoldenPass,
};
const origins = { live: "https://armatureailabs.com", test: "https://booking-staging.armature-lab.pages.dev" };

export async function handleGoldenPass(request: Request, mode: Mode, deps = defaults): Promise<Response> {
  const { env, authenticate, operate } = deps;
  const origin = origins[mode];
  const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (body: object, status = 200) => Response.json(body, { status, headers });
  if (request.headers.get("origin") !== origin) return reply({ error: "checkout_origin_required" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  // The provider pins the database and key mode. No TEST flow can write to the production ledger.
  const provider = deps.provider(mode, env);
  const checkoutAvailable = Boolean(provider && (mode === "live"
    ? env("LIVE_GOLDEN_CHECKOUT_ENABLED") === "true" && env("LIVE_GOLDEN_WEBHOOK_ENABLED") === "true" && liveWebhookSettings(provider, env)
    : env("GOLDEN_TEST_CHECKOUT_ENABLED") === "true"));
  const present = (pass: Pass, paymentConfirmationPending = false) => {
    const captureTime = Date.parse(pass.captured_at ?? "");
    const cutoff = captureTime + 30 * 86400000;
    const now = Date.now();
    const refundedAmount = pass.refunded_amount ?? 0;
    return { mode, checkoutAvailable, paymentConfirmationPending,
      status: pass.status, eligible: pass.eligible,
      passId: pass.id ?? null, amountPaise: pass.amount_paise, hasOrder: Boolean(pass.order_id),
      startsAt: pass.starts_at ?? null, endsAt: pass.ends_at ?? null,
      refundRequestedAt: pass.refund_requested_at ?? null, refundedAmount,
      refundEligibleUntil: Number.isFinite(cutoff) ? new Date(cutoff).toISOString() : null,
      canRequestRefund: !pass.refund_requested_at && refundedAmount < pass.amount_paise && captureTime <= now && now <= cutoff,
    };
  };
  try {
    if (!provider) throw new RazorpayRequestError(503, "golden_pass_not_configured");
    const user = await authenticate(request);
    let input;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await bodyBytes(request, 8192))); }
    catch (error) {
      if (error instanceof RazorpayRequestError) throw error;
      throw new RazorpayRequestError(400, "invalid_request");
    }
    if (!input || typeof input !== "object" || !["status", "order", "verify", "request_refund"].includes(input.action)) {
      throw new RazorpayRequestError(400, "invalid_request");
    }

    let pass = await operate("status", user.id, {});
    if (input.action === "status") {
      const captured = Boolean(pass.order_id && !pass.payment_id && await orderCapturePending(provider, pass));
      if (captured) pass = await operate("status", user.id, {});
      return reply(present(pass, captured && !pass.payment_id));
    }
    if (input.action === "request_refund") {
      if (!pass.id) throw new RazorpayRequestError(409, "golden_pass_state_rejected");
      return reply(present(await operate("request_refund", user.id, { quoteId: pass.id })));
    }
    if (input.action === "verify") {
      const bound = boundPass(pass);
      const paymentId = input.razorpay_payment_id;
      if (input.razorpay_order_id !== bound.order_id || typeof paymentId !== "string" || !paymentIdPattern.test(paymentId)
        || !await validHmac(provider.keySecret, new TextEncoder().encode(bound.order_id + "|" + paymentId), input.razorpay_signature)) {
        throw new RazorpayRequestError(400, "invalid_callback");
      }
      const payment = await provider.request<Payment>("/payments/" + paymentId);
      if (payment.id !== paymentId) throw new RazorpayRequestError(409, "payment_mismatch");
      assertCapturedPayment(payment, bound);
      pass = await operate("status", user.id, {});
      return reply(present(pass, !pass.payment_id));
    }

    if (!checkoutAvailable) throw new RazorpayRequestError(503, "checkout_disabled");
    if (input.acceptedTerms !== true) throw new RazorpayRequestError(400, "accepted_terms_required");
    if (!pass.eligible) throw new RazorpayRequestError(403, "golden_pass_not_eligible");
    if (pass.order_id && !pass.payment_id && await orderCapturePending(provider, pass)) {
      pass = await operate("status", user.id, {});
      return reply(present(pass, !pass.payment_id));
    }
    // Rechecks eligibility, consent and lifecycle in the serialised database operation before opening Checkout.
    pass = await operate("claim_order", user.id, { acceptedTerms: true });
    if (!pass.eligible || !["order_pending", "awaiting_payment"].includes(pass.status)) {
      throw new RazorpayRequestError(409, "golden_pass_state_rejected");
    }
    if (!pass.order_id) {
      const order = await createOrRecoverOrder(provider, pass, mode);
      pass = await operate("bind_order", user.id, { quoteId: pass.id, orderId: order.id });
    }
    const bound = boundPass(pass);
    if (await orderCapturePending(provider, pass)) {
      pass = await operate("status", user.id, {});
      return reply(present(pass, !pass.payment_id));
    }
    return reply({ mode, orderId: bound.order_id, keyId: provider.keyId, amountPaise, currency: "INR" });
  } catch (error) {
    if (error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
    const status = (error as { status?: number })?.status;
    return status === 401 || status === 403
      ? reply({ error: "checkout_account_required" }, status)
      : reply({ error: "golden_pass_checkout_unavailable" }, 503);
  }
}
