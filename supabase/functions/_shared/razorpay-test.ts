import type { TestOrder, TestQuote, TestRefund, TestReply } from "./razorpay-test-types.ts";
export type { TestOrder, TestQuote, TestRefund, TestReply } from "./razorpay-test-types.ts";

type ObjectValue = Record<string, unknown>;
export interface TestConfig { keyId: string; keySecret: string; webhookSecret: string }
export interface TestDependencies {
  config: () => TestConfig;
  authenticate: (request: Request) => Promise<string>;
  operation: (actor: string, action: string, input: ObjectValue) => Promise<ObjectValue>;
  webhook: (eventId: string, hash: string, event: string, payment: ObjectValue | null, refund: ObjectValue | null) => Promise<unknown>;
  fetcher?: typeof fetch;
  headers?: (request: Request) => HeadersInit;
  diagnostic?: (safeCode: string, status: number, providerHttpStatus?: number) => void;
}

export class TestPaymentError extends Error {
  constructor(public status: number, public code: string, public providerHttpStatus?: number) { super(code); }
}

export function testConfig(env: (name: string) => string | undefined): TestConfig {
  if (env("RAZORPAY_TEST_ENABLED") !== "true") throw new TestPaymentError(503, "test_payments_disabled");
  const keyId = env("RAZORPAY_TEST_KEY_ID") ?? "";
  const keySecret = env("RAZORPAY_TEST_KEY_SECRET") ?? "";
  const webhookSecret = env("RAZORPAY_TEST_WEBHOOK_SECRET") ?? "";
  if (!/^rzp_test_[A-Za-z0-9]+$/.test(keyId) || keySecret.length < 12 || webhookSecret.length < 24 || keySecret === webhookSecret) {
    throw new TestPaymentError(503, "test_payments_unconfigured");
  }
  return { keyId, keySecret, webhookSecret };
}

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TestPaymentError(400, "invalid_payload");
  return value as ObjectValue;
}
function text(value: unknown, pattern: RegExp, code = "invalid_payload"): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new TestPaymentError(400, code);
  return value;
}
function amount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new TestPaymentError(400, "invalid_amount");
  return value as number;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const providerId = /^(?:order|pay|rfnd)_[A-Za-z0-9]{1,80}$/;
function provider(value: unknown, prefix: "order" | "pay" | "rfnd"): string {
  const id = text(value, providerId);
  if (!id.startsWith(prefix + "_")) throw new TestPaymentError(400, "invalid_provider_id");
  return id;
}

