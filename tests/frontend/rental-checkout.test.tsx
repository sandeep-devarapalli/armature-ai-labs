import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RentalCheckoutPage, { RentalBooking } from "../../src/components/RentalCheckout";
import type { RentalQuote } from "../../src/lib/rental-checkout";
const mock = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), verified: true, signedIn: true, checkout: vi.fn(), open: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ accountMembershipLevelsEnabled: () => true,
  useAccount: () => ({ account: { user_id: "buyer", membership_level: mock.verified ? "verified" : "basic" }, signedIn: mock.signedIn, refresh: mock.refresh }) }));
vi.mock("../../src/lib/rental-checkout", () => ({ rentalMode: "test", rentalRequest: mock.request,
  rentalMoney: (value: number) => "₹" + value / 100, rentalLabel: (q: { product: string; productName?: string }) => q.productName ?? q.product }));
vi.mock("../../src/lib/razorpay-checkout", () => ({ loadRazorpayCheckout: async () => class {
  constructor(options: unknown) { mock.checkout(options); }
  on() {} close() {} open() { mock.open(); }
} }));
const products = [
  { product: "cabin101", kind: "cabin", name: "Cabin 101", floor: "Ground floor", billableSeats: null, extraSeats: 0, monthlyRentPaise: 4000000,
    weekRentPaise: null, monthRentPaise: null, depositPaise: 8000000, availableFrom: "2027-02-01", status: "available", quantity: 1 },
  { product: "cabin201", kind: "cabin", name: "Cabin 201", floor: "Top floor", billableSeats: 10, extraSeats: 2, monthlyRentPaise: 15000000,
    weekRentPaise: null, monthRentPaise: null, depositPaise: null, availableFrom: null, status: "coming_soon", quantity: 0 },
  { product: "hiwonder", kind: "equipment", name: "Hiwonder robotics kit", floor: null, billableSeats: null, extraSeats: 0, monthlyRentPaise: null,
    weekRentPaise: 105000, monthRentPaise: 390000, depositPaise: 2500000, availableFrom: null, status: "available", quantity: 1 },
  { product: "waveshare-ov5693", kind: "equipment", name: "OV5693 5MP USB Camera (A)", floor: null, billableSeats: null, extraSeats: 0, monthlyRentPaise: null,
    weekRentPaise: 100000, monthRentPaise: 200000, dayRentPaise: 20000, depositPaise: 0, availableFrom: null, status: "available", quantity: 2 },
];
const quote = { quoteId: "a0000000-0000-4000-8000-000000000001", product: "cabin101", kind: "cabin" as const, productName: "Cabin 101", unit: "month" as const,
  start: "2027-02-01", end: "2027-02-28", rentPaise: 4000000, depositPaise: 8000000, amountPaise: 12000000,
  agreementHash: "a".repeat(64), policyVersion: "rental-v1", status: "awaiting_staff", agreementSigned: false, hasOrder: false };
// The product list loads on mount; these helpers look only at the booking calls after it.
const flow = () => mock.request.mock.calls.filter(([body]) => !(body.action === "availability" && body.product === undefined));
async function show() {
  const view = render(<StrictMode><MemoryRouter><RentalCheckoutPage /></MemoryRouter></StrictMode>);
  if (mock.signedIn) await screen.findByRole("option", { name: /Cabin 101/ });
  return view;
}
beforeEach(() => { vi.clearAllMocks(); mock.verified = true; mock.signedIn = true;
  mock.request.mockImplementation(async body => body.action === "availability" ? (body.product ? { available: true } : { products }) : quote); });
