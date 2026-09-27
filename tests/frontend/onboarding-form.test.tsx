import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OnboardingForm } from "../../src/pages/OnboardingForm";

it("requires current privacy acceptance before submitting a verified user's registration", async () => {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const query = () => {
    const result = { data: [], error: null };
    const chain = { select: () => chain, eq: () => chain, order: () => Promise.resolve(result), then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve) };
    return chain;
  };
  const client = { from: query, rpc, auth: {
    getSession: async () => ({ data: { session: { user: { id: "synthetic", email: "test@example.test" } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } } as unknown as SupabaseClient;
  render(<MemoryRouter><OnboardingForm client={client} requestDocument={vi.fn()} /></MemoryRouter>);
  const name = await screen.findByLabelText("Full name");
  fireEvent.change(name, { target: { value: "Synthetic Member" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+919876543210" } });
  fireEvent.change(screen.getByLabelText("Your LinkedIn profile"), { target: { value: "https://www.linkedin.com/in/synthetic" } });
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2000-01-01" } });
  fireEvent.submit(name.closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Accept the privacy notice");
  expect(rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /I accept the privacy notice/ }));
  fireEvent.submit(name.closest("form")!);
  await screen.findByText("Registration saved. Upload your photo and ID for staff review.");
  expect(rpc).toHaveBeenCalledWith("submit_basic_onboarding", expect.objectContaining({ p_notice_version: "2026-09-26-release-1", p_full_name: "Synthetic Member" }));
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});

it("discards a delayed admin response after the account changes", async () => {
  let authChanged: (event: string, session: unknown) => void = () => {};
  let resolveOld: (value: unknown) => void = () => {};
  let oldRequest = true;
  const oldApplications = new Promise(resolve => { resolveOld = resolve; });
  const query = (table: string) => {
    const isOld = oldRequest;
    const result = table === "staff_roles" && isOld ? { data: [{ role: "admin" }], error: null } : { data: [], error: null };
    const chain = { select: () => chain, eq: () => chain, order: () => table === "basic_onboarding_applications" && isOld ? oldApplications : Promise.resolve(result), then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve) };
    return chain;
  };
  const client = { from: query, auth: {
    getSession: async () => ({ data: { session: { user: { id: "old-admin", email: "admin@example.test" } } }, error: null }),
    onAuthStateChange: (callback: typeof authChanged) => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  } } as unknown as SupabaseClient;
  render(<MemoryRouter><OnboardingForm client={client} requestDocument={vi.fn()} /></MemoryRouter>);
  await screen.findByText("admin@example.test");
  oldRequest = false;
  const { act } = await import("@testing-library/react");
  await act(async () => { authChanged("SIGNED_OUT", null); authChanged("SIGNED_IN", { user: { id: "new-user", email: "new@example.test" } }); });
  await screen.findByText("new@example.test");
  await act(async () => { resolveOld({ data: [{ user_id: "private-applicant", full_name: "Private Applicant", status: "pending" }], error: null }); });
  expect(screen.queryByText(/Admin reviewer/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Private Applicant/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Application to review")).not.toBeInTheDocument();
});
