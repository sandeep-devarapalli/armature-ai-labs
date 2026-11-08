import { RazorpayRequestError as PaymentError } from "./razorpay-signature.ts";

export const productionBackend = "https://uxfhdfagrmaeyuaipaar.supabase.co";
export const orderIdPattern = /^order_[A-Za-z0-9]{1,80}$/;
export const paymentIdPattern = /^pay_[A-Za-z0-9]{1,80}$/;
export const refundIdPattern = /^rfnd_[A-Za-z0-9]{1,80}$/;

export function liveRazorpay(env: (name: string) => string | undefined = name => Deno.env.get(name), fetcher = fetch) {
  const keyId = env("LIVE_DESK_RAZORPAY_KEY_ID") ?? "";
  const keySecret = env("LIVE_DESK_RAZORPAY_KEY_SECRET") ?? "";
  if (env("SUPABASE_URL") !== productionBackend || !/^rzp_live_[A-Za-z0-9]{1,80}$/.test(keyId) || keySecret.length < 12) return null;

  async function request<T>(path: string, body?: object): Promise<T> {
    const response = await fetcher("https://api.razorpay.com/v1" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Basic " + btoa(keyId + ":" + keySecret),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new PaymentError(502, "provider_request_rejected");
    return response.json() as Promise<T>;
  }
  return { keyId, keySecret, request };
}
export type LiveRazorpay = NonNullable<ReturnType<typeof liveRazorpay>>;

export function liveWebhookSettings(provider: LiveRazorpay | null, env = (name: string) => Deno.env.get(name)) {
  const secret = env("LIVE_DESK_RAZORPAY_WEBHOOK_SECRET") ?? "";
  const accountId = env("LIVE_DESK_RAZORPAY_ACCOUNT_ID") ?? "";
  if (!provider || secret.length < 32 || secret === provider.keySecret || !/^acc_[A-Za-z0-9]{1,80}$/.test(accountId)) return null;
  return { provider, secret, accountId };
}

export type Payment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured?: boolean;
  amount_refunded: number;
};
type Refund = { id: string; payment_id: string; amount: number; currency: string; status: string };
type Quote = { id: string; order_id: string | null; amount_paise: number; payment_amount_paise?: number };
type Operation = (action: string, input: object) => Promise<unknown>;

export async function reconcileLivePayment(
  provider: LiveRazorpay,
  payment: Payment,
  quote: Quote,
  operation: Operation,
  expectedRefundId?: string,
): Promise<object> {
  if (!paymentIdPattern.test(payment.id) || !quote.order_id || payment.order_id !== quote.order_id
      || payment.amount !== (quote.payment_amount_paise ?? quote.amount_paise) || payment.currency !== "INR"
      || !Number.isSafeInteger(payment.amount_refunded) || payment.amount_refunded < 0
      || payment.amount_refunded > payment.amount) {
    throw new PaymentError(409, "payment_mismatch");
  }

  if (payment.captured !== true || !["captured", "refunded"].includes(payment.status)) {
    if (expectedRefundId && payment.captured === false) return { status: "ignored" };
    throw new PaymentError(409, "payment_not_captured_for_quote");
  }

  let refundedAmount = 0;
  if (payment.amount_refunded > 0 || expectedRefundId || payment.status === "refunded") {
    const seen = new Set<string>();
    let expectedProcessed = !expectedRefundId;
    for (let skip = 0; ; skip += 100) {
      if (skip >= 1000) throw new PaymentError(503, "refund_reconciliation_limit");
      const page = await provider.request<{ items: Refund[] }>(
        "/payments/" + payment.id + "/refunds?count=100&skip=" + skip,
      );
      if (!Array.isArray(page.items) || page.items.length > 100) throw new PaymentError(502, "invalid_refund_list");
      for (const refund of page.items) {
        if (!refundIdPattern.test(refund.id) || seen.has(refund.id) || refund.payment_id !== payment.id
          || refund.currency !== "INR" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0) {
          throw new PaymentError(503, "refund_reconciliation_required");
        }
        seen.add(refund.id);
        if (refund.status !== "processed") continue;
        refundedAmount += refund.amount;
        if (refund.id === expectedRefundId) expectedProcessed = true;
      }
      if (page.items.length < 100) break;
    }
    if (!expectedProcessed || refundedAmount > payment.amount
        || refundedAmount > payment.amount_refunded
        || (payment.status === "refunded" && refundedAmount !== payment.amount)) {
      throw new PaymentError(503, "refund_reconciliation_required");
    }
  }
  const fact = { quoteId: quote.id, orderId: payment.order_id, paymentId: payment.id,
    amount: payment.amount, currency: payment.currency, refundedAmount };
  const result = await operation(refundedAmount ? "refund" : "capture", fact);
  if (!result || typeof result !== "object") throw new PaymentError(503, "checkout_state_unavailable");
  return result;
}
