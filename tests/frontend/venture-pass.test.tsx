import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VenturePassPage from "../../src/pages/VenturePassPage";

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock("../../src/config/release", () => ({ basicOnboardingAvailable: true }));
vi.mock("../../src/context/AccountContext", () => ({
  useAccount: () => ({ account: { user_id: "member" }, loading: false, signedIn: true }),
}));

const now = Date.now();
const application = {
  id: "6caa9d50-cdba-4e40-88bb-7851519e36fa",
  firm_name: "Example Ventures",
  firm_type: "independent_vc",
  contact_name: "Example Contact",
  website: null,
  details: "Host a robotics demo for our portfolio.",
  status: "pending",
  created_at: new Date(now - 1000).toISOString(),
  payment_expires_at: null,
  confirmed_at: null,
};
const route = "/venture-partner-pass";
const display = (path = route) => render(<MemoryRouter initialEntries={[path]}><VenturePassPage /></MemoryRouter>);

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

it("submits the actual firm fields and withholds payment while the application is pending", async () => {
  rpc.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: application });
  display();
  fireEvent.change(await screen.findByLabelText("Firm name"), { target: { value: application.firm_name } });
  fireEvent.change(screen.getByLabelText("Firm type"), { target: { value: application.firm_type } });
  fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: application.contact_name } });
  fireEvent.change(screen.getByLabelText("How would your firm use the pass?"), { target: { value: application.details } });
  fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
  expect(await screen.findByText("Under review")).toBeVisible();
  expect(rpc).toHaveBeenLastCalledWith("submit_venture_pass_application", {
    p_firm_name: application.firm_name, p_firm_type: application.firm_type, p_website: null,
    p_contact_name: application.contact_name, p_details: application.details,
  });
  expect(screen.queryByRole("button", { name: /with Razorpay/ })).toBeNull();
});

it("requires terms before payment and suppresses pay while capture is being verified", async () => {
  const approved = { ...application, status: "approved", payment_expires_at: new Date(now + 3600000).toISOString() };
  rpc.mockResolvedValueOnce({ data: approved });
  invoke.mockResolvedValueOnce({ data: { application: approved, confirmationPending: true } });
  display();
  const pay = await screen.findByRole("button", { name: "Pay ₹5,00,000 with Razorpay" });
  expect(pay).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "I accept the website terms." }));
  fireEvent.click(pay);
  expect(await screen.findByText(/Razorpay is still verifying/)).toBeVisible();
  expect(invoke).toHaveBeenCalledWith("venture-pass-checkout", { body: { action: "checkout", acceptedTerms: true } });
  expect(screen.queryByRole("button", { name: /with Razorpay/ })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("blocks checkout after the deadline and shows only server-confirmed payment on return", async () => {
  const approved = { ...application, status: "approved", payment_expires_at: new Date(now - 1000).toISOString() };
  rpc.mockResolvedValueOnce({ data: approved });
  const { unmount } = display();
  expect(await screen.findByText("Payment window ended")).toBeVisible();
  expect(screen.queryByRole("button", { name: /with Razorpay/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeVisible();
  unmount();

  invoke.mockResolvedValueOnce({ data: {
    application: { ...approved, status: "confirmed", confirmed_at: new Date(now).toISOString() },
  } });
  display(route + "?payment=return");
  expect(await screen.findByText("Membership confirmed")).toBeVisible();
  expect(invoke).toHaveBeenLastCalledWith("venture-pass-checkout", { body: { action: "refresh" } });
});