afterEach(cleanup);
it("shows distinct customer, Armature and staff actions", async () => {
  await show();
  expect(screen.getByText("Customer signs, then Armature countersigns")).toBeInTheDocument();
  expect(screen.getByText("Transfer the deposit; staff verifies bank receipt")).toBeInTheDocument();
  expect(screen.getByText("Pay rent through Razorpay and receive confirmation")).toBeInTheDocument();
  expect(screen.getByText(/Test bookings/)).toBeInTheDocument();
});
it("checks availability before requesting a full-calendar cabin quote in StrictMode", async () => {
  await show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await screen.findByText("₹120000");
  expect(flow().map(([body]) => body.action)).toEqual(["availability", "quote"]);
  expect(mock.request).toHaveBeenLastCalledWith(expect.objectContaining({ product: "cabin101", start: "2027-02-01", end: "2027-02-28" }), "buyer");
  expect(screen.queryByRole("button", { name: /Pay with Razorpay/ })).not.toBeInTheDocument();
});
it("does not create a quote for unavailable dates", async () => {
  mock.request.mockImplementation(async body => body.product ? { available: false } : { products }); await show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await screen.findByRole("alert");
  expect(flow()).toHaveLength(1);
});
it("requires Verified membership and does not imply kit payment supplies workspace", async () => {
  mock.verified = false; await show();
  expect(screen.getByRole("button", { name: "Request agreement" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "hiwonder" } });
  expect(screen.getByText(/Active workspace access is required throughout/)).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "7 days · ₹1050 rent" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "30 days · ₹3900 rent" })).toBeInTheDocument();
});
it("drops an in-flight response after the member screen unmounts", async () => {
  let resolve!: (value: object) => void;
  mock.request.mockImplementation(body => body.product === undefined && body.action === "availability" ? Promise.resolve({ products }) : new Promise(r => { resolve = r; }));
  const view = await show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await waitFor(() => expect(flow()).toHaveLength(1));
  view.unmount(); resolve({ available: true });
  await Promise.resolve();
  expect(flow()).toHaveLength(1);
});

it.each([
  ["awaiting_staff", "Request received"],
  ["awaiting_signatures", "Ready to sign"],
  ["awaiting_payment", "Payment pending"],
])("shows the server's %s stage without inventing per-signer progress", async (status, label) => {
  mock.request.mockImplementation(async body => body.action === "availability" ? (body.product ? { available: true } : { products }) : { ...quote, status });
  await show();
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
  mock.request.mockImplementation(async body => body.action === "availability" ? (body.product ? { available: true } : { products }) : value);
  await show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await screen.findByText("Bank-transfer deposit");
}
it("keeps rent checkout disabled until independent deposit verification", async () => {
  await openBankQuote();
  expect(screen.getByText("₹50 rent only")).toBeInTheDocument();
  expect(screen.getByText("Deposit needed")).toBeInTheDocument();
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
  expect(flow()).toHaveLength(2);
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
it("lists catalogue items with their own prices and keeps unpriced cabins unselectable", async () => {
  await show();
  expect(screen.getByRole("option", { name: "Cabin 201 · Top floor · Coming soon" })).toBeDisabled();
  expect(screen.getByText(/₹40000 monthly rent plus ₹80000 refundable/)).toBeInTheDocument();
  expect(screen.getByLabelText("Start date")).toHaveAttribute("min", "2027-02-01");
});
it("says No deposit for equipment without one", async () => {
  await show();
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "waveshare-ov5693" } });
  expect(await screen.findByText(/2 units\..*No deposit; no GST added\./)).toBeInTheDocument();
});
it("offers only the rental periods a product has prices for", async () => {
  await show();
  const periods = () => Array.from((screen.getByLabelText("Rental period") as HTMLSelectElement).options).map(option => option.value);
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "waveshare-ov5693" } });
  await waitFor(() => expect(periods()).toEqual(["day", "week", "month"]));
  expect(screen.getByRole("option", { name: /^1 day, 9am to 5pm · ₹200/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "hiwonder" } });
  await waitFor(() => expect(periods()).toEqual(["week", "month"]));
});

it("starts on the product the bookings page chose, and falls back when it is not available", async () => {
  render(<MemoryRouter><RentalBooking initialProduct="waveshare-ov5693" /></MemoryRouter>);
  await waitFor(() => expect((screen.getByLabelText("What would you like?") as HTMLSelectElement).value).toBe("waveshare-ov5693"));
  cleanup();
  render(<MemoryRouter><RentalBooking initialProduct="cabin201" /></MemoryRouter>);
  await waitFor(() => expect((screen.getByLabelText("What would you like?") as HTMLSelectElement).value).toBe("cabin101"));
});

