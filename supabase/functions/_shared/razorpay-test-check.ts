import { createTestHandler, createTestWebhookHandler, hmacHex, testConfig, TestPaymentError, type TestDependencies } from "./razorpay-test.ts";

const orderId = "ab000000-0000-4000-8000-000000000001";
const quoteId = "ab000000-0000-4000-8000-000000000002";
const refundId = "ab000000-0000-4000-8000-000000000003";
const config = { keyId: "rzp_test_synthetic", keySecret: "synthetic-api-secret-only", webhookSecret: "synthetic-separate-webhook-secret" };
const acceptance = { terms: true, privacy: true, refund: true, shipping: true, paymentDataSharing: true };
const baseOrder = () => ({ id: orderId, quoteId, razorpayOrderId: "order_synthetic" as string | null, amountPaise: 100, currency: "INR", state: "created", paymentId: null as string | null, refundedAmountPaise: 0, receipt: "testorderreceipt", createdAt: "2026-11-04T00:00:00Z", refunds: [] as Record<string, unknown>[] });
const payment = (status = "captured") => ({ id: "pay_synthetic", order_id: "order_synthetic", amount: 100, currency: "INR", status, captured: status === "captured" });
function assert(value: unknown, label = "Assertion failed"): asserts value { if (!value) throw new Error(label); }
function same(a: unknown, b: unknown) { assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
function request(body: unknown) { return new Request("http://localhost/functions/v1/razorpay-test", { method: "POST", body: JSON.stringify(body) }); }
function setup() {
  let order = baseOrder();
  const operations: { action: string; input: Record<string, unknown> }[] = [];
  const requests: { url: string; body: Record<string, unknown> | undefined; refundKey: string | null }[] = [];
  const events: unknown[][] = [];
  let shouldCreate = true, shouldRefund = true;
  const deps: TestDependencies = {
    config: () => config,
    authenticate: async () => "synthetic-admin",
    operation: async (_actor, action, input) => {
      operations.push({ action, input });
      if (action === "reserve_order") { const first = shouldCreate; shouldCreate = false; return { order, shouldCreate: first }; }
      if (action === "attach_order") order = { ...order, razorpayOrderId: input.razorpayOrderId as string };
      if (action === "record_payment") order = { ...order, state: input.status as string, paymentId: input.paymentId as string };
      if (action === "needs_review") order = { ...order, state: "needs_review" };
      if (action === "reserve_refund") {
        const first = shouldRefund; shouldRefund = false;
        return { order, shouldRefund: first, refund: { id: refundId, amountPaise: 50, receipt: "stable-refund-receipt" } };
      }
      return { order };
    },
    webhook: async (...args) => { events.push(args); return {}; },
    fetcher: (async (input, init) => {
      const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, body, refundKey: new Headers(init?.headers).get("X-Refund-Idempotency") });
      if (url.endsWith("/orders") && init?.method === "POST") return Response.json({ id: "order_synthetic", amount: 100, currency: "INR", receipt: "testorderreceipt" });
      if (url.endsWith("/refund")) return Response.json({ id: "rfnd_synthetic", payment_id: "pay_synthetic", amount: 50, currency: "INR", status: "pending", receipt: "stable-refund-receipt" });
      return Response.json(payment());
    }) as typeof fetch,
  };
  return { deps, operations, requests, events, get order() { return order; }, set order(value) { order = value; } };
}

Deno.test("payment configuration defaults off and refuses live keys before any transport", () => {
  for (const values of [{}, { RAZORPAY_TEST_ENABLED: "true", RAZORPAY_TEST_KEY_ID: "rzp_live_wrong" }]) {
    let blocked = false;
    try { testConfig(name => (values as Record<string, string>)[name]); } catch (error) { blocked = error instanceof TestPaymentError && error.status === 503; }
    assert(blocked);
  }
});

Deno.test("disabled gate and authentication rejection cause zero provider/ledger calls", async () => {
  for (const gate of [true, false]) {
    const s = setup();
    if (gate) s.deps.config = () => { throw new TestPaymentError(503, "test_payments_disabled"); };
    else s.deps.authenticate = async () => { throw new TestPaymentError(403, "admin_required"); };
    const res = await createTestHandler(s.deps)(request({ action: "create_fixture_quote" }));
    same(res.status, gate ? 503 : 403); same(s.operations.length, 0); same(s.requests.length, 0);
  }
});

