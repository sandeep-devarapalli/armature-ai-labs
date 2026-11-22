import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import DeskCheckoutPage from "../../src/components/DeskCheckout";
import type { CheckoutOptions } from "../../src/lib/razorpay-checkout";

const mock = vi.hoisted(() => ({
  invoke: vi.fn(), refreshMembership: vi.fn(), load: vi.fn(), level: "verified",
  viewer: { dispose: vi.fn(), reset: vi.fn(), selectSeat: vi.fn(), setUnavailable: vi.fn(), focusSeats: vi.fn() }, mount: vi.fn(),
}));
vi.mock("../../src/lib/booking-map/viewer.js", () => ({ mountViewer: mock.mount }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { functions: { invoke: mock.invoke } } }));
vi.mock("../../src/lib/razorpay-checkout", () => ({ loadRazorpayCheckout: mock.load }));
vi.mock("../../src/config/release", () => ({ memberPlatformAvailable: false, rentalCheckoutAvailable: false }));
vi.mock("../../src/context/AppContext", () => ({ useApp: () => ({ refresh: vi.fn() }) }));
vi.mock("../../src/context/AccountContext", () => ({
  accountMembershipLevelsEnabled: () => true,
  useAccount: () => ({
    signedIn: true, loading: false, account: { user_id: "member-fixture", membership_level: mock.level },
    refresh: mock.refreshMembership,
  }),
}));

const quoteId = "a0000000-0000-4000-8000-000000000001";
const policyVersion = "desk-policy-v1";
const signed = { quoteId, amountPaise: 35000, policyVersion, hasAgreement: true, agreementSigned: true };
const reply = (data: object) => ({ data: { mode: "live", ...data }, error: null });
const renderPage = () => render(<MemoryRouter><DeskCheckoutPage /></MemoryRouter>);
const currentStep = () => screen.queryByRole("listitem", { current: "step" })?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mock.level = "verified";
  mock.mount.mockResolvedValue(mock.viewer);
});

it("picks a chair on the 3D plan and keeps unoffered chairs unavailable", async () => {
  mock.invoke.mockImplementation((_, { body }) => Promise.resolve(reply({ chairs: ["S01", "S02", "S13"],
    dates: body.chair ? [{ booking_date: "2099-06-10", available: true }] : [] })));
  renderPage();
  await waitFor(() => expect(mock.viewer.setUnavailable).toHaveBeenCalled());
  expect(mock.viewer.focusSeats).toHaveBeenCalled();
  const options = mock.mount.mock.calls[0][1];
  expect(options).toMatchObject({ kind: "ground-seats", bookingType: "desk", notice: "3 chairs open for desk passes · GF-10 commons" });
  const blocked = mock.viewer.setUnavailable.mock.calls.at(-1)![0];
  expect(blocked).toHaveLength(22);
  expect(blocked).not.toContain("S02");
  expect(blocked).toContain("S14");
  expect(screen.getByText(/welcome at weekends too when the lab is open, as a bonus/)).toBeInTheDocument();
  act(() => options.onSeat("S02"));
  expect(screen.getByLabelText("Chair")).toHaveValue("S02");
  await waitFor(() => expect(mock.viewer.selectSeat).toHaveBeenLastCalledWith("S02"));
  await waitFor(() => expect(mock.invoke).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ body: expect.objectContaining({ action: "availability", chair: "S02" }) })));
});

it("requires Verified membership before requesting live availability", () => {
  mock.level = "basic";
  renderPage();
  expect(screen.getByText("Desk passes require Verified membership.")).toBeInTheDocument();
  expect(mock.invoke).not.toHaveBeenCalled();
});

