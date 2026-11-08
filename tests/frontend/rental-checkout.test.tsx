import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RentalCheckoutPage from "../../src/components/RentalCheckout";
import type { RentalQuote } from "../../src/lib/rental-checkout";
const mock = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), verified: true, signedIn: true, checkout: vi.fn(), open: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ accountMembershipLevelsEnabled: () => true,
  useAccount: () => ({ account: { user_id: "buyer", membership_level: mock.verified ? "verified" : "basic" }, signedIn: mock.signedIn, refresh: mock.refresh }) }));
vi.mock("../../src/lib/rental-checkout", () => ({ rentalMode: "test", rentalRequest: mock.request,
  rentalMoney: (value: number) => "₹" + value / 100 }));
vi.mock("../../src/lib/razorpay-checkout", () => ({ loadRazorpayCheckout: async () => class {
  constructor(options: unknown) { mock.checkout(options); }
  on() {} close() {} open() { mock.open(); }
} }));
const quote = { quoteId: "a0000000-0000-4000-8000-000000000001", product: "cabin101" as const, unit: "month",
  start: "2027-02-01", end: "2027-02-28", rentPaise: 4000000, depositPaise: 8000000, amountPaise: 12000000,
  agreementHash: "a".repeat(64), policyVersion: "rental-v1", status: "awaiting_staff", agreementSigned: false, hasOrder: false };
function show() { return render(<StrictMode><MemoryRouter><RentalCheckoutPage /></MemoryRouter></StrictMode>); }
beforeEach(() => { vi.clearAllMocks(); mock.verified = true; mock.signedIn = true;
  mock.request.mockImplementation(async body => body.action === "availability" ? { available: true } : quote); });
afterEach(cleanup);
it("shows distinct customer, Armature and staff actions", () => {
  show();
  expect(screen.getByText("Customer signs, then Armature countersigns")).toBeInTheDocument();
  expect(screen.getByText("Transfer the deposit; staff verifies bank receipt")).toBeInTheDocument();
  expect(screen.getByText("Pay rent through Razorpay and receive confirmation")).toBeInTheDocument();
  expect(screen.getByText(/Test bookings/)).toBeInTheDocument();
});
it("checks availability before requesting a full-calendar cabin quote in StrictMode", async () => {
  show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await screen.findByText("₹120000");
  expect(mock.request.mock.calls.map(([body]) => body.action)).toEqual(["availability", "quote"]);
  expect(mock.request).toHaveBeenLastCalledWith(expect.objectContaining({ product: "cabin101", start: "2027-02-01", end: "2027-02-28" }), "buyer");
  expect(screen.queryByRole("button", { name: /Pay with Razorpay/ })).not.toBeInTheDocument();
});
it("does not create a quote for unavailable dates", async () => {
  mock.request.mockResolvedValue({ available: false }); show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await screen.findByRole("alert");
  expect(mock.request).toHaveBeenCalledTimes(1);
});
it("requires Verified membership and does not imply kit payment supplies workspace", () => {
  mock.verified = false; show();
  expect(screen.getByRole("button", { name: "Request agreement" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "hiwonder" } });
  expect(screen.getByText(/Active workspace access is required throughout/)).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "7 days · ₹1,050 rent" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "30 days · ₹3,900 rent" })).toBeInTheDocument();
});
it("drops an in-flight response after the member screen unmounts", async () => {
  let resolve!: (value: object) => void;
  mock.request.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await waitFor(() => expect(mock.request).toHaveBeenCalledTimes(1));
  view.unmount(); resolve({ available: true });
  await Promise.resolve();
  expect(mock.request).toHaveBeenCalledTimes(1);
});

it.each([
  ["awaiting_staff", "Awaiting draft preparation"],
  ["awaiting_signatures", "Ready for customer and Armature signatures"],
  ["awaiting_payment", "Payment pending; check payment status"],
])("shows the server's %s stage without inventing per-signer progress", async (status, label) => {
  mock.request.mockImplementation(async body => body.action === "availability" ? { available: true } : { ...quote, status });
  show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Check agreement or payment status" })).toBeEnabled();
});