Deno.test("optional local diagnostics receive only a known code and status, never raw exception or payload", async () => {
  const s = setup(), diagnostics: unknown[][] = [];
  s.deps.diagnostic = (...args) => { diagnostics.push(args); };
  s.deps.authenticate = async () => { throw new Error("private-synthetic-detail must never reach logs"); };
  const result = await createTestHandler(s.deps)(request({ action: "status", orderId, unrelatedPrivateField: "must-not-log" }));
  same(diagnostics, [["test_operation_unavailable", 503]]);
  assert(!(await result.text()).includes("private-synthetic-detail"));
  s.deps.authenticate = async () => { throw new TestPaymentError(400, "unrecognized_private_detail"); };
  await createTestHandler(s.deps)(request({ action: "status", orderId }));
  same(diagnostics[1], ["test_operation_unavailable", 400]);
});

Deno.test("fixture endpoint refuses client pricing; order uses server amount and strips private receipt", async () => {
  const s = setup(), handle = createTestHandler(s.deps);
  same((await handle(request({ action: "create_fixture_quote", amountPaise: 1 }))).status, 400);
  const res = await handle(request({ action: "create_order", quoteId, idempotencyKey: "same-operation", policyVersion: "2026-11-04-razorpay-test-v1", acceptedPolicies: acceptance, amountPaise: 1 }));
  same(res.status, 200);
  same(s.requests[0].body, { amount: 100, currency: "INR", receipt: "testorderreceipt", partial_payment: false });
  assert(s.requests[0].url === "https://api.razorpay.com/v1/orders");
  same(s.requests[0].refundKey, null);
  const reply = await res.json(); same(reply.mode, "test"); same(reply.paidAccessGranted, false); assert(!("receipt" in reply.order));
  await handle(request({ action: "create_order", quoteId, idempotencyKey: "same-operation", policyVersion: "2026-11-04-razorpay-test-v1", acceptedPolicies: acceptance }));
  same(s.requests.length, 1);
});

Deno.test("ambiguous create response is persisted for review and cannot blindly create another order", async () => {
  const s = setup(); let calls = 0;
  s.deps.fetcher = (() => { calls++; throw new Error("private provider detail must not escape"); }) as unknown as typeof fetch;
  const handle = createTestHandler(s.deps), body = { action: "create_order", quoteId, idempotencyKey: "same-operation", policyVersion: "2026-11-04-razorpay-test-v1", acceptedPolicies: acceptance };
  const res = await handle(request(body)); same(res.status, 502);
  assert(!(await res.text()).includes("private provider"));
  same(s.operations.at(-1)?.action, "needs_review");
  await handle(request(body)); same(calls, 1);
});

Deno.test("policy acknowledgement rejects missing, false and extra fields before persistence", async () => {
  for (const acceptedPolicies of [{ ...acceptance, paymentDataSharing: false }, { terms: true }, { ...acceptance, unrelatedPrivateField: "must-not-store" }]) {
    const s = setup();
    const res = await createTestHandler(s.deps)(request({ action: "create_order", quoteId, idempotencyKey: "same-operation", policyVersion: "2026-11-04-razorpay-test-v1", acceptedPolicies }));
    same(res.status, 400); same(s.operations.length, 0); same(s.requests.length, 0);
  }
});

Deno.test("verification binds stored order and signature before fetching payment", async () => {
  const s = setup(), handle = createTestHandler(s.deps);
  const signature = await hmacHex(config.keySecret, new TextEncoder().encode("order_other|pay_synthetic"));
  same((await handle(request({ action: "verify", orderId, razorpayOrderId: "order_other", paymentId: "pay_synthetic", signature }))).status, 409);
  same((await handle(request({ action: "verify", orderId, razorpayOrderId: "order_synthetic", paymentId: "pay_synthetic", signature }))).status, 401);
  same(s.requests.length, 0);
});

Deno.test("authorized payment remains authorized; captured response requires server amount and currency match", async () => {
  for (const remote of [payment("authorized"), { ...payment(), amount: 1 }, { ...payment(), currency: "USD" }, { ...payment(), captured: false }, { ...payment(), id: "pay_other" }]) {
    const s = setup(); s.deps.fetcher = (async () => Response.json(remote)) as typeof fetch;
    const signature = await hmacHex(config.keySecret, new TextEncoder().encode("order_synthetic|pay_synthetic"));
    const res = await createTestHandler(s.deps)(request({ action: "verify", orderId, razorpayOrderId: "order_synthetic", paymentId: "pay_synthetic", signature }));
    same(res.status, remote.status === "authorized" ? 200 : 409);
    if (res.status === 200) same((await res.json()).order.state, "authorized");
    else assert(!s.operations.some(op => op.action === "record_payment"));
  }
});

