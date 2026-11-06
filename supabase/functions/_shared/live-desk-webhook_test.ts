import { hmacHex } from "./razorpay-signature.ts";
import { liveRazorpay, productionBackend } from "./live-desk-payment.ts";
import { createLiveDeskWebhook } from "./live-desk-webhook.ts";

const secret = "synthetic-independent-webhook-secret";
const accountId = "acc_SyntheticAccount";
const quote = { id: "quote", order_id: "order_Desk", amount_paise: 35000 };
const payment = { id: "pay_Desk", order_id: quote.order_id, amount: 35000, currency: "INR",
  status: "captured", captured: true, amount_refunded: 0 };
const refund = { id: "rfnd_Desk", payment_id: payment.id, amount: 10000, currency: "INR", status: "processed" };
function expect(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unexpected webhook result: " + JSON.stringify(actual));
}
function setup() {
  let currentPayment = payment;
  let refunds = [refund];
  let fail = false;
  const calls: string[] = [];
  const facts: { action: string; input: object }[] = [];
  const vars: Record<string, string> = { SUPABASE_URL: productionBackend,
    LIVE_DESK_RAZORPAY_KEY_ID: "rzp_live_Synthetic", LIVE_DESK_RAZORPAY_KEY_SECRET: "synthetic-api-key-secret" };
  const fetcher: typeof fetch = async input => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (fail) return new Response(null, { status: 503 });
    return Response.json(path.endsWith("/refunds") ? { items: refunds } : currentPayment);
  };
  const handler = createLiveDeskWebhook({
    config: () => {
      const provider = liveRazorpay(name => vars[name], fetcher);
      return provider && { provider, secret, accountId };
    },
    lookup: async orderId => orderId === quote.order_id ? quote : null,
    apply: async (action, input) => { facts.push({ action, input }); return { status: "confirmed" }; },
  });
  async function post(event = "payment.captured", opts: { wrongAccount?: boolean; unsigned?: boolean; order?: string } = {}) {
    const body = JSON.stringify({ entity: "event", account_id: opts.wrongAccount ? "acc_other" : accountId, event,
      payload: { payment: { entity: { ...payment, order_id: opts.order ?? payment.order_id } }, refund: { entity: refund } } });
    const signature = await hmacHex(secret, new TextEncoder().encode(body + (opts.unsigned ? " " : "")));
    return handler(new Request("https://example.test/webhook", { method: "POST", body,
      headers: { "x-razorpay-event-id": "same-event-id", "x-razorpay-signature": signature } }));
  }
  return { post, calls, facts, vars, setPayment: (v: typeof payment) => { currentPayment = v; },
    setRefunds: (v: typeof refunds) => { refunds = v; }, failProvider: () => { fail = true; } };
}

Deno.test("live webhook rejects tampered and foreign-account requests before provider access", async () => {
  const s = setup();
  expect((await s.post(undefined, { unsigned: true })).status, 401);
  expect((await s.post(undefined, { wrongAccount: true })).status, 403);
  expect((await s.post(undefined, { order: "order_OtherProduct" })).status, 200);
  expect(s.calls, []);
  expect(s.facts, []);
  s.vars.LIVE_DESK_RAZORPAY_KEY_ID = "rzp_test_Synthetic";
  expect((await s.post()).status, 503);
});

Deno.test("capture retries forward the same checked payment fact to the idempotent ledger", async () => {
  const s = setup();
  expect((await s.post()).status, 200);
  expect((await s.post()).status, 200);
  expect(s.calls, ["/v1/payments/pay_Desk", "/v1/payments/pay_Desk"]);
  expect(s.facts.length, 2);
  expect(s.facts[0], s.facts[1]);
  expect(s.facts[0], { action: "capture", input: { quoteId: "quote", orderId: "order_Desk", paymentId: "pay_Desk",
    amount: 35000, currency: "INR", refundedAmount: 0 } });
});

Deno.test("stale capture after refund uses only processed refunds, not the pending amount", async () => {
  const s = setup();
  s.setPayment({ ...payment, amount_refunded: 35000 });
  s.setRefunds([refund, { ...refund, id: "rfnd_Pending", status: "pending", amount: 25000 }]);
  expect((await s.post("refund.processed")).status, 200);
  expect((await s.post("payment.captured")).status, 200);
  expect(s.facts[0], s.facts[1]);
  expect(s.facts[0], { action: "refund", input: { quoteId: "quote", orderId: "order_Desk", paymentId: "pay_Desk",
    amount: 35000, currency: "INR", refundedAmount: 10000 } });
});

Deno.test("mismatched, uncaptured and unavailable provider payments cannot fulfill a booking", async () => {
  const s = setup();
  s.setPayment({ ...payment, amount: 34999 });
  expect((await s.post()).status, 409);
  s.setPayment({ ...payment, status: "authorized", captured: false });
  expect((await s.post()).status, 409);
  s.failProvider();
  expect((await s.post()).status, 502);
  expect(s.facts, []);
});
