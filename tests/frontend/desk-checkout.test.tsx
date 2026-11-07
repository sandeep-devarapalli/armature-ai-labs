import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import DeskCheckoutPage from "../../src/components/DeskCheckout";
import type { CheckoutOptions } from "../../src/lib/razorpay-checkout";

const mock = vi.hoisted(() => ({
  invoke: vi.fn(), refreshMembership: vi.fn(), load: vi.fn(), level: "verified",
}));
vi.mock("../../src/lib/supabase", () => ({ supabase: { functions: { invoke: mock.invoke } } }));
vi.mock("../../src/lib/razorpay-checkout", () => ({ loadRazorpayCheckout: mock.load }));
vi.mock("../../src/config/release", () => ({ memberPlatformAvailable: false }));
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mock.level = "verified";
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
  await screen.findByRole("option", { name: "S07" });
  fireEvent.change(screen.getByLabelText("Chair"), { target: { value: "S07" } });
  expect(await screen.findByRole("option", { name: /Unavailable/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: start } });
  fireEvent.click(screen.getByRole("button", { name: "Request agreement" }));
  expect(await screen.findByText("Armature is preparing your agreement.")).toBeInTheDocument();
  expect(actions).toHaveBeenCalledWith({ action: "quote", chair: "S07", unit: "day", start });
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Check agreement or payment status" }));
  const pay = await screen.findByRole("button", { name: "Pay with Razorpay" });
  expect(pay).toBeDisabled();
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
  expect(mock.refreshMembership).toHaveBeenCalledOnce();
});

it("never opens Checkout using a Test Mode key in the live route", async () => {
  localStorage.setItem("armature-desk-quote-v1:member-fixture", quoteId);
  mock.invoke.mockResolvedValueOnce(reply(signed)).mockResolvedValueOnce(
    reply({ keyId: "rzp_test_fixture", orderId: "order_Fixture", amountPaise: 35000, currency: "INR" }),
  );
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Check agreement or payment status" }));
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
  const status = screen.getByRole("button", { name: "Check agreement or payment status" });
  fireEvent.click(status);
  expect(await screen.findByText(/Check your email for the PandaDoc agreement/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Get signing link" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay with Razorpay" })).not.toBeInTheDocument();

  fireEvent.click(status);
  expect(await screen.findByRole("button", { name: "Pay with Razorpay" })).toBeDisabled();
});