it("quotes an available chair, waits for signatures, submits versioned consent and refreshes Premium on verified capture", async () => {
  const start = "2099-06-10";
  const actions = vi.fn(async (body) => {
    if (body.action === "availability") return reply({
      chairs: ["S07"], dates: body.chair ? [
        { booking_date: start, available: true },
        { booking_date: "2099-06-11", available: false },
      ] : [],
    });
    if (body.action === "quote") return reply({ quoteId, amountPaise: 35000, policyVersion, hasAgreement: false });
    if (body.action === "status") return reply(signed);
    if (body.action === "order") return reply({ keyId: "rzp_live_fixture", orderId: "order_Fixture", amountPaise: 35000, currency: "INR" });
    return reply({ quoteId, status: "confirmed", membership: "premium" });
  });
  mock.invoke.mockImplementation((_, { body }) => actions(body));
  let options: CheckoutOptions | undefined;
  const open = vi.fn();
  mock.load.mockResolvedValue(class {
    constructor(value: CheckoutOptions) { options = value; }
    open = open;
    close = vi.fn();
    on = vi.fn();
  });

  renderPage();
  expect(currentStep()).toBe("1Choose your pass, chair and dates");
  await screen.findByRole("option", { name: "S07" });
  fireEvent.change(screen.getByLabelText("Chair"), { target: { value: "S07" } });
  expect(await screen.findByRole("option", { name: /Unavailable/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: start } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  expect(await screen.findByText("Armature is preparing your agreement.")).toBeInTheDocument();
  expect(actions).toHaveBeenCalledWith({ action: "quote", chair: "S07", unit: "day", start });
  expect(currentStep()).toBe("2Review your draft and request any corrections");
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Check agreement or payment status" }));
  const pay = await screen.findByRole("button", { name: "Pay with Razorpay" });
  expect(pay).toBeDisabled();
  expect(currentStep()).toBe("4Pay securely, then receive your confirmed reservation");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(pay);
  await waitFor(() => expect(open).toHaveBeenCalledOnce());
  expect(actions).toHaveBeenCalledWith({ action: "order", quoteId, policyVersion, acceptedPolicies: true });
  expect(options).toMatchObject({ key: "rzp_live_fixture", order_id: "order_Fixture", amount: 35000, currency: "INR" });
  await act(async () => options?.handler({
    razorpay_order_id: "order_Fixture", razorpay_payment_id: "pay_Fixture", razorpay_signature: "callback-signature",
  }));
  expect(actions).toHaveBeenCalledWith({
    action: "verify", quoteId, razorpay_order_id: "order_Fixture", razorpay_payment_id: "pay_Fixture", razorpay_signature: "callback-signature",
  });
  expect(await screen.findByText(/Desk booking confirmed.*Membership: Premium/)).toBeInTheDocument();
  expect(currentStep()).toBeUndefined();
  expect(screen.getByRole("heading", { name: "Booking confirmed" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "My Bookings" })).toHaveAttribute("href", "/my-bookings");
  expect(screen.getByRole("button", { name: "Book another desk pass" })).toBeInTheDocument();
  const arrival = screen.getByText("Arrival and door access", { selector: "summary" });
  fireEvent.click(arrival);
  expect(screen.getByText(/door access system is being set up/)).toBeInTheDocument();
  expect(screen.getByText("Get directions")).toHaveAttribute("href", expect.stringContaining("google.com/maps/dir/"));
  expect(mock.refreshMembership).toHaveBeenCalledOnce();
});

it("never opens Checkout using a Test Mode key in the live route", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValueOnce(reply(signed)).mockResolvedValueOnce(
    reply({ keyId: "rzp_test_fixture", orderId: "order_Fixture", amountPaise: 35000, currency: "INR" }),
  );
  renderPage();
  const pay = await screen.findByRole("button", { name: "Pay with Razorpay" });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(pay);
  expect(await screen.findByRole("alert")).toHaveTextContent("The payment order did not match your approved quote.");
  expect(mock.load).not.toHaveBeenCalled();
});

it("directs a manual pilot customer to email and waits for staff approval before showing checkout", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValueOnce(reply({ quoteId, manualAgreement: true, hasAgreement: false }))
    .mockResolvedValueOnce(reply({ ...signed, manualAgreement: true }));
  renderPage();
  expect(await screen.findByText(/Armature will prepare your PandaDoc agreement/)).toBeInTheDocument();
  expect(currentStep()).toBe("2Review your draft and request any corrections");
  expect(screen.queryByRole("button", { name: "Get signing link" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Check agreement or payment status" }));
  expect(await screen.findByRole("button", { name: "Pay with Razorpay" })).toBeDisabled();
});

it("marks the signing step current once the agreement is ready", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValueOnce(reply({ quoteId, hasAgreement: true, agreementSigned: false }));
  renderPage();
  await screen.findByRole("button", { name: "Get signing link" });
  expect(currentStep()).toBe("3Sign in PandaDoc; Armature countersigns and reviews");
  expect(screen.getAllByText("(done)")).toHaveLength(2);
});

it("restores a confirmed request on another device without starting a new payment", async () => {
  mock.invoke.mockImplementation((_, { body }) => Promise.resolve(reply(body.action === "list_own"
    ? { quotes: [{ quoteId, chair: "S01", unit: "day", start: "2099-06-10", status: "confirmed" }] }
    : body.action === "status" ? { ...signed, status: "confirmed", membership: "premium" }
    : { chairs: ["S01"], dates: [] })));
  renderPage();
  fireEvent.click(screen.getByText("Resume an existing booking"));
  fireEvent.click(screen.getByRole("button", { name: "Load my recent requests" }));
  fireEvent.click(await screen.findByRole("button", { name: /S01.*confirmed/ }));
  expect(await screen.findByText(/Desk booking confirmed.*Premium/)).toBeInTheDocument();
  expect(mock.load).not.toHaveBeenCalled();
  expect(mock.invoke).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ body: expect.objectContaining({ action: "order" }) }));
});

