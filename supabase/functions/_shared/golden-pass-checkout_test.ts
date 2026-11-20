import { handleGoldenPass } from "./golden-pass-checkout.ts";
import { hmacHex } from "./razorpay-signature.ts";
import { liveRazorpay, productionBackend } from "./live-desk-payment.ts";
import { rentalProvider, rentalStagingBackend } from "./rental-payment.ts";
import { createLiveDeskWebhook } from "./live-desk-webhook.ts";

const id = "a1111111-2222-3333-4444-555555555555";
const order = { id: "order_Golden", receipt: id, amount: 10000000, currency: "INR" };
const payment = { id: "pay_Golden", order_id: order.id, amount: order.amount, currency: order.currency,
  status: "captured", captured: true, amount_refunded: 0 };
const keySecret = "synthetic-key-secret";
const secret = "synthetic-golden-webhook-secret-32";
const accountId = "acc_Synthetic";
const origin = "https://booking-staging.armature-lab.pages.dev";
function expect(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Unexpected Golden Pass result: " + JSON.stringify(actual));
  }
}

function fixture() {
  let row: { id?: string; order_id?: string; payment_id?: string; amount_paise: number; status: string; eligible: boolean } =
    { amount_paise: order.amount, status: "eligible", eligible: true };
  let currentPayment: typeof payment = payment;
  let ambiguous = false;
  let orderCaptured = false;
  let open = true;
  let authenticated = true;
  const calls: { path: string; body?: object }[] = [];
  const facts: { action: string; member: string | null; input: object }[] = [];
  async function operate(action: string, member: string | null, input: object) {
    facts.push({ action, member, input });
    if (action === "claim_order") {
      const claimed = !row.id;
      row = { ...row, id, status: row.order_id ? "awaiting_payment" : "order_pending" };
      return { ...row, claimed };
    }
    if (action === "bind_order") row = { ...row, order_id: order.id, status: "awaiting_payment" };
    if (action === "capture") row = { ...row, payment_id: payment.id, status: "active" };
    return row;
  }

  async function request<T>(path: string, body?: object): Promise<T> {
    calls.push({ path, body });
    if (path.endsWith("/payments")) return { items: orderCaptured ? [currentPayment] : [] } as T;
    if (path.startsWith("/payments/")) return currentPayment as T;
    if (path.startsWith("/orders?")) return { items: [order] } as T;
    if (ambiguous) throw new Error("Synthetic timeout after order creation");
    return order as T;
  }
  async function post(body: object, from = origin) {
    return await handleGoldenPass(new Request(origin + "/test", { method: "POST",
      headers: { Origin: from }, body: JSON.stringify(body) }), "test", {
      env: name => name === "GOLDEN_TEST_CHECKOUT_ENABLED" && open ? "true" : undefined,
      authenticate: () => authenticated ? Promise.resolve({ id: "synthetic-user" }) : Promise.reject({ status: 401 }),
      provider: () => ({ keyId: "rzp_test_Synthetic", keySecret, request }),
      operate,
    });
  }
  return { post, calls, facts,
    setPayment: (p: typeof payment) => { currentPayment = p; },
    settle: () => { orderCaptured = true; },
    ineligible: () => { row.eligible = false; row.status = "ineligible"; },
    close: () => { open = false; }, anonymous: () => { authenticated = false; }, timeout: () => { ambiguous = true; },
  };
}

Deno.test("Golden Pass rejects disabled, anonymous, unconsented and ineligible orders without a provider write", async () => {
  const s = fixture();
  expect((await s.post({ action: "order" })).status, 400);
  expect((await s.post({ action: "order", acceptedTerms: true }, "https://foreign.example")).status, 403);
  s.ineligible();
  expect((await s.post({ action: "order", acceptedTerms: true })).status, 403);
  s.close();
  expect((await s.post({ action: "order", acceptedTerms: true })).status, 503);
  expect((await (await s.post({ action: "status" })).json()).checkoutAvailable, false);
  s.anonymous();
  expect((await s.post({ action: "status" })).status, 401);
  expect(s.calls, []);
  expect(s.facts.filter(fact => fact.action !== "status"), []);
});

