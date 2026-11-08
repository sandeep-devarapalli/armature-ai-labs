import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RentalAgreementReview } from "../../src/components/RentalAgreementReview";
vi.mock("../../src/pages/MemberPages", () => ({ MfaPanel: () => <p>MFA panel</p> }));
vi.mock("../../src/lib/supabase", () => ({ supabase: null }));
const quoteId = "a0000000-0000-4000-8000-000000000002";
const base = { mode: "live", quoteId, product: "cabin101", unit: "month", start: "2027-02-01", end: "2027-02-28",
  rentPaise: 4000000, depositPaise: 8000000, amountPaise: 12000000, agreementHash: "a".repeat(64), policyVersion: "rental-v1",
  approvedAt: null, preparedAt: null, agreementSigned: false, hasOrder: false, orderPending: false, status: "awaiting_staff",
  customerEmail: "buyer@example.test", staffEmail: "staff@example.test" };
afterEach(() => vi.unstubAllGlobals());
const invoke = vi.fn(), getSession = vi.fn(), getAssurance = vi.fn();
const client = { functions: { invoke }, auth: { getSession, mfa: { getAuthenticatorAssuranceLevel: getAssurance } } } as unknown as SupabaseClient;
beforeEach(() => { vi.clearAllMocks(); getSession.mockResolvedValue({ data: { session: { user: { id: "staff" }, access_token: "synthetic-token" } } });
  getAssurance.mockResolvedValue({ data: { currentLevel: "aal2" } }); invoke.mockResolvedValue({ data: base }); });