it("does not adopt a reference when the server rejects another member's quote", async () => {
  mock.invoke.mockImplementation((_, { body }) => Promise.resolve(body.action === "status"
    ? { data: null, error: new Error("denied") }
    : reply({ chairs: [], dates: [] })));
  renderPage();
  fireEvent.click(screen.getByText("Resume an existing booking"));
  fireEvent.change(screen.getByLabelText("Existing booking reference"), { target: { value: quoteId } });
  fireEvent.click(screen.getByRole("button", { name: "Resume booking" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(localStorage.getItem("armature-desk-quote-v1:member-fixture")).toBeNull();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();
});


it("lets a signed-in Basic member recover an existing payment without offering new bookings", async () => {
  mock.level = "basic";
  mock.invoke.mockResolvedValue(reply({ ...signed, status: "refunded" }));
  renderPage();
  expect(mock.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Resume an existing booking"));
  fireEvent.change(screen.getByLabelText("Existing booking reference"), { target: { value: quoteId } });
  fireEvent.click(screen.getByRole("button", { name: "Resume booking" }));
  expect(await screen.findByText("This payment has been refunded.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Request agreement" })).not.toBeInTheDocument();
});

it("offers a fresh request after approval expires without reopening payment", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValue(reply({ ...signed, approvedAt: "2000-01-01T00:00:00Z", manualAgreement: true }));
  renderPage();
  expect(await screen.findByText(/This agreement’s payment window expired/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose another desk pass" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();
});

it.each([false, true])("allows an expired bound order replacement only after a conclusive server check: %s", async safe => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValue(reply({ ...signed, hasOrder: true, approvedAt: "2000-01-01T00:00:00Z",
    expiredOrder: true, canRequestReplacement: safe }));
  renderPage();
  expect(await screen.findByText(/This payment window has expired/)).toBeInTheDocument();
  expect(Boolean(screen.queryByRole("button", { name: "Choose another desk pass" }))).toBe(safe);
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();
});
it("restarts an unclaimed stale policy request without offering payment", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValue(reply({ ...signed, policyStale: true }));
  renderPage();
  expect(await screen.findByText(/policies for this unpaid request have changed/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose another desk pass" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();
});

it("resumes an unpaid agreement request with current website policies and no signing step", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValueOnce(reply({
    quoteId, amountPaise: 35000, policyVersion, directCheckout: true, manualAgreement: true,
  })).mockResolvedValueOnce(reply({ quoteId, directCheckout: true, status: "confirmed" }));
  renderPage();
  const pay = await screen.findByRole("button", { name: "Pay with Razorpay" });
  expect(pay).toBeDisabled();
  expect(screen.queryByText(/PandaDoc/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(pay);
  expect(await screen.findByText(/Desk booking confirmed/)).toBeInTheDocument();
  expect(mock.invoke).toHaveBeenLastCalledWith("desk-checkout", {
    body: { action: "order", quoteId, acceptedPolicies: true, policyVersion },
  });
  expect(mock.load).not.toHaveBeenCalled();
});

it("blocks direct payment when an existing payment needs reconciliation", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValueOnce(reply({
    quoteId, amountPaise: 35000, policyVersion, directCheckout: true, hasOrder: true, paymentBlocked: true,
  }));
  renderPage();
  expect(await screen.findByText("Payment pending")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choose another desk pass" })).not.toBeInTheDocument();
});

it("uses the direct calendar to show event blocking and the matching reserved fallback", async () => {
  let eventDay = "";
  let openDay = "";
  const actions = vi.fn(async (body) => {
    switch (body.action) {
      case "availability": return reply({ directCheckout: true, chairs: ["S01", "S13"], dates: [] });
      case "desk_calendar": {
        const start = new Date(body.from + "T00:00:00Z");
        const limit = new Date(body.to + "T00:00:00Z");
        expect((+limit - +start) / 86400000).toBe(30);
        const dates = Array.from({ length: 9 }, (_, i) => new Date(+start + i * 86400000))
          .filter(day => day.getUTCMonth() === start.getUTCMonth() && ![0, 6].includes(day.getUTCDay()));
        const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
        while (dates.length < 2) {
          if (![0, 6].includes(nextMonth.getUTCDay())) dates.push(new Date(nextMonth));
          nextMonth.setUTCDate(nextMonth.getUTCDate() + 1);
        }
        [eventDay, openDay] = dates.map(date => date.toISOString().slice(0, 10));
        return reply({ events: [{ date: eventDay, title: "Ground floor event", startsAt: eventDay + "T10:00:00+05:30",
          endsAt: eventDay + "T13:00:00+05:30", blocksDesk: true }] });
      }
      case "desk_calendar_chairs": return reply({ chairs: body.start === eventDay ? [] : ["S13"] });
      case "quote": return reply({ quoteId, amountPaise: 35000, policyVersion, directCheckout: true, chair: "S13" });
      default: throw new Error("Unexpected " + body.action);
    }
  });
  mock.invoke.mockImplementation((_, { body }) => actions(body));
  renderPage();
  await screen.findByText("Find an available day");
  await waitFor(() => expect(eventDay).not.toBe(""));
  const renderDay = (day: string) => new Intl.DateTimeFormat("en-IN", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(day + "T00:00:00Z"));
  const eventName = renderDay(eventDay) + ", Event";
  if (!screen.queryByRole("button", { name: eventName })) fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  fireEvent.click(await screen.findByRole("button", { name: eventName }));
  expect(await screen.findByText("Ground-floor desks are closed for this day.")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "S13" })).toBeDisabled());
  if (!screen.queryByRole("button", { name: renderDay(openDay) })) fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  fireEvent.click(screen.getByRole("button", { name: renderDay(openDay) }));
  await waitFor(() => expect(screen.getByRole("button", { name: "S13" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "S13" }));
  expect(screen.getByText("F13 · First floor")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review and pay" }));
  expect(await screen.findByRole("button", { name: "Pay with Razorpay" })).toBeDisabled();
  expect(actions).toHaveBeenCalledWith({ action: "quote", chair: "S13", unit: "day", start: openDay });
  expect(screen.queryByText(/PandaDoc/)).not.toBeInTheDocument();
});


it("automatically restores a confirmed receipt using only its saved reference", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  let resolveStatus!: (value: ReturnType<typeof reply>) => void;
  mock.invoke.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
  renderPage();
  expect(screen.getByText("Checking your booking…")).toBeInTheDocument();
  expect(screen.queryByText("Request received")).not.toBeInTheDocument();
  await act(async () => resolveStatus(reply({ quoteId, status: "confirmed", directCheckout: true, unit: "day",
    chair: "S13", start: "2026-11-23", end: "2026-11-23", amountPaise: 35000 })));
  expect(await screen.findByRole("heading", { name: "Booking confirmed" })).toBeInTheDocument();
  expect(screen.getByText("S13 · Ground floor")).toBeInTheDocument();
  expect(screen.getByText("F13 · First floor")).toBeInTheDocument();
  expect(screen.getByText("₹350.00")).toBeInTheDocument();
  expect(mock.invoke.mock.calls.map(([, { body }]) => body)).toEqual([{ action: "status", quoteId }]);
  expect(mock.load).not.toHaveBeenCalled();
});