Deno.test("refund sends its durable UUID idempotency header and receipt; replay makes no second provider call", async () => {
  const s = setup(); s.order = { ...s.order, state: "captured", paymentId: "pay_synthetic" };
  const handle = createTestHandler(s.deps), body = { action: "refund", orderId, amountPaise: 50, idempotencyKey: "same-refund" };
  same((await handle(request(body))).status, 200);
  same(s.requests[0].body, { amount: 50, speed: "normal", receipt: "stable-refund-receipt" });
  same(s.requests[0].refundKey, refundId);
  same(s.operations.at(-1)?.input.status, "pending");
  await handle(request(body)); same(s.requests.length, 1);
});

Deno.test("malformed durable refund IDs cannot become provider headers", async () => {
  const s = setup(); s.order = { ...s.order, state: "captured", paymentId: "pay_synthetic" };
  const original = s.deps.operation;
  s.deps.operation = async (...args) => {
    const result = await original(...args);
    if (args[1] === "reserve_refund") result.refund = { id: "invalid\r\nheader", amountPaise: 50, receipt: "stable-refund-receipt" };
    return result;
  };
  same((await createTestHandler(s.deps)(request({ action: "refund", orderId, amountPaise: 50, idempotencyKey: "same-refund" }))).status, 400);
  same(s.requests.length, 0);
});

Deno.test("lost refund response holds same intent for reconciliation rather than a new receipt", async () => {
  const s = setup(); s.order = { ...s.order, state: "captured", paymentId: "pay_synthetic" };
  let calls = 0; s.deps.fetcher = (async () => { calls++; return new Response("duplicate receipt", { status: 400 }); }) as typeof fetch;
  const body = { action: "refund", orderId, amountPaise: 50, idempotencyKey: "same-refund" }, handle = createTestHandler(s.deps);
  same((await handle(request(body))).status, 502);
  same(s.operations.at(-1)?.input.refundId, refundId);
  await handle(request(body)); same(calls, 1);
});

Deno.test("webhook verifies exact raw bytes and projects only permitted provider facts", async () => {
  const s = setup(), handle = createTestWebhookHandler(s.deps);
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { ...payment(), email: "must-not-store@example.test", card: { number: "synthetic-sensitive-data" } } } } }, null, 2);
  const signature = await hmacHex(config.webhookSecret, new TextEncoder().encode(body));
  const req = (raw: string) => new Request("http://localhost/webhook", { method: "POST", headers: { "x-razorpay-event-id": "event_synthetic", "x-razorpay-signature": signature }, body: raw });
  same((await handle(req(body))).status, 200);
  same(s.events.length, 1); assert(!JSON.stringify(s.events).includes("must-not-store")); assert(!JSON.stringify(s.events).includes("synthetic-sensitive"));
  same((await handle(req(JSON.stringify(JSON.parse(body))))).status, 401);
  same(s.events.length, 1);
});

Deno.test("webhook persistence failure is retryable and never acknowledged as success", async () => {
  const s = setup(); s.deps.webhook = async () => { throw new Error("database unavailable"); };
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: payment() } } });
  const signature = await hmacHex(config.webhookSecret, new TextEncoder().encode(body));
  same((await createTestWebhookHandler(s.deps)(new Request("http://localhost/webhook", { method: "POST", body, headers: { "x-razorpay-event-id": "event_synthetic", "x-razorpay-signature": signature } }))).status, 503);
});

Deno.test("invalid JSON and oversized untrusted bodies fail without ledger/provider effects", async () => {
  for (const body of ["{", "x".repeat(65537)]) {
    const s = setup();
    const res = await createTestHandler(s.deps)(new Request("http://localhost/pay", { method: "POST", body }));
    assert(res.status === 400 || res.status === 413); same(s.operations.length, 0); same(s.requests.length, 0);
  }
});

