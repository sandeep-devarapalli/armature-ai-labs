import { render, screen } from "@testing-library/react";
import { OnboardingPage } from "../../src/pages/OnboardingPage";

const state = vi.hoisted(() => ({ signedIn: false, loading: false }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => state }));
vi.mock("../../src/lib/supabase", () => ({ supabase: {} }));
vi.mock("../../src/pages/AuthPages", () => ({ AuthPage: ({ redirectTo }: { redirectTo: string }) => <div>Account entry returning to {redirectTo}</div> }));
vi.mock("../../src/pages/OnboardingForm", () => ({ OnboardingForm: () => <div>Private registration form</div> }));

beforeEach(() => { state.signedIn = false; state.loading = false; });
it("shows the account entry directly without mounting private registration while signed out", () => {
  render(<OnboardingPage />);
  expect(screen.getByText("Account entry returning to /onboarding")).toBeInTheDocument();
  expect(screen.queryByText("Private registration form")).not.toBeInTheDocument();
});
it("restores an account before choosing registration or sign-up", () => {
  state.loading = true;
  render(<OnboardingPage />);
  expect(screen.getByRole("status")).toHaveTextContent("Restoring your account");
  expect(screen.queryByText("Private registration form")).not.toBeInTheDocument();
});
it("keeps signed-in applicants on the existing private registration flow", () => {
  state.signedIn = true;
  render(<OnboardingPage />);
  expect(screen.getByText("Private registration form")).toBeInTheDocument();
  expect(screen.queryByText("Account entry returning to /onboarding")).not.toBeInTheDocument();
});
