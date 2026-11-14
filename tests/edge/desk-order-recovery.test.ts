// @vitest-environment node
// Edge functions run in Deno, a single-realm runtime; jsdom globals here break undici body parsing on Node 26.
import { beforeEach, expect, it, vi } from "vitest";
import { handleDeskCheckout } from "../../supabase/functions/_shared/desk-checkout";

const mock = vi.hoisted(() => ({ authenticate: vi.fn(), staff: vi.fn(), rpc: vi.fn(), owner: vi.fn() }));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({
  authenticatedUser: mock.authenticate, requireStaff: mock.staff,
  adminClient: () => ({ rpc: mock.rpc, auth: { admin: { getUserById: mock.owner } } }),
}));
const memberId = "a0000000-0000-4000-8000-000000000001";
const quoteId = "a0000000-0000-4000-8000-000000000002";
const quote = { id: quoteId, chair: "S01", unit: "day", amount_paise: 35000,
  order_claimed_at: "2026-11-07T01:00:00Z", order_id: null, document_id: "manualdoc123", sealed_revision: "manual-pilot-v1" };
const providerOrder = { id: "order_Existing", receipt: quoteId, amount: 35000, currency: "INR" };
const fetcher = vi.fn();
let checkoutEnabled = false;
function post(action = "recover_order") {
  return handleDeskCheckout(new Request("https://example.test/desk-checkout", { method: "POST",
    headers: { origin: "https://armatureailabs.com", "content-type": "application/json" },
    body: JSON.stringify({ action, memberId, quoteId, orderId: providerOrder.id }),
  }), "live");
}
beforeEach(() => {
  vi.resetAllMocks();
  checkoutEnabled = false;
  const env: Record<string, string> = {
    SUPABASE_URL: "https://uxfhdfagrmaeyuaipaar.supabase.co", LIVE_DESK_RAZORPAY_KEY_ID: "rzp_live_Synthetic",
    LIVE_DESK_RAZORPAY_KEY_SECRET: "synthetic-provider-secret", LIVE_DESK_POLICY_VERSION: "desk-v1",
    LIVE_DESK_MANUAL_AGREEMENT_ENABLED: "true", LIVE_DESK_PANDADOC_SIGNER: "staff@example.test",
    LIVE_DESK_RAZORPAY_WEBHOOK_SECRET: "independent-synthetic-webhook-secret", LIVE_DESK_RAZORPAY_ACCOUNT_ID: "acc_Synthetic",
  };
  vi.stubGlobal("Deno", { env: { get: (key: string) => key === "LIVE_DESK_CHECKOUT_ENABLED" ? String(checkoutEnabled) : env[key] } });
  vi.stubGlobal("fetch", fetcher);
  mock.authenticate.mockResolvedValue({ id: "independent-reviewer", email: "reviewer@example.test", claims: { aal: "aal2" } });
  mock.staff.mockResolvedValue(undefined);
  mock.owner.mockResolvedValue({ data: { user: { email: "buyer@example.test" } } });
  mock.rpc.mockImplementation((name, args) => ({ abortSignal: async () => ({ error: null, data:
    name === "manual_desk_agreement" ? "2026-11-07T01:00:00Z" :
      args.p_action === "bind_order" ? { ...quote, order_id: providerOrder.id } : quote,
  }) }));
  fetcher.mockResolvedValue(Response.json(providerOrder));
});
it("recovers only the verified existing order even with new checkout disabled", async () => {
  const response = await post();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ recovered: true, hasOrder: true, orderPending: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("https://api.razorpay.com/v1/orders/order_Existing", expect.objectContaining({ method: "GET" }));
  expect(mock.rpc).toHaveBeenCalledWith("live_desk_checkout", expect.objectContaining({ p_action: "bind_order", p_member: memberId }));
});
it.each(["receipt", "amount", "currency"])("rejects a mismatched provider %s without binding", async field => {
  fetcher.mockResolvedValue(Response.json({ ...providerOrder, [field]: field === "amount" ? 100 : "wrong" }));
  expect((await post()).status).toBe(409);
  expect(mock.rpc.mock.calls.some(([, args]) => args.p_action === "bind_order")).toBe(false);
});
it("requires an independent MFA Admin before provider access", async () => {
  mock.authenticate.mockResolvedValueOnce({ id: memberId, email: "buyer@example.test", claims: { aal: "aal2" } });
  expect((await post()).status).toBe(403);
  mock.authenticate.mockResolvedValueOnce({ id: "reviewer", email: "reviewer@example.test", claims: { aal: "aal1" } });
  expect((await post()).status).toBe(403);
  mock.staff.mockRejectedValueOnce({ status: 403 });
  expect((await post()).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  { order_claimed_at: null }, { document_id: null }, { order_id: "order_Other" }, { status: "confirmed" },
])("rejects an ineligible or conflicting ledger state %j", async changed => {
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: null, data: { ...quote, ...changed } }) }));
  expect((await post()).status).toBe(409);
  expect(fetcher).not.toHaveBeenCalled();
});
it("reports a failed bind without creating or retrying any order", async () => {
  mock.rpc.mockImplementation((name, args) => ({ abortSignal: async () => (
    args.p_action === "bind_order" ? { error: { code: "XX000" }, data: null } : { error: null,
      data: name === "manual_desk_agreement" ? "2026-11-07T01:00:00Z" : quote }
  ) }));
  expect((await post()).status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].method).toBe("GET");
});

