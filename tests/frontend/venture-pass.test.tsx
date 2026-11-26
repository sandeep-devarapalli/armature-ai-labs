import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VenturePassPage from "../../src/pages/VenturePassPage";

const { rpc, invoke, session } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), session: { signedIn: true } }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock("../../src/context/AccountContext", () => ({
  useAccount: () => ({ account: session.signedIn ? { user_id: "member" } : null, loading: false, signedIn: session.signedIn }),
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
  session.signedIn = true;
  rpc.mockReset();
  invoke.mockReset();
});

it("offers direct contact without sign-in, a form, or payment instructions", () => {
  session.signedIn = false;
  display();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Venture Partner Pass");
  expect(screen.getByText(/institutional investors and venture teams/)).toBeVisible();
  const distribution = screen.getByRole("region", { name: /Physical AI won't be found in pitch decks/ });
  expect(distribution).toHaveTextContent(/1,000\+ physical AI and hardware founders/);
  expect(distribution.compareDocumentPosition(screen.getByRole("heading", { name: "Discover" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("link", { name: "Talk to us" })).toHaveAttribute("href", "#apply");
  const contact = screen.getByRole("region", { name: "Let’s talk partnership." });
  expect(contact).toHaveTextContent("We’d love to hear from you.");
  expect(screen.getByRole("link", { name: /Email the lab/ })).toHaveAttribute("href", "mailto:hello@armatureailabs.com?subject=Venture%20Partner%20Pass");
  expect(screen.getByRole("link", { name: /Call the lab/ })).toHaveAttribute("href", "tel:+919748485583");
  expect(screen.queryByText(/one hour to pay/)).not.toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalled();
});

it("shows existing applications and never asks a signed-in visitor to fill a new form", async () => {
  rpc.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: application });
  const first = display();
  expect(screen.queryByLabelText("Firm name")).not.toBeInTheDocument();
  first.unmount();
  display();
  expect(await screen.findByText("Under review")).toBeVisible();
  expect(screen.queryByRole("button", { name: /with Razorpay/ })).not.toBeInTheDocument();
});

it("keeps the payment return destination for a signed-out applicant", () => {
  session.signedIn = false;
  display(route + "?payment=return");
  expect(screen.getByRole("link", { name: /sign in to check your payment status/i }))
    .toHaveAttribute("href", "/auth?next=" + encodeURIComponent("/venture-partner-pass/?payment=return#apply"));
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
