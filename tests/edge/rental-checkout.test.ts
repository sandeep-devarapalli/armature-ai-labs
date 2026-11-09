
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

it("collects only rent for a bank-deposit quote after verification", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer", payment_amount_paise: 105000,
    deposit_verified_at: new Date().toISOString(), payment_window_at: new Date().toISOString() });
  fetcher.mockResolvedValue(Response.json({ id: "order_Synthetic", receipt: quoteId, amount: 105000, currency: "INR" }));
  const response = await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08" });
  expect(response.status).toBe(200);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).amount).toBe(105000);
});
it("blocks rent collection until the bank deposit is verified", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer", payment_amount_paise: 105000 });
  const response = await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08" });
  expect(await response.json()).toEqual({ error: "bank_deposit_verification_required" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("never verifies a bank credit as the buyer", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer" });
  expect((await post({ action: "verify_bank_deposit", quoteId, memberId, reference: "UTR123456", evidence: "Bank credit checked", confirmed: true })).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
function useStagingFixture() {
  Object.assign(env, { SUPABASE_URL: "https://gwrdmpvczwuypvvzfyty.supabase.co", RENTAL_TEST_RAZORPAY_KEY_ID: "rzp_test_Synthetic",
    RENTAL_TEST_RAZORPAY_KEY_SECRET: "synthetic-provider-secret", RENTAL_TEST_CHECKOUT_ENABLED: "true",
    RENTAL_TEST_POLICY_VERSION: "rental-2026-11-08", RENTAL_TEST_PANDADOC_SIGNER: "staff@example.test",
    RENTAL_TEST_FIXTURE_ENABLED: "true", RENTAL_TEST_FIXTURE_BUYER: memberId });
}
it("forwards a reference as unverified without granting anything", async () => {
  useStagingFixture();
  Object.assign(quote, { deposit_method: "bank_transfer", test_fixture: true });
  expect((await post({ action: "submit_deposit_reference", quoteId, reference: "test-utr123" }, "test")).status).toBe(200);
  expect(mock.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_action: "submit_deposit_reference", p_member: memberId,
    p_input: { reference: "TEST-UTR123", quoteId } });
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires verified server bank configuration for real transfer instructions", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer", test_fixture: false });
  expect(await (await post({ action: "submit_deposit_reference", quoteId, reference: "UTR123456" })).json()).toEqual({ error: "bank_instructions_not_configured" });
});
it("rejects user-selected tiny fixture prices on production", async () => {
  const response = await post({ action: "quote", product: "hiwonder", unit: "week", start: "2027-02-01", testFixture: true });
  expect(response.status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("allows fixed staging fixtures only for the configured test buyer", async () => {
  Object.assign(env, { SUPABASE_URL: "https://gwrdmpvczwuypvvzfyty.supabase.co", RENTAL_TEST_RAZORPAY_KEY_ID: "rzp_test_Synthetic",
    RENTAL_TEST_RAZORPAY_KEY_SECRET: "synthetic-provider-secret", RENTAL_TEST_CHECKOUT_ENABLED: "true",
    RENTAL_TEST_POLICY_VERSION: "rental-2026-11-08", RENTAL_TEST_PANDADOC_SIGNER: "staff@example.test",
    RENTAL_TEST_FIXTURE_ENABLED: "true", RENTAL_TEST_FIXTURE_BUYER: memberId });
  expect((await post({ action: "quote", product: "hiwonder", unit: "week", start: "2027-02-01", testFixture: true }, "test")).status).toBe(200);
  expect(mock.rpc.mock.calls[0][1].p_input).toMatchObject({ testFixture: true });
  env.RENTAL_TEST_FIXTURE_BUYER = reviewerId;
  expect((await post({ action: "quote", product: "hiwonder", unit: "week", start: "2027-02-01", testFixture: true }, "test")).status).toBe(403);
});
it("does not allocate a Razorpay refund to a bank deposit", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer", payment_id: "pay_Synthetic" });
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "staff@example.test", claims: { aal: "aal2" } });
  const response = await post({ action: "allocate_refund", quoteId, memberId, refundId: "rfnd_Synthetic", rentPaise: 0, depositPaise: 100,
    reason: "Deposit refunded separately" });
  expect(response.status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires explicit ownership confirmation for the refund account", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer" });
  const response = await post({ action: "save_refund_account", quoteId, accountName: "Synthetic Renter", bankName: "Synthetic Bank", accountNumber: "000000000001", ifsc: "TEST0000001", ownershipConfirmed: false });
  expect(response.status).toBe(400);
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_action)).toEqual(["status"]);
});
it("saves customer refund bank details only through the authenticated quote operation", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer" });
  const response = await post({ action: "save_refund_account", quoteId, accountName: "Synthetic Renter", bankName: "Synthetic Bank", accountNumber: "000000000001", ifsc: "TEST0000001", ownershipConfirmed: true });
  expect(response.status).toBe(200);
  expect(mock.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_member: memberId, p_action: "save_refund_account", p_input: { ownershipConfirmed: true } });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["get_refund_account", "verify_refund_account"])("requires independent MFA staff for %s", async action => {
  Object.assign(quote, { deposit_method: "bank_transfer" });
  expect((await post({ action, quoteId, memberId, version: 1, confirmed: true, evidence: "Synthetic review complete" })).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("binds a bank refund receipt to the exact reviewed beneficiary version", async () => {
  useStagingFixture();
  Object.assign(quote, { deposit_method: "bank_transfer", test_fixture: true });
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "staff@example.test", claims: { aal: "aal2" } });
  const payload = { action: "record_bank_deposit_refund", quoteId, memberId, reference: "TEST-OUT-001", evidence: "Synthetic transfer checked", confirmed: true, amountPaise: 10000 };
  expect((await post(payload, "test")).status).toBe(400);
  expect((await post({ ...payload, refundAccountVersion: 2 }, "test")).status).toBe(200);
  expect(mock.rpc.mock.calls.at(-1)?.[1].p_input.refundAccountVersion).toBe(2);
  expect(fetcher).not.toHaveBeenCalled();
});

it("never charges a persisted staging fixture through live keys", async () => {
  Object.assign(quote, { test_fixture: true, deposit_method: "bank_transfer", payment_amount_paise: 5000,
    deposit_verified_at: new Date().toISOString(), payment_window_at: new Date().toISOString() });
  expect((await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "rental-2026-11-08" })).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
const companyBank = JSON.stringify({ confirmedCompanyAccount: true, bankName: "Synthetic Bank", accountName: "Synthetic Company",
  accountNumber: "000000000002", ifsc: "TEST0000002", accountType: "Current" });
it("shows company bank instructions only to the member after signing and before verification", async () => {
  env.LIVE_RENTAL_BANK_INSTRUCTIONS = companyBank;
  Object.assign(quote, { deposit_method: "bank_transfer" });
  expect((await (await post({ action: "status", quoteId })).json()).bankInstructions).toMatchObject({ ifsc: "TEST0000002" });
  quote.approved_at = null;
  expect((await (await post({ action: "status", quoteId })).json()).bankInstructions).toBeNull();
  Object.assign(quote, { approved_at: new Date().toISOString(), deposit_verified_at: new Date().toISOString() });
  expect((await (await post({ action: "status", quoteId })).json()).bankInstructions).toBeNull();
  quote.deposit_verified_at = undefined;
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  expect((await (await post({ action: "manual_review", quoteId, memberId })).json()).bankInstructions).toBeNull();
});
it("does not read the unprefixed bank variable shared by live and staging", async () => {
  env.RENTAL_BANK_INSTRUCTIONS = companyBank;
  Object.assign(quote, { deposit_method: "bank_transfer" });
  expect((await (await post({ action: "status", quoteId })).json()).bankInstructions).toBeNull();
});
it("records a bank deposit refund even when company instructions are not configured", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer", status: "returned" });
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  const response = await post({ action: "record_bank_deposit_refund", quoteId, memberId, reference: "UTR-REFUND-001", confirmed: true,
    evidence: "Synthetic bank statement line checked", amountPaise: 1000, refundAccountVersion: 1 });
  expect(response.status).toBe(200);
});
it("rejects every action on a staging fixture quote outside the staging gate", async () => {
  Object.assign(quote, { deposit_method: "bank_transfer", test_fixture: true });
  const response = await post({ action: "submit_deposit_reference", quoteId, reference: "UTR-FIXTURE-001" });
  expect(response.status).toBe(403);
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_action)).toEqual(["status"]);
});
it("does not pass raw reconciliation rows through to the browser", async () => {
  mock.rpc.mockImplementation((_name, args) => ({ abortSignal: async () => ({ error: null, data:
    args.p_action === "capture" ? { ...quote, status: "confirmed", refund_account: { accountName: "Leaked" }, member_id: memberId } : quote }) }));
  Object.assign(quote, { order_id: "order_Synthetic" });
  fetcher.mockResolvedValue(Response.json({ items: [{ id: "pay_Synthetic", order_id: "order_Synthetic", amount: 2605000, currency: "INR",
    status: "captured", captured: true, method: "upi", created_at: 1 }] }));
  const body = await (await post({ action: "status", quoteId })).json();
  expect(body).not.toHaveProperty("refund_account");
  expect(body).not.toHaveProperty("member_id");
});
async function approveWith(documentId: string) {
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  const metadata = JSON.stringify({ action: "approve_manual", quoteId, memberId, confirmed: true, agreementHash: quote.agreement_hash, documentId });
  const body = '--testboundary\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n' + metadata
    + '\r\n--testboundary\r\nContent-Disposition: form-data; name="completedPdf"; filename="signed.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-synthetic signed specimen\r\n--testboundary--\r\n';
  return handleRentalCheckout(new Request("https://example.test/rental-checkout", { method: "POST",
    headers: { origin: "https://armatureailabs.com", "content-type": "multipart/form-data; boundary=testboundary" }, body }), "live");
}
it("requires a DocuSign envelope id when DocuSign was chosen for the final draft", async () => {
  quote.particulars = { signingProvider: "docusign" };
  expect((await approveWith("manualdoc123")).status).toBe(400);
  expect(mock.upload).not.toHaveBeenCalled();
  expect((await approveWith("3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b")).status).toBe(200);
});
it("rejects unknown signing providers in final particulars", async () => {
  mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
  expect((await post({ action: "prepare", quoteId, memberId, particulars: { signingProvider: "adobe-sign" } })).status).toBe(400);
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_action)).not.toContain("prepare");
});
it("passes any catalogue product code through and rejects malformed selections", async () => {
  expect((await post({ action: "quote", product: "cabin202", start: "2027-03-01", end: "2027-03-31" })).status).toBe(200);
  expect(mock.rpc).toHaveBeenLastCalledWith("rental_checkout", expect.objectContaining({ p_action: "quote",
    p_input: expect.objectContaining({ product: "cabin202", end: "2027-03-31" }) }));
  for (const bad of [{ product: "Cabin 202", start: "2027-03-01", end: "2027-03-31" }, { product: "jetson-nano", start: "2027-03-01" },
    { product: "jetson-nano", start: "2027-03-01", unit: "day" }, { product: "cabin202", start: "2027-03-01", end: "31-03-2027" }]) {
    expect((await post({ action: "quote", ...bad })).status).toBe(400);
  }
});