it.each([null, "desk-previous"])("requires a new quote for unclaimed signed policy %s", async quotedPolicy => {
  checkoutEnabled = true;
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({
    error: null, data: { ...quote, order_claimed_at: null, quoted_policy_version: quotedPolicy },
  }) }));
  expect(await (await post("status")).json()).toMatchObject({ policyStale: true, hasAgreement: true });
  for (const action of ["sign", "seal", "approve_manual", "order"]) {
    const response = await post(action);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "policy_version_changed" });
  }
  expect(fetcher).not.toHaveBeenCalled();
});

async function expiredStatus(payments: object[], orderChanges = {}) {
  mock.authenticate.mockResolvedValue({ id: memberId, email: "buyer@example.test", claims: { aal: "aal1" } });
  mock.rpc.mockImplementation(name => ({ abortSignal: async () => ({ error: null,
    data: name === "manual_desk_agreement" ? "2000-01-01T00:00:00Z" : { ...quote, order_id: providerOrder.id },
  }) }));
  fetcher.mockImplementation((url: string) => Promise.resolve(Response.json(url.endsWith("/payments")
    ? { count: payments.length, items: payments }
    : { ...providerOrder, amount_paid: 0, amount_due: 35000, attempts: payments.length, status: "created", ...orderChanges })));
  return handleDeskCheckout(new Request("https://example.test/desk-checkout", { method: "POST",
    headers: { origin: "https://armatureailabs.com", "content-type": "application/json" },
    body: JSON.stringify({ action: "status", quoteId }),
  }), "live");
}
it("allows a fresh agreement request after a checked expired order has no attempts", async () => {
  const response = await expiredStatus([]);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ expiredOrder: true, canRequestReplacement: true });
  expect(mock.rpc.mock.calls.some(([, args]) => args?.p_action === "bind_order")).toBe(false);
});
it.each(["authorized", "created", "unknown"])("keeps ambiguous %s payment attempts out of replacement checkout", async status => {
  const response = await expiredStatus([{ id: "pay_Pending", order_id: providerOrder.id, status, amount_refunded: 0 }]);
  expect(await response.json()).toMatchObject({ expiredOrder: true, canRequestReplacement: false });
});
it("blocks replacement when provider attempts and fetched records disagree", async () => {
  expect(await (await expiredStatus([], { attempts: 1 })).json()).toMatchObject({ canRequestReplacement: false });
});
it("blocks replacement when provider reports paid funds without a captured payment record", async () => {
  expect(await (await expiredStatus([], { amount_paid: 35000, amount_due: 0, status: "paid" })).json())
    .toMatchObject({ canRequestReplacement: false });
});