async function bodyBytes(request: Request, limit = 65536): Promise<Uint8Array> {
  if (!request.body) throw new TestPaymentError(400, "invalid_payload");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel(); }, 5000);
  try {
    for (;;) {
      const next = await reader.read();
      if (expired) throw new TestPaymentError(400, "body_timeout");
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new TestPaymentError(413, "body_too_large");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { clearTimeout(timer); void reader.cancel(); }
}

export async function hmacHex(secret: string, bytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
}
async function validHmac(secret: string, bytes: Uint8Array, signature: unknown): Promise<boolean> {
  if (typeof signature !== "string" || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const supplied = Uint8Array.from(signature.match(/../g)!, part => parseInt(part, 16));
  return crypto.subtle.verify("HMAC", key, supplied, bytes as BufferSource);
}

function response(deps: TestDependencies, request: Request, data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { ...deps.headers?.(request), "cache-control": "no-store" } });
}
function failure(deps: TestDependencies, request: Request, error: unknown): Response {
  const safe = error instanceof TestPaymentError ? error : error instanceof SyntaxError
    ? new TestPaymentError(400, "invalid_payload") : new TestPaymentError(503, "test_operation_unavailable");
  const known = new Set(["test_payments_disabled", "test_payments_unconfigured", "invalid_payload", "invalid_amount", "invalid_provider_id",
    "body_timeout", "body_too_large", "method_not_allowed", "test_operation_unavailable", "unsafe_provider_configuration",
    "provider_response_unknown", "provider_request_rejected", "invalid_provider_response", "payment_mismatch", "refund_mismatch",
    "client_price_forbidden", "explicit_policy_acceptance_required", "invalid_signature", "order_mismatch", "reconciliation_scan_limit",
    "reconciliation_time_unknown", "admin_authentication_required", "test_ledger_request_rejected", "test_webhook_not_recorded",
    "local_ledger_rejected", "synthetic_admin_inactive", "synthetic_authentication_required", "refund_reconciliation_required"]);
  const providerHttpStatus = Number.isInteger(safe.providerHttpStatus) && safe.providerHttpStatus! >= 400 && safe.providerHttpStatus! <= 599 ? safe.providerHttpStatus : undefined;
  try { deps.diagnostic?.(known.has(safe.code) ? safe.code : "test_operation_unavailable", safe.status, providerHttpStatus); } catch { /* Diagnostics cannot change payment state or response. */ }
  return response(deps, request, { mode: "test", paidAccessGranted: false, error: safe.code, ...(providerHttpStatus ? { providerHttpStatus } : {}) }, safe.status);
}
function sanitizeOrder(value: unknown): TestOrder {
  const order = object(value);
  return {
    id: order.id as string, quoteId: order.quoteId as string, razorpayOrderId: order.razorpayOrderId as string | null,
    amountPaise: order.amountPaise as number, currency: "INR", state: order.state as TestOrder["state"],
    paymentId: order.paymentId as string | null, refundedAmountPaise: order.refundedAmountPaise as number,
    refunds: (Array.isArray(order.refunds) ? order.refunds : []).map(value => {
      const refund = object(value);
      return { id: refund.id as string, razorpayRefundId: refund.razorpayRefundId as string | null,
        amountPaise: refund.amountPaise as number, state: refund.state as TestRefund["state"] };
    }),
  };
}
function reply(deps: TestDependencies, request: Request, result: ObjectValue, keyId?: string): Response {
  const data: TestReply = { mode: "test", paidAccessGranted: false };
  if (result.quote) data.quote = result.quote as unknown as TestQuote;
  if (result.order) data.order = sanitizeOrder(result.order);
  if (keyId) data.keyId = keyId;
  return response(deps, request, data);
}

function api(config: TestConfig, fetcher: typeof fetch) {
  return async (path: string, input?: ObjectValue, refundIdempotencyKey?: string): Promise<ObjectValue> => {
    if (!/^rzp_test_[A-Za-z0-9]+$/.test(config.keyId) || !/^\/(?:orders|payments|refunds)(?:[/?][A-Za-z0-9_?=&/-]*)?$/.test(path)) throw new TestPaymentError(503, "unsafe_provider_configuration");
    if (refundIdempotencyKey !== undefined && (!input || !/^\/payments\/pay_[A-Za-z0-9]+\/refund$/.test(path) || !uuid.test(refundIdempotencyKey))) throw new TestPaymentError(503, "unsafe_provider_configuration");
    let result: Response;
    try {
      result = await fetcher("https://api.razorpay.com/v1" + path, {
        method: input ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { authorization: "Basic " + btoa(config.keyId + ":" + config.keySecret), "content-type": "application/json",
          ...(refundIdempotencyKey ? { "X-Refund-Idempotency": refundIdempotencyKey } : {}) },
        body: input ? JSON.stringify(input) : undefined,
      });
    } catch { throw new TestPaymentError(502, "provider_response_unknown"); }
    if (!result.ok) { void result.body?.cancel(); throw new TestPaymentError(502, "provider_request_rejected", result.status); }
    try { return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await bodyBytes(new Request("http://provider-response.invalid", { method: "POST", body: result.body, duplex: "half" } as RequestInit), 262144)))); }
    catch { throw new TestPaymentError(502, "invalid_provider_response"); }
  };
}