Deno.test("Golden Pass recovers an ambiguous order by exact receipt and no duplicate POST", async () => {
  const s = fixture();
  s.timeout();
  expect((await s.post({ action: "order", acceptedTerms: true })).status, 503);
  const recovered = await s.post({ action: "order", acceptedTerms: true });
  expect(recovered.status, 200);
  expect(await recovered.json(), { mode: "test", orderId: order.id, keyId: "rzp_test_Synthetic", amountPaise: order.amount, currency: "INR" });
  expect(s.calls, [
    { path: "/orders", body: { amount: order.amount, currency: order.currency, receipt: id, notes: { purpose: "armature_golden_pass_test" } } },
    { path: "/orders?receipt=" + id + "&count=2" },
    { path: "/orders/" + order.id + "/payments" },
  ]);
  expect(s.facts.filter(fact => fact.action === "bind_order"),
    [{ action: "bind_order", member: "synthetic-user", input: { quoteId: id, orderId: order.id } }]);
});

Deno.test("Golden Pass verifies HMAC and capture and checks Razorpay amount before activation", async () => {
  const s = fixture();
  expect((await s.post({ action: "order", acceptedTerms: true })).status, 200);
  const callback = { action: "verify", razorpay_order_id: order.id, razorpay_payment_id: payment.id,
    razorpay_signature: await hmacHex(keySecret, new TextEncoder().encode(order.id + "|" + payment.id)) };
  expect((await s.post({ ...callback, razorpay_signature: "1".repeat(64) })).status, 400);
  s.setPayment({ ...payment, status: "authorized", captured: false });
  expect((await s.post(callback)).status, 409);
  s.setPayment({ ...payment, amount: 1 });
  expect((await s.post(callback)).status, 409);
  expect(s.facts.filter(fact => fact.action === "capture"), []);
  s.setPayment(payment);
  s.settle();
  expect((await (await s.post(callback)).json()).paymentConfirmationPending, true);
  expect((await (await s.post({ action: "status" })).json()).paymentConfirmationPending, true);
  const retry = await (await s.post({ action: "order", acceptedTerms: true })).json();
  expect(retry.paymentConfirmationPending, true);
  expect(retry.orderId, undefined);
  expect(s.facts.filter(fact => fact.action === "capture"), []);
});

Deno.test("Golden Pass uses a verified signed capture event timestamp", async () => {
  const timestamp = 1748794831;
  const facts: (string | undefined)[] = [];
  const handler = createLiveDeskWebhook({
    config: () => ({ secret, accountId, provider: { keySecret, keyId: "rzp_test_Synthetic",
      request: <T>() => Promise.resolve(payment as T) } }),
    lookup: () => Promise.resolve({ checkout_kind: "golden", id, order_id: order.id, amount_paise: order.amount }),
    apply: (_action, _input, _quote, confirmedAt) => { facts.push(confirmedAt); return Promise.resolve({}); },
  });
  async function deliver(created_at: unknown, tampered = false) {
    const body = JSON.stringify({ entity: "event", event: "payment.captured", account_id: accountId, created_at,
      payload: { payment: { entity: payment } } });
    const signature = await hmacHex(secret, new TextEncoder().encode(body + (tampered ? " " : "")));
    return handler(new Request(origin + "/webhook", { method: "POST", body, headers: {
      "x-razorpay-event-id": "synthetic", "x-razorpay-signature": signature,
    } }));
  }
  expect((await deliver(timestamp, true)).status, 401);
  expect((await deliver(null)).status, 400);
  expect((await deliver(timestamp)).status, 200);
  expect(facts, [new Date(timestamp * 1000).toISOString()]);
});

Deno.test("test Razorpay mode cannot point at production Supabase", () => {
  const vars = { SUPABASE_URL: productionBackend, RENTAL_TEST_RAZORPAY_KEY_ID: "rzp_test_Synthetic",
    RENTAL_TEST_RAZORPAY_KEY_SECRET: keySecret, LIVE_DESK_RAZORPAY_KEY_ID: "rzp_live_Synthetic",
    LIVE_DESK_RAZORPAY_KEY_SECRET: keySecret };
  const env = (name: string) => vars[name as keyof typeof vars];
  expect(rentalProvider("test", env), null);
  expect(liveRazorpay(env)?.keyId, "rzp_live_Synthetic");
  vars.SUPABASE_URL = rentalStagingBackend;
  expect(rentalProvider("test", env)?.keyId, "rzp_test_Synthetic");
  expect(liveRazorpay(env), null);
});
