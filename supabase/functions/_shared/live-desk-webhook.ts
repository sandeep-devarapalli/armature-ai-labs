import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { type LiveRazorpay, orderIdPattern, type Payment, paymentIdPattern,
  reconcileLivePayment, refundIdPattern } from "./live-desk-payment.ts";

type Quote = { checkout_kind?: "desk" | "rental" | "event" | "sale"; id: string; order_id: string | null; amount_paise: number };
type WebhookDependencies = {
  config: () => { provider: LiveRazorpay; secret: string; accountId: string } | null;
  lookup: (orderId: string) => Promise<Quote | null>;
  apply: (action: string, input: object, quote: Quote) => Promise<unknown>;
};

export function createLiveDeskWebhook({ config, lookup, apply }: WebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    try {
      if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
      const settings = config();
      if (!settings) return reply({ error: "webhook_not_configured" }, 503);
      const eventId = request.headers.get("x-razorpay-event-id");
      if (!eventId || !/^[A-Za-z0-9_-]{1,120}$/.test(eventId)) return reply({ error: "invalid_event_id" }, 400);
      const raw = await bodyBytes(request);
      if (!await validHmac(settings.secret, raw, request.headers.get("x-razorpay-signature"))) {
        return reply({ error: "invalid_signature" }, 401);
      }
      let event;
      try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
      catch { return reply({ error: "invalid_payload" }, 400); }
      if (event?.entity !== "event" || event?.account_id !== settings.accountId) {
        return reply({ error: "invalid_event_account" }, 403);
      }
      if (!["payment.captured", "refund.processed"].includes(event.event)) return reply({ received: true });

      const refund = event.event === "refund.processed" ? event.payload?.refund?.entity : null;
      const paymentId = refund?.payment_id ?? event.payload?.payment?.entity?.id;
      if (typeof paymentId !== "string" || !paymentIdPattern.test(paymentId)
        || (event.event === "refund.processed" && (refund?.status !== "processed"
          || typeof refund?.id !== "string" || !refundIdPattern.test(refund.id)))) {
        return reply({ error: "invalid_event_payment" }, 400);
      }
      const snapshotOrder = event.payload?.payment?.entity?.order_id;
      const lookupBySnapshot = typeof snapshotOrder === "string" && orderIdPattern.test(snapshotOrder);
      let quote = lookupBySnapshot ? await lookup(snapshotOrder) : null;
      if (lookupBySnapshot && !quote) return reply({ received: true });
      const payment = await settings.provider.request<Payment>("/payments/" + paymentId);
      if (payment.id !== paymentId || (lookupBySnapshot && payment.order_id !== snapshotOrder)) {
        throw new RazorpayRequestError(409, "payment_mismatch");
      }
      if (!orderIdPattern.test(payment.order_id)) return reply({ received: true });
      quote ??= await lookup(payment.order_id);
      if (quote) await reconcileLivePayment(settings.provider, payment, quote, (action, input) => apply(action, input, quote!), refund?.id);
      return reply({ received: true });
    } catch (error) {
      if (error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
      return reply({ error: "webhook_reconciliation_unavailable" }, 503);
    }
  };
}
