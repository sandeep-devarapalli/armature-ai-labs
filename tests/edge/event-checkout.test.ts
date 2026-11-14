// @vitest-environment node
// Edge functions run in Deno, a single-realm runtime; jsdom globals here break undici body parsing on Node 26.
import { beforeEach, expect, it, vi } from "vitest";
import { handleEventCheckout } from "../../supabase/functions/_shared/event-checkout";

const mock = vi.hoisted(() => ({ authenticate: vi.fn(), staff: vi.fn(), rpc: vi.fn(), owner: vi.fn(), upload: vi.fn() }));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({ authenticatedUser: mock.authenticate,
  requireStaff: mock.staff, adminClient: () => ({ storage: { from: () => ({ upload: mock.upload }) }, rpc: mock.rpc, auth: { admin: { getUserById: mock.owner } } }) }));
const memberId = "b0000000-0000-4000-8000-000000000001";
const quoteId = "b0000000-0000-4000-8000-000000000002";
const reviewerId = "b0000000-0000-4000-8000-000000000003";
const env: Record<string, string> = {};
const fetcher = vi.fn();
let quote: Record<string, unknown>;
async function post(body: object, mode: "live" | "test" = "live") {
  return handleEventCheckout(new Request("https://example.test/event-checkout", { method: "POST",
    headers: { origin: mode === "live" ? "https://armatureailabs.com" : "https://booking-staging.armature-lab.pages.dev", "content-type": "application/json" },
    body: JSON.stringify(body) }), mode);
}
const actions = () => mock.rpc.mock.calls.map(([, args]) => args.p_action);
const asStaff = () => mock.authenticate.mockResolvedValue({ id: reviewerId, email: "reviewer@example.test", claims: { aal: "aal2" } });
beforeEach(() => {
  vi.resetAllMocks();
  Object.keys(env).forEach(key => delete env[key]);
  Object.assign(env, { SUPABASE_URL: "https://uxfhdfagrmaeyuaipaar.supabase.co",
    LIVE_DESK_RAZORPAY_KEY_ID: "rzp_live_Synthetic", LIVE_DESK_RAZORPAY_KEY_SECRET: "synthetic-provider-secret",
    LIVE_DESK_RAZORPAY_WEBHOOK_SECRET: "independent-synthetic-webhook-secret", LIVE_DESK_RAZORPAY_ACCOUNT_ID: "acc_Synthetic",
    LIVE_EVENT_CHECKOUT_ENABLED: "true", LIVE_EVENT_POLICY_VERSION: "event-2026-11-09", LIVE_EVENT_PANDADOC_SIGNER: "staff@example.test" });
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
  vi.stubGlobal("fetch", fetcher);
  quote = { id: quoteId, event_date: "2027-03-13", start_time: "10:00:00", hours: 3, attendees: 20, purpose: "Synthetic robotics meetup",
    starts_at: "2027-03-13T04:30:00Z", ends_at: "2027-03-13T07:30:00Z", rent_paise: 750000, amount_paise: 750000,
    agreement_hash: "a".repeat(64), policy_version: "event-2026-11-09", approved_at: new Date().toISOString(),
    payment_window_at: new Date().toISOString(), document_id: "manualdoc123", order_id: null, order_claimed_at: null, status: "approved" };
  mock.authenticate.mockResolvedValue({ id: memberId, email: "buyer@example.test", claims: { aal: "aal1" } });
  mock.staff.mockResolvedValue(undefined);
  mock.upload.mockResolvedValue({ error: null });
  mock.owner.mockResolvedValue({ data: { user: { email: "buyer@example.test" } } });
  mock.rpc.mockImplementation((_name, args) => ({ abortSignal: async () => ({ error: null, data:
    args.p_action === "bind_order" ? { ...quote, order_id: args.p_input.orderId } : args.p_action === "claim_order" ? { ...quote, claimed: true } : quote }) }));
  fetcher.mockResolvedValue(Response.json({ id: "order_Synthetic", receipt: quoteId, amount: 750000, currency: "INR" }));
});
it("charges the server price rather than a caller's amount", async () => {
  const response = await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "event-2026-11-09", amount: 100 });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ amountPaise: 750000, mode: "live", orderId: "order_Synthetic" });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ amount: 750000, receipt: quoteId, notes: { purpose: "armature_event_live" } });
  expect(actions()).toEqual(["status", "claim_order", "bind_order"]);
  expect(mock.rpc.mock.calls[0][0]).toBe("event_checkout");
});
it.each([
  { approved_at: null }, { payment_window_at: "2000-01-01T00:00:00Z" }, { payment_window_at: "2999-01-01T00:00:00Z" },
  { status: "awaiting_staff" }, { status: "confirmed" }, { status: "cancelled" },
])("refuses payment without a fresh approved agreement %o", async change => {
  Object.assign(quote, change);
  expect((await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "event-2026-11-09" })).status).toBe(409);
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires current explicit policy acceptance", async () => {
  for (const extra of [{ acceptedPolicies: false }, { acceptedPolicies: true, policyVersion: "old" }]) {
    expect((await post({ action: "order", quoteId, ...extra })).status).toBe(409);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("reuses a bound order instead of creating another", async () => {
  quote.order_id = "order_Existing"; quote.status = "awaiting_payment";
  expect(await (await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "event-2026-11-09" })).json()).toMatchObject({ orderId: "order_Existing" });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  { date: "2027-03-13", startTime: "07:00", hours: 2, attendees: 10 },
  { date: "2027-03-10", startTime: "16:00", hours: 2, attendees: 10 },
  { date: "2027-03-13", startTime: "10:30", hours: 2, attendees: 10 },
  { date: "2027-03-13", startTime: "21:00", hours: 3, attendees: 10 },
  { date: "2027-03-13", startTime: "10:00", hours: 0, attendees: 10 },
  { date: "2027-03-13", startTime: "10:00", hours: 2, attendees: 36 },
  { date: "2027-03-13", startTime: "10:00", hours: 1.5, attendees: 10 },
])("rejects requests outside event rules %o", async selection => {
  expect((await post({ action: "quote", purpose: "Synthetic robotics meetup", ...selection })).status).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("passes a valid request to the ledger without a client price", async () => {
  const response = await post({ action: "quote", date: "2027-03-13", startTime: "10:00", hours: 3, attendees: 20, purpose: "  Synthetic robotics meetup ", amountPaise: 1 });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ amountPaise: 750000, startTime: "10:00", status: "approved" });
  expect(mock.rpc).toHaveBeenCalledWith("event_checkout", { p_action: "quote", p_member: memberId,
    p_input: { date: "2027-03-13", startTime: "10:00", hours: 3, attendees: 20, purpose: "Synthetic robotics meetup" } });
});
it("reports a taken slot as a conflict", async () => {
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: { code: "23P01" }, data: null }) }));
  const response = await post({ action: "quote", date: "2027-03-13", startTime: "10:00", hours: 3, attendees: 20, purpose: "Synthetic robotics meetup" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "event_slot_unavailable" });
});
it("requires independent staff MFA for approval actions", async () => {
  for (const action of ["prepare", "decline", "approve_manual", "reopen_payment", "manual_review", "recover_order", "staff_queue"]) {
    expect((await post({ action, quoteId, memberId })).status).toBe(403);
  }
  mock.authenticate.mockResolvedValue({ id: memberId, email: "buyer@example.test", claims: { aal: "aal2" } });
  expect((await post({ action: "prepare", quoteId, memberId })).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("sends staff approval with only the reviewed fields", async () => {
  asStaff(); quote.status = "awaiting_staff"; quote.approved_at = null;
  const response = await post({ action: "prepare", quoteId, memberId, particulars: { availabilityConfirmed: true, eventDetailsReviewed: true,
    termsVersion: "event-2026-11-09", setupNotes: "Theatre seating for twenty", priceOverride: 1 } });
  expect(response.status).toBe(200);
  expect(mock.rpc).toHaveBeenLastCalledWith("event_checkout", { p_action: "prepare", p_member: memberId, p_input: { quoteId, reviewerId, reviewerAal: "aal2",
    particulars: { availabilityConfirmed: true, eventDetailsReviewed: true, termsVersion: "event-2026-11-09", setupNotes: "Theatre seating for twenty" } } });
});
it("binds approval to the exact signed PDF", async () => {
  asStaff();
  const metadata = JSON.stringify({ action: "approve_manual", quoteId, memberId, confirmed: true, agreementHash: "a".repeat(64),
    documentId: "manualdoc123", evidenceSha256: "b".repeat(64), reviewerId: "forged" });
  const body = '--testboundary\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n' + metadata
    + '\r\n--testboundary\r\nContent-Disposition: form-data; name="completedPdf"; filename="signed.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-synthetic signed specimen\r\n--testboundary--\r\n';
  const request = new Request("https://example.test/event-checkout", { method: "POST",
    headers: { origin: "https://armatureailabs.com", "content-type": "multipart/form-data; boundary=testboundary" }, body });
  expect((await handleEventCheckout(request, "live")).status).toBe(200);
  const [path] = mock.upload.mock.calls[0];
  expect(path).toMatch(new RegExp("^" + quoteId + "/[0-9a-f]{64}\\.pdf$"));
  expect(mock.rpc).toHaveBeenLastCalledWith("event_checkout", expect.objectContaining({ p_action: "approve_manual",
    p_input: expect.objectContaining({ evidencePath: path, reviewerId, confirmedBothSigners: true }) }));
});
it("lets a member cancel with confirmation and a reason", async () => {
  expect((await post({ action: "cancel", quoteId, reason: "Synthetic change of plans" })).status).toBe(400);
  quote.status = "cancelled"; quote.refund_due_paise = 375000;
  const response = await post({ action: "cancel", quoteId, reason: "Synthetic change of plans", confirmed: true });
  expect(await response.json()).toMatchObject({ status: "cancelled", refundDuePaise: 375000 });
  expect(mock.rpc).toHaveBeenLastCalledWith("event_checkout", { p_action: "cancel", p_member: memberId,
    p_input: { quoteId, reason: "Synthetic change of plans", confirmed: true } });
});
it("keeps cancellation open when new checkout is closed", async () => {
  env.LIVE_EVENT_CHECKOUT_ENABLED = "false";
  expect((await post({ action: "quote", date: "2027-03-13", startTime: "10:00", hours: 3, attendees: 20, purpose: "Synthetic robotics meetup" })).status).toBe(503);
  expect((await post({ action: "cancel", quoteId, reason: "Synthetic change of plans", confirmed: true })).status).toBe(200);
});
it("stays closed without its own configuration", async () => {
  delete env.LIVE_EVENT_POLICY_VERSION;
  expect((await post({ action: "status", quoteId })).status).toBe(503);
  expect((await post({ action: "status", quoteId }, "test")).status).toBe(503);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("refuses the same person as customer and staff signer", async () => {
  mock.authenticate.mockResolvedValue({ id: memberId, email: "Staff@example.test", claims: { aal: "aal1" } });
  expect((await post({ action: "order", quoteId, acceptedPolicies: true, policyVersion: "event-2026-11-09" })).status).toBe(409);
  expect(fetcher).not.toHaveBeenCalled();
});
