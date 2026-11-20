import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GoldenPassCheckout } from "../../src/components/GoldenPassCheckout";

const { invoke, loadCheckout, open } = vi.hoisted(() => ({ invoke: vi.fn(), loadCheckout: vi.fn(), open: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "member" }, access_token: "fixture" } } }) }, functions: { invoke } },
}));
vi.mock("../../src/lib/razorpay-checkout", () => ({ loadRazorpayCheckout: loadCheckout }));
const display = () => render(<MemoryRouter><GoldenPassCheckout memberId="member" application={<p>Apply for review</p>} /></MemoryRouter>);
const state = (status: string, details = {}) => ({ data: { mode: "live", eligible: true, checkoutAvailable: true, status, ...details }, error: null });
beforeEach(() => { invoke.mockReset(); loadCheckout.mockReset(); open.mockReset(); });

it("requires consent and opens a server-created ₹1 lakh Razorpay order", async () => {
  invoke.mockResolvedValueOnce(state("eligible")).mockResolvedValueOnce({
    data: { mode: "live", orderId: "order_Sample", keyId: "rzp_live_Sample", amountPaise: 10000000, currency: "INR" }, error: null,
  });
  loadCheckout.mockResolvedValue(class { open = open; on() {} close() {} });
  display();
  const pay = await screen.findByRole("button", { name: "Pay ₹1,00,000" });
  expect(pay).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(pay);
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  expect(invoke.mock.calls[1][1].body).toEqual({ action: "order", acceptedTerms: true });
});

it("keeps applications available to ineligible users and blocks duplicate payment while capture is pending", async () => {
  invoke.mockResolvedValueOnce(state("ineligible", { eligible: false }));
  const { unmount } = display();
  expect(await screen.findByText("Apply for review")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay ₹1,00,000" })).not.toBeInTheDocument();
  unmount();
  invoke.mockResolvedValueOnce(state("awaiting_payment", { paymentConfirmationPending: true }));
  display();
  expect(await screen.findByText(/wait for confirmation/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pay ₹1,00,000" })).not.toBeInTheDocument();
});
