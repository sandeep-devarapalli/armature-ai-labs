import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RentalCheckoutPage from "../../src/components/RentalCheckout";
const mock = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), verified: true, signedIn: true }));
vi.mock("../../src/context/AccountContext", () => ({ accountMembershipLevelsEnabled: () => true,
  useAccount: () => ({ account: { user_id: "buyer", membership_level: mock.verified ? "verified" : "basic" }, signedIn: mock.signedIn, refresh: mock.refresh }) }));
vi.mock("../../src/lib/rental-checkout", () => ({ rentalMode: "test", rentalRequest: mock.request,
  rentalMoney: (value: number) => "₹" + value / 100 }));
const quote = { quoteId: "a0000000-0000-4000-8000-000000000001", product: "cabin101", unit: "month",
  start: "2027-02-01", end: "2027-02-28", rentPaise: 4000000, depositPaise: 8000000, amountPaise: 12000000,
  agreementHash: "a".repeat(64), policyVersion: "rental-v1", status: "draft", agreementSigned: false, hasOrder: false };
function show() { return render(<StrictMode><MemoryRouter><RentalCheckoutPage /></MemoryRouter></StrictMode>); }
beforeEach(() => { vi.clearAllMocks(); mock.verified = true; mock.signedIn = true;
  mock.request.mockImplementation(async body => body.action === "availability" ? { available: true } : quote); });
afterEach(cleanup);
it("shows distinct customer, Armature and staff actions", () => {
  show();
  expect(screen.getByText("Customer signs, then Armature countersigns")).toBeInTheDocument();
  expect(screen.getByText("Staff approves, then pay and receive confirmation")).toBeInTheDocument();
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