function paymentFact(value: unknown): ObjectValue {
  const payment = object(value);
  const providerStatus = text(payment.status, /^(?:created|authorized|captured|refunded|failed)$/);
  const status = providerStatus === "refunded" ? "captured" : providerStatus;
  if (payment.currency !== "INR" || (status === "captured" && payment.captured !== true)) throw new TestPaymentError(409, "payment_mismatch");
  return { paymentId: provider(payment.id, "pay"), razorpayOrderId: provider(payment.order_id, "order"),
    amountPaise: amount(payment.amount), currency: "INR", status };
}
function refundFact(value: unknown): ObjectValue {
  const refund = object(value);
  if (refund.currency !== "INR") throw new TestPaymentError(409, "refund_mismatch");
  return { razorpayRefundId: provider(refund.id, "rfnd"), paymentId: provider(refund.payment_id, "pay"),
    amountPaise: amount(refund.amount), currency: "INR", status: text(refund.status, /^(?:pending|processed|failed)$/), receipt: refund.receipt };
}
function matchPayment(fact: ObjectValue, order: ObjectValue): void {
  if (fact.razorpayOrderId !== order.razorpayOrderId || fact.amountPaise !== order.amountPaise || fact.currency !== order.currency) throw new TestPaymentError(409, "payment_mismatch");
}
function items(value: ObjectValue): unknown[] {
  if (!Array.isArray(value.items)) throw new TestPaymentError(502, "invalid_provider_response");
  return value.items;
}
async function pages(call: (path: string) => Promise<ObjectValue>, path: string, stopWhen?: (row: ObjectValue) => boolean): Promise<ObjectValue[]> {
  const rows: ObjectValue[] = [];
  for (let skip = 0; skip < 500; skip += 100) {
    const batch = items(await call(path + (path.includes("?") ? "&" : "?") + "count=100&skip=" + skip));
    if (batch.length > 100) throw new TestPaymentError(502, "invalid_provider_response");
    rows.push(...batch.map(object));
    if (stopWhen && rows.some(stopWhen)) return rows;
    if (batch.length < 100) return rows;
  }
  throw new TestPaymentError(409, "reconciliation_scan_limit");
}