const savedRefundAccount = { version: 1, accountName: "Synthetic Renter", bankName: "Synthetic Bank", ifsc: "TEST0000001", last4: "0001", verifiedAt: null, ownershipConfirmed: true };
const bankQuote: RentalQuote = { refundAccount: savedRefundAccount, ...quote, rentPaise: 5000, depositPaise: 10000, amountPaise: 15000, paymentAmountPaise: 5000,
  depositMethod: "bank_transfer", depositStatus: "pending", status: "awaiting_deposit", agreementSigned: true,
  testFixture: true, bankInstructions: null, approvedAt: "2026-11-08T10:00:00Z", orderPending: false };
async function openBankQuote(value = bankQuote) {
  mock.request.mockImplementation(async body => body.action === "availability" ? { available: true } : value);
  show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await screen.findByText("Bank-transfer deposit");
}
it("keeps rent checkout disabled until independent deposit verification", async () => {
  await openBankQuote();
  expect(screen.getByText("₹50 rent only")).toBeInTheDocument();
  expect(screen.getByText("Awaiting bank deposit verification")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/I accept the/));
  expect(screen.getByRole("button", { name: "Pay rent with Razorpay Test Mode" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Simulated bank transfer reference"), { target: { value: "TEST-BANK-100" } });
  mock.request.mockResolvedValueOnce({ ...bankQuote, depositStatus: "submitted", depositReference: "TEST-BANK-100" });
  fireEvent.click(screen.getByRole("button", { name: "Submit deposit reference for review" }));
  await screen.findByText("TEST-BANK-100");
  expect(mock.request).toHaveBeenLastCalledWith({ action: "submit_deposit_reference", quoteId: quote.quoteId, reference: "TEST-BANK-100" }, "buyer");
  expect(screen.getByRole("button", { name: "Pay rent with Razorpay Test Mode" })).toBeDisabled();
});
it("sends only the server-approved rent to Razorpay for bank-deposit quotes", async () => {
  await openBankQuote({ ...bankQuote, depositStatus: "verified", status: "approved" });
  fireEvent.click(screen.getByLabelText(/I accept the/));
  mock.request.mockResolvedValueOnce({ keyId: "rzp_test_Fixture", orderId: "order_Fixture", amountPaise: 5000, currency: "INR" });
  fireEvent.click(screen.getByRole("button", { name: "Pay rent with Razorpay Test Mode" }));
  await waitFor(() => expect(mock.open).toHaveBeenCalledOnce());
  expect(mock.checkout).toHaveBeenCalledWith(expect.objectContaining({ amount: 5000, description: "TEST SPECIMEN · Cabin 101 rent only" }));
});
it("rejects a combined payment amount for a rent-only quote", async () => {
  await openBankQuote({ ...bankQuote, depositStatus: "verified", status: "approved" });
  fireEvent.click(screen.getByLabelText(/I accept the/));
  mock.request.mockResolvedValueOnce({ keyId: "rzp_test_Fixture", orderId: "order_Fixture", amountPaise: 15000, currency: "INR" });
  fireEvent.click(screen.getByRole("button", { name: "Pay rent with Razorpay Test Mode" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("does not match");
  expect(mock.open).not.toHaveBeenCalled();
});
it("does not invent bank instructions or invite a transfer when none are configured", async () => {
  await openBankQuote({ ...bankQuote, testFixture: false, bankInstructions: null });
  expect(screen.getByText(/Bank instructions are not available yet/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit deposit reference for review" })).not.toBeInTheDocument();
});
it("shows configured company bank details only after agreement approval", async () => {
  const instructions = { bankName: "Synthetic Bank", accountName: "Synthetic Company", accountNumber: "000000000001", ifsc: "TEST0000002", accountType: "Current" };
  await openBankQuote({ ...bankQuote, testFixture: false, bankInstructions: instructions });
  expect(screen.getByText("Synthetic Company")).toBeInTheDocument();
  expect(screen.getByText("TEST0000002")).toBeInTheDocument();
  cleanup();
  await openBankQuote({ ...bankQuote, testFixture: false, agreementSigned: false, bankInstructions: instructions });
  expect(screen.queryByText("Synthetic Company")).not.toBeInTheDocument();
  expect(screen.getByText("Complete agreement review and signing before transferring the deposit.")).toBeInTheDocument();
});

it("shows the verified receipt reference separately from the customer's submitted reference", async () => {
  await openBankQuote({ ...bankQuote, depositStatus: "verified", status: "approved", depositReference: "CUSTOMER-REFERENCE",
    depositVerifiedReference: "BANK-CREDIT-100", depositVerifiedAt: "2026-11-08T10:00:00Z",
    depositReceipts: [{ receiptNumber: "ARM-DEP-202611-000001", direction: "received", amountPaise: 10000, reference: "BANK-CREDIT-100", recordedAt: "2026-11-08T10:00:00Z" }] });
  expect(screen.getByText("Security deposit receipt · Test specimen, no money moved")).toBeInTheDocument();
  expect(screen.getByText("ARM-DEP-202611-000001")).toBeInTheDocument();
  expect(screen.getByText("BANK-CREDIT-100")).toBeInTheDocument();
  expect(screen.queryByText("CUSTOMER-REFERENCE")).not.toBeInTheDocument();
  expect(screen.getByText(/8\/11\/2026.*IST/)).toBeInTheDocument();
});

it("requires matching bank account entries and saves the refund account without echoing its full number", async () => {
  await openBankQuote({ ...bankQuote, refundAccount: null });
  expect(screen.queryByRole("button", { name: "Submit deposit reference for review" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Account holder name"), { target: { value: "Synthetic Renter" } });
  fireEvent.change(screen.getByLabelText("Bank name"), { target: { value: "Synthetic Bank" } });
  fireEvent.change(screen.getByLabelText("Account number", { exact: true }), { target: { value: "000000000001" } });
  fireEvent.change(screen.getByLabelText("Confirm account number"), { target: { value: "000000000002" } });
  fireEvent.change(screen.getByLabelText("IFSC", { exact: true }), { target: { value: "TEST0000001" } });
  fireEvent.click(screen.getByLabelText(/This account belongs to the person or company/));
  fireEvent.click(screen.getByRole("button", { name: "Save refund account securely" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
  expect(mock.request).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText("Confirm account number"), { target: { value: "000000000001" } });
  mock.request.mockResolvedValueOnce(bankQuote);
  fireEvent.click(screen.getByRole("button", { name: "Save refund account securely" }));
  expect(await screen.findByText("Ending 0001")).toBeInTheDocument();
  expect(screen.queryByText("TEST0000001")).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("000000000001")).not.toBeInTheDocument();
  expect(mock.request).toHaveBeenLastCalledWith({ action: "save_refund_account", quoteId: quote.quoteId,
    accountName: "Synthetic Renter", bankName: "Synthetic Bank", accountNumber: "000000000001", ifsc: "TEST0000001", ownershipConfirmed: true }, "buyer");
});
it("warns that editing a saved refund account requires a fresh review", async () => {
  await openBankQuote({ ...bankQuote, refundAccount: { ...savedRefundAccount, verifiedAt: "2026-11-08T10:00:00Z" } });
  fireEvent.click(screen.getByRole("button", { name: "Change refund account" }));
  expect(screen.getByText(/Changing the account requires a fresh staff review/)).toBeInTheDocument();
  expect(screen.getByLabelText("Account number", { exact: true })).toHaveValue("");
});

it("issues a separate refund receipt showing only the last four account digits", async () => {
  await openBankQuote({ ...bankQuote, depositStatus: "refunded", status: "returned", bankDepositRefundedPaise: 10000,
    depositReceipts: [{ receiptNumber: "ARM-DEP-202611-000001", direction: "received", amountPaise: 10000, reference: "SIM-IN-0001", recordedAt: "2026-11-08T10:00:00Z" },
      { receiptNumber: "ARM-DRF-202612-000002", direction: "refunded", amountPaise: 10000, reference: "SIM-OUT-0001", recordedAt: "2026-12-08T10:00:00Z", refundAccountLast4: "4321" }] });
  expect(screen.getByText("Security deposit refund receipt · Test specimen, no money moved")).toBeInTheDocument();
  expect(screen.getByText("ARM-DRF-202612-000002")).toBeInTheDocument();
  expect(screen.getByText("Ending 4321")).toBeInTheDocument();
  expect(screen.getAllByText(/not rent or income and carries no GST/)).toHaveLength(2);
});