const currentStep = () => screen.queryByRole("listitem", { current: "step" })?.textContent;
const stepCount = () => screen.getByRole("list", { name: "Rental booking steps" }).querySelectorAll("li").length;
async function openQuote(value: RentalQuote) {
  mock.request.mockImplementation(async body => body.action === "availability" ? (body.product ? { available: true } : { products }) : value);
  await show();
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.change(screen.getByLabelText("Last day of the final month"), { target: { value: "2027-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await screen.findByRole("button", { name: "Copy full reference" });
}

it("starts on the first step and hides the deposit step for items without a deposit", async () => {
  await show();
  expect(currentStep()).toBe("1Choose product and dates");
  expect(stepCount()).toBe(6);
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "waveshare-ov5693" } });
  await waitFor(() => expect(stepCount()).toBe(5));
  expect(screen.queryByText("Transfer the deposit; staff verifies bank receipt")).not.toBeInTheDocument();
});

it.each([
  ["awaiting_staff", "2Review the draft and request corrections"],
  ["awaiting_signatures", "3Customer signs, then Armature countersigns"],
])("marks the current step for a %s quote", async (status, step) => {
  await openQuote({ ...quote, status } as RentalQuote);
  expect(currentStep()).toBe(step);
});

it("moves from the deposit step to payment once staff verify the bank deposit", async () => {
  await openBankQuote();
  expect(currentStep()).toBe("5Transfer the deposit; staff verifies bank receipt");
  expect(screen.getAllByText("(done)")).toHaveLength(4);
  cleanup();
  await openBankQuote({ ...bankQuote, depositStatus: "verified", status: "approved" });
  expect(currentStep()).toBe("6Pay rent through Razorpay and receive confirmation");
});

it("numbers payment as step 5 when the quote has no deposit, and marks every step done once confirmed", async () => {
  const noDeposit = { ...quote, depositPaise: 0, amountPaise: 4000000, agreementSigned: true, approvedAt: "2026-11-08T10:00:00Z", orderPending: false } as RentalQuote;
  await openQuote({ ...noDeposit, status: "approved" });
  expect(stepCount()).toBe(5);
  expect(currentStep()).toBe("5Pay rent through Razorpay and receive confirmation");
  cleanup();
  await openQuote({ ...noDeposit, status: "confirmed" });
  expect(currentStep()).toBeUndefined();
  expect(screen.getAllByText("(done)")).toHaveLength(5);
});

it("adds the camera to an arm rental with the combined rent and no day option", async () => {
  const arm = { product: "thinkrobotics-so101", kind: "equipment", name: "SO-101 robotic arm", maker: "ThinkRobotics", floor: null, billableSeats: null, extraSeats: 0,
    monthlyRentPaise: null, weekRentPaise: 80000, monthRentPaise: 250000, dayRentPaise: null, depositPaise: 2500000, availableFrom: null, status: "available",
    quantity: 1, addonCodes: ["waveshare-ov5693"] };
  mock.request.mockImplementation(async body => body.action === "availability" ? (body.product ? { available: true } : { products: [...products, arm] }) : quote);
  await show();
  const periods = () => Array.from((screen.getByLabelText("Rental period") as HTMLSelectElement).options).map(option => option.textContent);
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "thinkrobotics-so101" } });
  fireEvent.click(await screen.findByLabelText(/Add the OV5693 5MP USB Camera \(A\)/));
  await waitFor(() => expect(periods()).toEqual(["7 days · ₹1800 rent", "30 days · ₹4500 rent"]));
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2027-02-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  await waitFor(() => expect(flow().map(([body]) => body.action)).toEqual(["availability", "quote"]));
  expect(flow().every(([body]) => JSON.stringify(body.addons) === '["waveshare-ov5693"]' && body.product === "thinkrobotics-so101")).toBe(true);
});
it("does not offer a camera add-on on items without one", async () => {
  await show();
  fireEvent.change(screen.getByLabelText("What would you like?"), { target: { value: "hiwonder" } });
  expect(screen.queryByLabelText(/Add the/)).not.toBeInTheDocument();
});

it("splits bundle rent between the item and its add-on and shortens the reference", async () => {
  await openQuote({ ...quote, approvedAt: null, orderPending: false, rentPaise: 180000, amountPaise: 180000 + quote.depositPaise, addons: [{ code: "waveshare-ov5693", name: "OV5693 camera", maker: "Waveshare", rentPaise: 100000 }] });
  expect(screen.getByText("Cabin 101 rent").nextSibling).toHaveTextContent("₹800");
  expect(screen.getByText("OV5693 camera rent").nextSibling).toHaveTextContent("₹1000");
  expect(screen.getByText("A0000000")).toHaveAttribute("title", quote.quoteId);
});