export function createTestHandler(deps: TestDependencies): (request: Request) => Promise<Response> {
  return async request => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: deps.headers?.(request) });
    try {
      if (request.method !== "POST") throw new TestPaymentError(405, "method_not_allowed");
      const config = deps.config(), actor = await deps.authenticate(request), call = api(config, deps.fetcher ?? fetch);
      const input = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await bodyBytes(request))));
      const action = text(input.action, /^(?:create_fixture_quote|create_order|verify|status|refund|retry_refund|reconcile)$/);
      const op = (name: string, data: ObjectValue) => deps.operation(actor, name, data);
      if (action === "create_fixture_quote") {
        if (Object.keys(input).some(key => key !== "action")) throw new TestPaymentError(400, "client_price_forbidden");
        return reply(deps, request, await op(action, {}));
      }
      if (action === "create_order") {
        const accepted = object(input.acceptedPolicies);
        const flags = ["terms", "privacy", "refund", "shipping", "paymentDataSharing"];
        if (Object.keys(accepted).length !== flags.length || flags.some(flag => accepted[flag] !== true)) throw new TestPaymentError(400, "explicit_policy_acceptance_required");
        const reserved = await op("reserve_order", { quoteId: text(input.quoteId, uuid), idempotencyKey: text(input.idempotencyKey, /^[A-Za-z0-9_-]{8,100}$/), policyVersion: text(input.policyVersion, /^2026-11-04-razorpay-test-v1$/), acceptedPolicies: accepted });
        const order = object(reserved.order);
        if (reserved.shouldCreate !== true) return reply(deps, request, reserved, config.keyId);
        try {
          const remote = await call("/orders", { amount: amount(order.amountPaise), currency: "INR", receipt: order.receipt, partial_payment: false });
          if (remote.amount !== order.amountPaise || remote.currency !== "INR" || remote.receipt !== order.receipt) throw new TestPaymentError(409, "order_mismatch");
          return reply(deps, request, await op("attach_order", { orderId: order.id, razorpayOrderId: provider(remote.id, "order"), amountPaise: remote.amount, currency: remote.currency }), config.keyId);
        } catch (error) { await op("needs_review", { orderId: order.id }); throw error; }
      }
      const orderId = text(input.orderId, uuid);
      if (action === "retry_refund" && Object.keys(input).some(key => !["action", "orderId", "refundId"].includes(key))) throw new TestPaymentError(400, "invalid_payload");
      let result = await op("status", { orderId }), order = object(result.order);
      if (action === "status") return reply(deps, request, result);
      if (action === "verify") {
        if (input.razorpayOrderId !== order.razorpayOrderId) throw new TestPaymentError(409, "order_mismatch");
        const paymentId = provider(input.paymentId, "pay"), providerOrder = provider(order.razorpayOrderId, "order");
        if (!await validHmac(config.keySecret, new TextEncoder().encode(providerOrder + "|" + paymentId), input.signature)) throw new TestPaymentError(401, "invalid_signature");
        const fact = paymentFact(await call("/payments/" + paymentId));
        if (fact.paymentId !== paymentId) throw new TestPaymentError(409, "payment_mismatch");
        matchPayment(fact, order);
        return reply(deps, request, await op("record_payment", { orderId, ...fact }));
      }
      const submitRefund = async (reserved: ObjectValue) => {
        if (reserved.shouldRefund !== true) return reply(deps, request, reserved);
        const refund = object(reserved.refund);
        try {
          const fact = refundFact(await call("/payments/" + provider(order.paymentId, "pay") + "/refund", { amount: refund.amountPaise, speed: "normal", receipt: refund.receipt }, text(refund.id, uuid)));
          if (fact.paymentId !== order.paymentId || fact.amountPaise !== refund.amountPaise || fact.receipt !== refund.receipt) throw new TestPaymentError(409, "refund_mismatch");
          return reply(deps, request, await op("attach_refund", { orderId, refundId: refund.id, ...fact }));
        } catch (error) { await op("needs_review", { orderId, refundId: refund.id }); throw error; }
      };
      if (action === "refund") {
        const amountPaise = amount(input.amountPaise);
        if (amountPaise < 100) throw new TestPaymentError(400, "invalid_amount");
        return await submitRefund(await op("reserve_refund", { orderId, amountPaise, idempotencyKey: text(input.idempotencyKey, /^[A-Za-z0-9_-]{8,100}$/) }));
      }
      if (action === "retry_refund") {
        const refundId = text(input.refundId, uuid);
        const localRefunds = (Array.isArray(order.refunds) ? order.refunds : []).map(object);
        const local = localRefunds.find(refund => refund.id === refundId);
        if (!local) throw new TestPaymentError(400, "invalid_payload");
        if (local.state !== "needs_review") return reply(deps, request, result);
        const paymentId = provider(order.paymentId, "pay");
        const remotePayment = await call("/payments/" + paymentId);
        const fact = paymentFact(remotePayment);
        matchPayment(fact, order);
        if (fact.paymentId !== paymentId || fact.status !== "captured") throw new TestPaymentError(409, "payment_mismatch");
        const refunds = (await pages(call, "/payments/" + paymentId + "/refunds")).map(refundFact);
        const matches = refunds.filter(refund => refund.receipt === local.receipt || refund.razorpayRefundId === local.razorpayRefundId);
        if (matches.length === 1) return reply(deps, request, await op("attach_refund", { orderId, refundId, ...matches[0] }));
        if (matches.length > 1 || remotePayment.amount_refunded !== order.refundedAmountPaise
          || refunds.some(refund => !localRefunds.some(existing => refund.receipt === existing.receipt || refund.razorpayRefundId === existing.razorpayRefundId))) {
          throw new TestPaymentError(409, "refund_reconciliation_required");
        }
        return await submitRefund(await op("reserve_refund_retry", { orderId, refundId, expectedUpdatedAt: local.updatedAt }));
      }
      if (!order.razorpayOrderId) {
        let candidates: ObjectValue[];
        try {
          const created = Date.parse(String(order.createdAt));
          if (!Number.isFinite(created)) throw new TestPaymentError(409, "reconciliation_time_unknown");
          const from = Math.floor(created / 1000) - 300, to = Math.floor(created / 1000) + 3600;
          candidates = await pages(call, "/orders?receipt=" + encodeURIComponent(String(order.receipt)) + "&from=" + from + "&to=" + to, remote => remote.receipt === order.receipt);
        }
        catch (error) { await op("needs_review", { orderId }); throw error; }
        const matches = candidates.filter(remote => remote.receipt === order.receipt);
        if (matches.length !== 1 || matches[0].amount !== order.amountPaise || matches[0].currency !== "INR") return reply(deps, request, await op("needs_review", { orderId }));
        result = await op("attach_order", { orderId, razorpayOrderId: provider(matches[0].id, "order"), amountPaise: matches[0].amount, currency: "INR" });
        order = object(result.order);
      }
      const remoteOrder = await call("/orders/" + provider(order.razorpayOrderId, "order"));
      if (remoteOrder.id !== order.razorpayOrderId || remoteOrder.amount !== order.amountPaise || remoteOrder.currency !== "INR" || remoteOrder.receipt !== order.receipt) return reply(deps, request, await op("needs_review", { orderId }));
      for (const value of items(await call("/orders/" + provider(order.razorpayOrderId, "order") + "/payments"))) {
        const fact = paymentFact(value);
        matchPayment(fact, order);
        result = await op("record_payment", { orderId, ...fact });
      }
      order = object(result.order);
      if (order.paymentId) {
        let candidates: ObjectValue[];
        try { candidates = await pages(call, "/payments/" + provider(order.paymentId, "pay") + "/refunds"); }
        catch (error) { await op("needs_review", { orderId }); throw error; }
        const refunds = candidates.map(refundFact);
        const localRefunds = (Array.isArray(order.refunds) ? order.refunds : []).map(object);
        for (const value of localRefunds) {
          const local = object(value), matches = refunds.filter(remote => remote.receipt === local.receipt || remote.razorpayRefundId === local.razorpayRefundId);
          if (matches.length === 1) result = await op("attach_refund", { orderId, refundId: local.id, ...matches[0] });
          else if (matches.length > 1) result = await op("needs_review", { orderId, refundId: local.id });
        }
        if (refunds.some(remote => !localRefunds.some(local => remote.receipt === local.receipt || remote.razorpayRefundId === local.razorpayRefundId))) result = await op("needs_review", { orderId });
      }
      return reply(deps, request, result);
    } catch (error) { return failure(deps, request, error); }
  };
}

