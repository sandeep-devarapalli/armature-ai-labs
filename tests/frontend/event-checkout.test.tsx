import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventBooking } from "../../src/components/EventCheckout";

const mock = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), verified: true, signedIn: true, checkout: vi.fn(), open: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ accountMembershipLevelsEnabled: () => true,
  useAccount: () => ({ account: { user_id: "host", membership_level: mock.verified ? "verified" : "basic" }, signedIn: mock.signedIn, refresh: mock.refresh }) }));
vi.mock("../../src/lib/event-checkout", () => ({ eventMode: "test", eventRequest: mock.request }));
vi.mock("../../src/lib/razorpay-checkout", () => ({ loadRazorpayCheckout: async () => class {
  constructor(options: unknown) { mock.checkout(options); }
  on() {} close() {} open() { mock.open(); }
} }));

const slots = { date: "2027-03-12", ratePaise: 250000, opens: "08:00", closes: "23:00", bufferMinutes: 20, maxAttendees: 35, closed: false,
  busy: [{ start: "14:00", end: "16:00" }] };
const quote = { quoteId: "e0000000-0000-4000-8000-000000000001", date: "2027-03-12", startTime: "10:00", hours: 2, attendees: 20,
  purpose: "Robotics meetup with demos", startsAt: "", endsAt: "", rentPaise: 500000, amountPaise: 500000, agreementHash: "a".repeat(64),
  policyVersion: "event-v1", approvedAt: null, hasAgreement: false, hasOrder: false, orderPending: false, refundDuePaise: null, declineReason: null, status: "awaiting_staff" };
const current = () => screen.queryByRole("listitem", { current: "step" })?.textContent;
const show = () => render(<StrictMode><MemoryRouter><EventBooking /></MemoryRouter></StrictMode>);
async function open(fields: object) {
  mock.request.mockImplementation(async body => body.action === "list_own" ? { quotes: [{ ...quote, ...fields }] } : { ...quote, ...fields });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Find my event requests" }));
  fireEvent.click(await screen.findByRole("button", { name: /12 Mar 2027 · 10:00/ }));
  await screen.findByRole("button", { name: "Copy full reference" });
}
beforeEach(() => { vi.clearAllMocks(); mock.verified = true; mock.signedIn = true;
  mock.request.mockImplementation(async body => body.action === "availability" ? slots : quote); });
afterEach(cleanup);

it("asks signed-out visitors to sign in", () => {
  mock.signedIn = false; show();
  expect(screen.getByRole("link", { name: "Sign in to book the event space" })).toHaveAttribute("href", "/auth?next=%2F");
});

it("shows the day's bookings, then requests the chosen slot", async () => {
  show();
  expect(current()).toBe("1Choose date, time and guests");
  expect(screen.getByRole("button", { name: "Request the event space" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2027-03-12" } });
  expect(await screen.findByLabelText(/Already booked: 14:00–16:00/)).toBeInTheDocument();
  expect(mock.request).toHaveBeenCalledWith({ action: "availability", date: "2027-03-12" }, "host");
  fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "10:00" } });
  fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "2" } });
  expect(screen.getByRole("option", { name: "2 hours · ₹5,000.00" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText("What is the event?"), { target: { value: "Robotics meetup with demos" } });
  fireEvent.click(screen.getByRole("button", { name: "Request the event space" }));
  await screen.findByText("Awaiting Armature review");
  expect(mock.request).toHaveBeenLastCalledWith({ action: "quote", date: "2027-03-12", startTime: "10:00", hours: 2, attendees: 20, purpose: "Robotics meetup with demos" }, "host");
  expect(current()).toBe("2Armature reviews your request and prepares the agreement");
});

it("needs Verified membership to request", async () => {
  mock.verified = false; show();
  fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2027-03-12" } });
  await screen.findByText("Already booked");
  expect(screen.getByRole("button", { name: "Request the event space" })).toBeDisabled();
});

it.each([["awaiting_signatures", "3You sign, then Armature countersigns"], ["approved", "4Pay through Razorpay and receive confirmation"], ["confirmed", undefined]])(
  "marks the %s step", async (status, step) => {
    await open({ status });
    expect(current()).toBe(step);
  });

it("pays only an order that matches the approved amount", async () => {
  await open({ status: "approved", approvedAt: "2027-03-01T10:00:00Z", hasAgreement: true });
  const pay = screen.getByRole("button", { name: "Pay with Razorpay Test Mode" });
  expect(pay).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  mock.request.mockResolvedValueOnce({ keyId: "rzp_test_abc", orderId: "order_1", amountPaise: 400000, currency: "INR" });
  fireEvent.click(pay);
  expect(await screen.findByRole("alert")).toHaveTextContent("Payment order does not match");
  expect(mock.open).not.toHaveBeenCalled();
  mock.request.mockResolvedValueOnce({ keyId: "rzp_test_abc", orderId: "order_1", amountPaise: 500000, currency: "INR" });
  fireEvent.click(pay);
  await waitFor(() => expect(mock.open).toHaveBeenCalled());
  expect(mock.checkout).toHaveBeenCalledWith(expect.objectContaining({ amount: 500000, order_id: "order_1" }));
});

it("explains the refund before cancelling a confirmed event", async () => {
  await open({ status: "confirmed", hasOrder: true });
  fireEvent.click(screen.getByText("Cancel this event"));
  expect(screen.getByText(/48 hours or more before the event refunds 50%/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "The speakers cannot travel" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
  await waitFor(() => expect(mock.request).toHaveBeenLastCalledWith({ action: "cancel", quoteId: quote.quoteId, confirmed: true, reason: "The speakers cannot travel" }, "host"));
});