Deno.test("reconciliation recovers lost order response by its original receipt without another create", async () => {
  const s = setup(); s.order = { ...s.order, razorpayOrderId: null, state: "needs_review" };
  const remote = { id: "order_synthetic", amount: 100, currency: "INR", receipt: "testorderreceipt" };
  const calls: string[] = [];
  s.deps.fetcher = (async (input, init) => {
    const url = String(input); calls.push(url); same(init?.method, "GET");
    if (url.includes("/orders?receipt=testorderreceipt&from=")) return Response.json({ items: [remote] });
    if (url.endsWith("/orders/order_synthetic")) return Response.json(remote);
    if (url.includes("/orders/order_synthetic/payments")) return Response.json({ items: [payment("failed"), payment()] });
    if (url.includes("/payments/pay_synthetic/refunds")) return Response.json({ items: [] });
    throw new Error("Unexpected provider request");
  }) as typeof fetch;
  const res = await createTestHandler(s.deps)(request({ action: "reconcile", orderId }));
  same(res.status, 200); same((await res.json()).order.state, "captured");
  same(s.operations.filter(op => op.action === "attach_order").length, 1);
  assert(calls.every(url => url.startsWith("https://api.razorpay.com/v1/")));
});

Deno.test("receipt recovery paginates beyond 100 results and explicitly holds when its bounded scan is exhausted", async () => {
  for (const exhausted of [false, true]) {
    const s = setup(); s.order = { ...s.order, razorpayOrderId: null, state: "needs_review" };
    const pagesSeen: number[] = [];
    s.deps.fetcher = (async input => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/orders") {
        same(url.searchParams.get("receipt"), "testorderreceipt");
        same(Number(url.searchParams.get("from")), Date.parse(s.order.createdAt) / 1000 - 300);
        same(Number(url.searchParams.get("to")), Date.parse(s.order.createdAt) / 1000 + 3600);
        const skip = Number(url.searchParams.get("skip")); pagesSeen.push(skip);
        if (exhausted || skip === 0) return Response.json({ items: Array.from({ length: 100 }, (_, i) => ({ id: "order_other" + (skip + i), amount: 100, currency: "INR", receipt: "testorderreceipt-other" })) });
        return Response.json({ items: [{ id: "order_synthetic", amount: 100, currency: "INR", receipt: "testorderreceipt" }, ...Array.from({ length: 99 }, (_, i) => ({ id: "order_otherLater" + i, amount: 100, currency: "INR", receipt: "testorderreceipt-other" }))] });
      }
      if (url.pathname === "/v1/orders/order_synthetic") return Response.json({ id: "order_synthetic", amount: 100, currency: "INR", receipt: "testorderreceipt" });
      if (url.pathname.endsWith("/payments")) return Response.json({ items: [] });
      throw new Error("Unexpected provider request");
    }) as typeof fetch;
    const res = await createTestHandler(s.deps)(request({ action: "reconcile", orderId }));
    same(res.status, exhausted ? 409 : 200);
    same(pagesSeen, exhausted ? [0, 100, 200, 300, 400] : [0, 100]);
    if (exhausted) { same((await res.json()).error, "reconciliation_scan_limit"); same(s.operations.at(-1)?.action, "needs_review"); }
    else same(s.operations.filter(op => op.action === "attach_order").length, 1);
  }
});

Deno.test("reconciliation binds an ambiguous refund to its persisted receipt and flags unknown refunds", async () => {
  for (const receipt of ["stable-refund-receipt", "unknown-refund"]) {
    const s = setup();
    s.order = { ...s.order, state: "needs_review", paymentId: "pay_synthetic", refunds: [{ id: refundId, receipt: "stable-refund-receipt", amountPaise: 50, state: "needs_review", razorpayRefundId: null }] };
    s.deps.fetcher = (async (input, init) => {
      same(init?.method, "GET"); const url = String(input);
      if (url.endsWith("/orders/order_synthetic")) return Response.json({ id: "order_synthetic", amount: 100, currency: "INR", receipt: "testorderreceipt" });
      if (url.includes("/orders/order_synthetic/payments")) return Response.json({ items: [payment()] });
      if (url.includes("/payments/pay_synthetic/refunds")) return Response.json({ items: [{ id: "rfnd_synthetic", payment_id: "pay_synthetic", amount: 50, currency: "INR", status: "processed", receipt }] });
      throw new Error("Unexpected provider request");
    }) as typeof fetch;
    same((await createTestHandler(s.deps)(request({ action: "reconcile", orderId }))).status, 200);
    const attached = s.operations.filter(op => op.action === "attach_refund");
    same(attached.length, receipt === "stable-refund-receipt" ? 1 : 0);
    if (attached.length) { same(attached[0].input.refundId, refundId); same(attached[0].input.status, "processed"); }
    else same(s.operations.at(-1)?.action, "needs_review");
  }
});
