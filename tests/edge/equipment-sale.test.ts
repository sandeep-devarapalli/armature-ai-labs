// @vitest-environment node
// Edge functions run in Deno, a single-realm runtime; jsdom globals here break undici body parsing on Node 26.
import { beforeEach, expect, it, vi } from "vitest";
import { handleEquipmentSale } from "../../supabase/functions/_shared/equipment-sale";

const mock = vi.hoisted(() => ({ authenticate: vi.fn(), staff: vi.fn(), rpc: vi.fn() }));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({ authenticatedUser: mock.authenticate,
  requireStaff: mock.staff, adminClient: () => ({ rpc: mock.rpc }) }));
const memberId = "c0000000-0000-4000-8000-000000000001";
const saleId = "c0000000-0000-4000-8000-000000000002";
const reviewerId = "c0000000-0000-4000-8000-000000000003";
const env: Record<string, string> = {};
const fetcher = vi.fn();
let sale: Record<string, unknown>;
async function post(body: object, mode: "live" | "test" = "live") {
  return handleEquipmentSale(new Request("https://example.test/equipment-sale", { method: "POST",
    headers: { origin: mode === "live" ? "https://armatureailabs.com" : "https://booking-staging.armature-lab.pages.dev", "content-type": "application/json" },
    body: JSON.stringify(body) }), mode);
}
const calls = () => mock.rpc.mock.calls.map(([, args]) => args);
const asStaff = () => mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
beforeEach(() => {
  vi.resetAllMocks();
  Object.keys(env).forEach(key => delete env[key]);
  Object.assign(env, { SUPABASE_URL: "https://uxfhdfagrmaeyuaipaar.supabase.co",
    LIVE_DESK_RAZORPAY_KEY_ID: "rzp_live_Synthetic", LIVE_DESK_RAZORPAY_KEY_SECRET: "synthetic-provider-secret",
    LIVE_DESK_RAZORPAY_WEBHOOK_SECRET: "independent-synthetic-webhook-secret", LIVE_DESK_RAZORPAY_ACCOUNT_ID: "acc_Synthetic",
    LIVE_SALE_CHECKOUT_ENABLED: "true" });
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
  vi.stubGlobal("fetch", fetcher);
  sale = { id: saleId, member_id: memberId, amount_paise: 400000, status: "ready_to_pay", created_at: new Date().toISOString(),
    checked_at: new Date().toISOString(), paymentExpiresAt: new Date(Date.now() + 20 * 60_000).toISOString(), order_id: null, order_claimed_at: null,
    lines: [{ code: "waveshare-ov5693", name: "OV5693 5MP USB Camera (A)", maker: "Waveshare", pricePaise: 400000 }] };
  mock.authenticate.mockResolvedValue({ id: memberId, email: "buyer@example.test", claims: { aal: "aal1" } });
  mock.staff.mockResolvedValue(undefined);
  mock.rpc.mockImplementation((_name, args) => ({ abortSignal: async () => ({ error: null, data:
    args.p_action === "bind_order" ? { ...sale, order_id: args.p_input.orderId } : args.p_action === "claim_order" ? { ...sale, claimed: true }
    : args.p_action === "list_own" || args.p_action === "staff_queue" ? { sales: [sale] } : sale }) }));
  fetcher.mockResolvedValue(Response.json({ id: "order_Synthetic", receipt: saleId, amount: 400000, currency: "INR" }));
});

it("rejects other origins and stays closed until configured", async () => {
  const wrong = await handleEquipmentSale(new Request("https://example.test", { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" }), "live");
  expect(wrong.status).toBe(403);
  delete env.LIVE_DESK_RAZORPAY_KEY_ID;
  expect((await post({ action: "list_own" })).status).toBe(503);
});

it("keeps recovery actions open while new sales are closed", async () => {
  env.LIVE_SALE_CHECKOUT_ENABLED = "false";
  expect(await (await post({ action: "request", items: ["waveshare-ov5693"] })).json()).toEqual({ error: "checkout_disabled" });
  expect((await post({ action: "list_own" })).status).toBe(200);
});

it("requests one or two distinct items", async () => {
  expect((await post({ action: "request", items: [] })).status).toBe(400);
  expect((await post({ action: "request", items: ["a1", "a1"] })).status).toBe(400);
  expect((await post({ action: "request", items: ["Bad Code"] })).status).toBe(400);
  const res = await post({ action: "request", items: ["waveshare-ov5693"] });
  expect(await res.json()).toMatchObject({ mode: "live", saleId, amountPaise: 400000, status: "ready_to_pay" });
  expect(calls().at(-1)).toEqual({ p_action: "request", p_member: memberId, p_input: { items: ["waveshare-ov5693"] } });
});

it("maps out of stock and duplicate requests", async () => {
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: { code: "23P01" }, data: null }) }));
  expect(await (await post({ action: "request", items: ["waveshare-ov5693"] })).json()).toEqual({ error: "sale_out_of_stock" });
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: { code: "23505" }, data: null }) }));
  expect(await (await post({ action: "request", items: ["waveshare-ov5693"] })).json()).toEqual({ error: "sale_already_requested" });
});

it("needs an independent MFA admin to mark the in-lab check", async () => {
  expect((await post({ action: "mark_checked", saleId, memberId, itemChecked: true })).status).toBe(403);
  asStaff();
  expect(await (await post({ action: "mark_checked", saleId, memberId: reviewerId, itemChecked: true })).json()).toEqual({ error: "independent_reviewer_required" });
  expect((await post({ action: "mark_checked", saleId, memberId })).status).toBe(400);
  expect((await post({ action: "mark_checked", saleId, memberId, itemChecked: true })).status).toBe(200);
  expect(calls().at(-1)).toEqual({ p_action: "mark_checked", p_member: memberId,
    p_input: { saleId, reviewerId, reviewerAal: "aal2", itemChecked: true } });
});

it("opens one Razorpay order for the buyer within the payment window", async () => {
  expect((await post({ action: "order", saleId })).status).toBe(409);
  const res = await post({ action: "order", saleId, acceptedTerms: true });
  expect(await res.json()).toEqual({ mode: "live", orderId: "order_Synthetic", keyId: "rzp_live_Synthetic", amountPaise: 400000, currency: "INR" });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ amount: 400000, currency: "INR", receipt: saleId });
  expect(calls().slice(-3).map(c => c.p_action)).toEqual(["status", "claim_order", "bind_order"]);
  expect(calls().at(-1).p_input).toEqual({ saleId, orderId: "order_Synthetic" });
});

it("refuses payment once the window has closed", async () => {
  sale.paymentExpiresAt = new Date(Date.now() - 1000).toISOString();
  expect(await (await post({ action: "order", saleId, acceptedTerms: true })).json()).toEqual({ error: "signed_payment_window_expired" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("needs a reason to decline, cancel or approve a refund", async () => {
  expect((await post({ action: "cancel", saleId, reason: "Synthetic change of plans" })).status).toBe(400);
  expect((await post({ action: "cancel", saleId, reason: "Synthetic change of plans", confirmed: true })).status).toBe(200);
  asStaff();
  expect((await post({ action: "approve_refund", saleId, memberId, reason: "short" })).status).toBe(400);
  expect((await post({ action: "approve_refund", saleId, memberId, reason: "Synthetic buyer changed mind" })).status).toBe(200);
  expect(calls().at(-1)).toMatchObject({ p_action: "approve_refund", p_input: { saleId, reason: "Synthetic buyer changed mind" } });
});
