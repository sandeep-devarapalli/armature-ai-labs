
import { beforeEach, expect, it, vi } from "vitest";
import { handleRentalCheckout } from "../../supabase/functions/_shared/rental-checkout";
import { rentalProvider } from "../../supabase/functions/_shared/rental-payment";

const mock = vi.hoisted(() => ({ authenticate: vi.fn(), staff: vi.fn(), rpc: vi.fn(), owner: vi.fn(), upload: vi.fn() }));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({ authenticatedUser: mock.authenticate,
  requireStaff: mock.staff, adminClient: () => ({ storage: { from: () => ({ upload: mock.upload }) }, rpc: mock.rpc, auth: { admin: { getUserById: mock.owner } } }) }));
const memberId = "a0000000-0000-4000-8000-000000000001";
const quoteId = "a0000000-0000-4000-8000-000000000002";
const reviewerId = "a0000000-0000-4000-8000-000000000003";
const env: Record<string, string> = {};
const fetcher = vi.fn();
let quote: Record<string, unknown>;
async function post(body: object, mode: "live" | "test" = "live") {
  return handleRentalCheckout(new Request("https://example.test/rental-checkout", { method: "POST",
    headers: { origin: mode === "live" ? "https://armatureailabs.com" : "https://booking-staging.armature-lab.pages.dev", "content-type": "application/json" },
    body: JSON.stringify(body) }), mode);
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.keys(env).forEach(key => delete env[key]);
  Object.assign(env, { SUPABASE_URL: "https://uxfhdfagrmaeyuaipaar.supabase.co",
    LIVE_DESK_RAZORPAY_KEY_ID: "rzp_live_Synthetic", LIVE_DESK_RAZORPAY_KEY_SECRET: "synthetic-provider-secret",
    LIVE_DESK_RAZORPAY_WEBHOOK_SECRET: "independent-synthetic-webhook-secret", LIVE_DESK_RAZORPAY_ACCOUNT_ID: "acc_Synthetic",
    LIVE_RENTAL_CHECKOUT_ENABLED: "true", LIVE_RENTAL_POLICY_VERSION: "rental-2026-11-08", LIVE_RENTAL_PANDADOC_SIGNER: "staff@example.test" });
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
  vi.stubGlobal("fetch", fetcher);
  quote = { id: quoteId, product: "hiwonder", unit: "week", starts_on: "2027-02-01", ends_on: "2027-02-07",
    rent_paise: 105000, deposit_paise: 2500000, amount_paise: 2605000, agreement_hash: "a".repeat(64),
    policy_version: "rental-2026-11-08", approved_at: new Date().toISOString(), document_id: "manualdoc123",
    order_id: null, order_claimed_at: null, status: "approved" };
  mock.authenticate.mockResolvedValue({ id: memberId, email: "buyer@example.test", claims: { aal: "aal1" } });
  mock.staff.mockResolvedValue(undefined);
  mock.upload.mockResolvedValue({ error: null });
  mock.owner.mockResolvedValue({ data: { user: { email: "buyer@example.test" } } });
  mock.rpc.mockImplementation((_name, args) => ({ abortSignal: async () => ({ error: null, data:
    args.p_action === "bind_order" ? { ...quote, order_id: args.p_input.orderId } : args.p_action === "claim_order" ? { ...quote, claimed: true } : quote }) }));
  fetcher.mockResolvedValue(Response.json({ id: "order_Synthetic", receipt: quoteId, amount: 2605000, currency: "INR" }));
});
it("uses server rent plus deposit rather than a caller's dummy amount", async () => {
  const response = await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08", amount: 100 });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ amountPaise: 2605000, mode: "live" });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ amount: 2605000, receipt: quoteId });
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_action)).toEqual(["status", "claim_order", "bind_order"]);
});
it.each([null, "2000-01-01T00:00:00Z", "2999-01-01T00:00:00Z"])("denies missing/expired/future approval %s", async approved => {
  quote.approved_at = approved;
  expect((await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08" })).status).toBe(409);
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires current explicit policy acceptance", async () => {
  for (const extra of [{ acceptedPolicies: false }, { acceptedPolicies: true, policyVersion: "old" }]) {
    expect((await post({ action: "order", quoteId, ...extra })).status).toBe(409);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not retry creation after a claimed order becomes uncertain", async () => {
  mock.rpc.mockImplementation((_name, args) => ({ abortSignal: async () => args.p_action === "claim_order"
    ? { error: { code: "22023" } } : { error: null, data: { ...quote, order_claimed_at: new Date().toISOString() } } }));
  expect((await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08" })).status).toBe(409);
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses existing bound order without creating a second order", async () => {
  quote.order_id = "order_Existing";
  expect(await (await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08" })).json()).toMatchObject({ orderId: "order_Existing" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires independent staff MFA for document preparation and approval", async () => {
  for (const action of ["prepare", "approve_manual", "manual_review", "recover_order"]) {
    expect((await post({ action, quoteId, memberId })).status).toBe(403);
  }
  mock.authenticate.mockResolvedValue({ id: memberId, email: "buyer@example.test", claims: { aal: "aal2" } });
  expect((await post({ action: "approve_manual", quoteId, memberId })).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("binds approval to exact document digest and authenticated reviewer", async () => {
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  const metadata = JSON.stringify({ action: "approve_manual", quoteId, memberId, confirmed: true,
    agreementHash: quote.agreement_hash, documentId: "manualdoc123", evidenceSha256: "b".repeat(64), reviewerId: "forged" });
  const body = '--testboundary\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n' + metadata
    + '\r\n--testboundary\r\nContent-Disposition: form-data; name="completedPdf"; filename="signed.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-synthetic signed specimen\r\n--testboundary--\r\n';
  const response = await handleRentalCheckout(new Request("https://example.test/rental-checkout", { method: "POST",
    headers: { origin: "https://armatureailabs.com", "content-type": "multipart/form-data; boundary=testboundary" }, body }), "live");
  expect(await response.clone().json()).not.toHaveProperty("error");
  expect(response.status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith("rental_checkout", expect.objectContaining({ p_action: "approve_manual",
    p_input: expect.objectContaining({ reviewerId, reviewerAal: "aal2", confirmedBothSigners: true }) }));
  expect(mock.upload).toHaveBeenCalledTimes(1);
  const approval = mock.rpc.mock.calls.find(([, args]) => args.p_action === "approve_manual")![1].p_input;
  expect(approval.evidenceSha256).not.toBe("b".repeat(64));
  expect(approval.evidencePath).toBe(quoteId + "/" + approval.evidenceSha256 + ".pdf");
});
it("keeps status recovery available when collection is disabled", async () => {
  env.LIVE_RENTAL_CHECKOUT_ENABLED = "false";
  expect((await post({ action: "order", quoteId })).status).toBe(503);
  expect((await post({ action: "status", quoteId })).status).toBe(200);
});
it("rejects forged callback before querying the provider", async () => {
  quote.order_id = "order_Existing";
  expect((await post({ action: "verify", quoteId, razorpay_order_id: "order_Existing",
    razorpay_payment_id: "pay_Forged", razorpay_signature: "f".repeat(64) })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects wrong origin before authentication", async () => {
  const response = await handleRentalCheckout(new Request("https://example.test", { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" }), "live");
  expect(response.status).toBe(403);
  expect(mock.authenticate).not.toHaveBeenCalled();
});
it("never uses live credentials or production database in test mode", () => {
  expect(rentalProvider("test", key => env[key])).toBeNull();
  env.SUPABASE_URL = "https://gwrdmpvczwuypvvzfyty.supabase.co";
  env.RENTAL_TEST_RAZORPAY_KEY_ID = "rzp_live_Wrong";
  env.RENTAL_TEST_RAZORPAY_KEY_SECRET = "synthetic-test-secret";
  expect(rentalProvider("test", key => env[key])).toBeNull();
  expect(rentalProvider("live", key => env[key])).toBeNull();
  env.RENTAL_TEST_RAZORPAY_KEY_ID = "rzp_test_Synthetic";
  expect(rentalProvider("test", key => env[key])).not.toBeNull();
});

it("rejects a typed digest without the completed PDF", async () => {
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  expect((await post({ action: "approve_manual", quoteId, memberId, confirmed: true,
    agreementHash: quote.agreement_hash, documentId: "manualdoc123", evidenceSha256: "b".repeat(64) })).status).toBe(400);
  expect(mock.upload).not.toHaveBeenCalled();
});
it("does not create a second order when the ledger reports an existing unresolved claim", async () => {
  mock.rpc.mockImplementation((_name, args) => ({ abortSignal: async () => ({ error: null,
    data: args.p_action === "claim_order" ? { ...quote, claimed: false } : quote }) }));
  expect((await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08" })).status).toBe(409);
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects a forged refund allocation before changing the ledger", async () => {
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  quote.payment_id = "pay_Real";
  fetcher.mockResolvedValue(Response.json({ id: "rfnd_Actual", payment_id: "pay_Other", amount: 10000, currency: "INR", status: "processed" }));
  expect((await post({ action: "allocate_refund", quoteId, memberId, refundId: "rfnd_Actual", rentPaise: 10000,
    depositPaise: 0, reason: "Approved actual partial rental refund" })).status).toBe(409);
  expect(mock.rpc.mock.calls.some(([, args]) => args.p_action === "allocate_refund")).toBe(false);
});
it("allows condition recording by independent MFA staff after checkout closure", async () => {
  env.LIVE_RENTAL_CHECKOUT_ENABLED = "false";
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  expect((await post({ action: "handover", quoteId, memberId, evidence: "Complete kit checked with both parties" })).status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith("rental_checkout", expect.objectContaining({ p_action: "handover",
    p_input: expect.objectContaining({ reviewerId, reviewerAal: "aal2" }) }));
});