export function createTestWebhookHandler(deps: TestDependencies): (request: Request) => Promise<Response> {
  return async request => {
    try {
      if (request.method !== "POST") throw new TestPaymentError(405, "method_not_allowed");
      const config = deps.config(), bytes = await bodyBytes(request);
      const eventId = text(request.headers.get("x-razorpay-event-id"), /^[A-Za-z0-9_-]{1,120}$/);
      if (!await validHmac(config.webhookSecret, bytes, request.headers.get("x-razorpay-signature"))) throw new TestPaymentError(401, "invalid_signature");
      const event = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      const name = text(event.event, /^[a-z._]{1,80}$/);
      const payload = object(event.payload);
      let payment: ObjectValue | null = null, refund: ObjectValue | null = null;
      if (["payment.authorized", "payment.captured", "payment.failed", "order.paid"].includes(name)) {
        payment = paymentFact(object(payload.payment).entity);
        if ((name === "payment.captured" || name === "order.paid") && payment.status !== "captured") throw new TestPaymentError(409, "payment_mismatch");
      } else if (["refund.created", "refund.processed", "refund.failed"].includes(name)) refund = refundFact(object(payload.refund).entity);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
      await deps.webhook(eventId, hash, name, payment, refund);
      return response(deps, request, { mode: "test", paidAccessGranted: false, received: true });
    } catch (error) { return failure(deps, request, error); }
  };
}