function setup(actorId = "staff") {
  render(<RentalAgreementReview client={client} actorId={actorId} memberId="buyer" onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByText("Review a cabin or equipment agreement"));
  fireEvent.change(screen.getByLabelText("Rental agreement reference"), { target: { value: quoteId } });
}
it("requires the current independent MFA session and pins its Authorization", async () => {
  setup(); getAssurance.mockResolvedValueOnce({ data: { currentLevel: "aal1" } });
  fireEvent.click(screen.getByRole("button", { name: "Find rental agreement" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("MFA"); expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Find rental agreement" }));
  await screen.findByText("1. Confirm the final draft and particulars");
  expect(invoke).toHaveBeenCalledWith("rental-checkout", { body: { action: "manual_review", memberId: "buyer", quoteId }, headers: { Authorization: "Bearer synthetic-token" } });
});
it("refuses a changed actor and self review", async () => {
  setup(); getSession.mockResolvedValue({ data: { session: { user: { id: "changed" }, access_token: "other" } } });
  fireEvent.click(screen.getByRole("button", { name: "Find rental agreement" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("current Admin"); expect(invoke).not.toHaveBeenCalled();
});
it("prepares explicit particulars before showing signed PDF approval", async () => {
  setup(); fireEvent.click(screen.getByRole("button", { name: "Find rental agreement" }));
  await screen.findByText("1. Confirm the final draft and particulars");
  expect(screen.queryByRole("button", { name: "Approve rental agreement" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("I confirmed availability and the final terms with the customer."));
  fireEvent.change(screen.getByLabelText("Confirmed maximum occupants"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Daily access starts"), { target: { value: "09:00" } });
  fireEvent.change(screen.getByLabelText("Daily access ends"), { target: { value: "17:00" } });
  fireEvent.change(screen.getByLabelText("Included facilities and keys"), { target: { value: "Four chairs and one key" } });
  fireEvent.change(screen.getByLabelText("Permitted users, one name per line"), { target: { value: "Sample renter" } });
  fireEvent.change(screen.getByLabelText("Stamping decision"), { target: { value: "yes" } });
  fireEvent.change(screen.getByLabelText("Stamp-paper reference, if required"), { target: { value: "stamp-test-1" } });
  fireEvent.change(screen.getByLabelText("Executed-agreement records policy reference"), { target: { value: "Reviewed restricted records policy reference" } });
  fireEvent.change(screen.getByLabelText("Stamping decision reason"), { target: { value: "Reviewed manual stamping completed" } });
  invoke.mockResolvedValueOnce({ data: { ...base, preparedAt: "2026-11-08T10:00:00Z", agreementHash: "b".repeat(64) } });
  fireEvent.click(screen.getByRole("button", { name: "Save final particulars" }));
  await screen.findByRole("button", { name: "Approve rental agreement" });
  expect(invoke.mock.calls.at(-1)?.[1].body.particulars).toEqual({ availabilityConfirmed: true, termsVersion: "rental-v1", capacity: 4,
    accessStart: "09:00", accessEnd: "17:00", includedFacilities: "Four chairs and one key", permittedUsers: ["Sample renter"], stampRequired: true,
    stampDecisionReason: "Reviewed manual stamping completed", recordsPolicyReference: "Reviewed restricted records policy reference", stampReference: "stamp-test-1" });
});
it("uploads the completed PDF rather than merely recording a local hash", async () => {
  invoke.mockResolvedValueOnce({ data: { ...base, preparedAt: "2026-11-08T10:00:00Z" } });
  setup(); fireEvent.click(screen.getByRole("button", { name: "Find rental agreement" }));
  await screen.findByRole("button", { name: "Approve rental agreement" });
  fireEvent.change(screen.getByLabelText("PandaDoc document ID"), { target: { value: "synthetic-document" } });
  fireEvent.change(screen.getByLabelText("Fingerprint from the signed agreement"), { target: { value: base.agreementHash } });
  const pdf = new File(["%PDF-test specimen"], "signed.pdf", { type: "application/pdf" });
  Object.defineProperty(pdf, "slice", { value: () => ({ text: async () => "%PDF-" }) });
  fireEvent.change(screen.getByLabelText("Completed rental PDF with signature certificate"), { target: { files: [pdf] } });
  const NativeFormData = FormData;
  vi.stubGlobal("FormData", class extends NativeFormData { constructor(form?: HTMLFormElement) { super(form); if (form?.querySelector('[name="completedPdf"]')) this.set("completedPdf", pdf); } });
  fireEvent.click(screen.getByLabelText("I checked both signers, final terms, any stamp evidence and the exact quote."));
  invoke.mockResolvedValueOnce({ data: { ...base, agreementSigned: true, approvedAt: "2026-11-08T10:00:00Z" } });
  fireEvent.submit(screen.getByRole("button", { name: "Approve rental agreement" }).closest("form")!);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  const body = invoke.mock.calls[1][1].body as FormData;
  expect(body).toBeInstanceOf(FormData); expect(body.get("completedPdf")).toBeInstanceOf(File);
  expect(JSON.parse(String(body.get("metadata")))).toMatchObject({ action: "approve_manual", memberId: "buyer", quoteId, agreementHash: base.agreementHash, confirmed: true });
});
it("disables review for the buyer's own account", () => { setup("buyer"); expect(screen.getByRole("button", { name: "Find rental agreement" })).toBeDisabled(); });
it("records a processed refund split in paise without creating a refund", async () => {
  invoke.mockResolvedValueOnce({ data: { ...base, agreementSigned: true, bookingId: "booking-fixture", status: "confirmed" } });
  setup(); fireEvent.click(screen.getByRole("button", { name: "Find rental agreement" }));
  fireEvent.click(await screen.findByText("Allocate an already processed refund"));
  fireEvent.change(screen.getByLabelText("Processed refund ID"), { target: { value: "rfnd_Processed" } });
  fireEvent.change(screen.getByLabelText("Rent refunded, rupees"), { target: { value: "100.50" } });
  fireEvent.change(screen.getByLabelText("Deposit refunded, rupees"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("Refund allocation reason"), { target: { value: "Reviewed provider refund breakdown" } });
  invoke.mockResolvedValueOnce({ data: { ...base, agreementSigned: true, bookingId: "booking-fixture", status: "confirmed" } });
  fireEvent.click(screen.getByRole("button", { name: "Record processed refund split" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(invoke.mock.calls[1][1].body).toEqual({ action: "allocate_refund", memberId: "buyer", quoteId,
    refundId: "rfnd_Processed", rentPaise: 10050, depositPaise: 50000, reason: "Reviewed provider refund breakdown" });
});
it("creates a separate monthly rent request only after unchanged-terms confirmation", async () => {
  invoke.mockResolvedValueOnce({ data: { ...base, agreementSigned: true, bookingId: "booking-fixture", status: "confirmed" } });
  setup(); fireEvent.click(screen.getByRole("button", { name: "Find rental agreement" }));
  await screen.findByRole("button", { name: "Prepare next month's rent" });
  fireEvent.change(screen.getByLabelText("Next unpaid month's first date"), { target: { value: "2027-03-01" } });
  fireEvent.click(screen.getByLabelText("The original agreement terms and approved users are unchanged."));
  invoke.mockResolvedValueOnce({ data: { ...base, quoteId: "a0000000-0000-4000-8000-000000000003", parentQuoteId: quoteId,
    start: "2027-03-01", end: "2027-03-31", agreementSigned: true, approvedAt: "2027-02-20T10:00:00Z", depositPaise: 0, amountPaise: 4000000, status: "approved" } });
  fireEvent.click(screen.getByRole("button", { name: "Prepare next month's rent" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(invoke.mock.calls[1][1].body).toEqual({ action: "renewal_quote", memberId: "buyer", quoteId, parentQuoteId: quoteId, start: "2027-03-01", confirmed: true });
  expect(await screen.findByText("2027-03-01 to 2027-03-31")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Prepare next month's rent" })).not.toBeInTheDocument();
});
it("discovers only the selected member's requests and opens the chosen quote", async () => {
  invoke.mockResolvedValueOnce({ data: { mode: "live", quotes: [
    { ...base, memberId: "buyer" }, { ...base, quoteId: "other-quote", memberId: "another-buyer", start: "2027-04-01" },
  ] } });
  setup(); fireEvent.click(screen.getByRole("button", { name: "Load this member's rental requests" }));
  const request = await screen.findByRole("button", { name: "Cabin 101 · 2027-02-01 · Awaiting staff review" });
  expect(screen.queryByText(/2027-04-01/)).not.toBeInTheDocument();
  expect(invoke.mock.calls[0][1].body).toEqual({ action: "staff_queue", offset: 0 });
  fireEvent.click(request);
  await screen.findByText("1. Confirm the final draft and particulars");
  expect(invoke.mock.calls[1][1].body).toEqual({ action: "manual_review", memberId: "buyer", quoteId });
});
