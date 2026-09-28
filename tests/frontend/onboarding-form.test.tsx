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
  await screen.findByText("Details saved. Submit your photo and ID, then submit your application.");
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

function submissionFixture(uploaded = true) {
  const app = { user_id: "synthetic", full_name: "Synthetic Member", email: "test@example.test", phone: "9999999999", linkedin_url: "https://linkedin.com/in/synthetic", date_of_birth: "2000-01-01", status: "pending", revision: 3, submitted_revision: null as number | null, submitted_at: null as string | null };
  const docs = ["photo", "government_id"].map(kind => ({ id: kind, kind, uploaded_at: uploaded ? new Date().toISOString() : null, expires_at: new Date(Date.now() + 86_400_000).toISOString(), deleted_at: null }));
  const rpc = vi.fn(async (name: string) => {
    if (name === "submit_basic_application_for_review") { app.submitted_revision = 3; app.submitted_at = new Date().toISOString(); }
    return { data: null, error: null };
  });
  const from = (table: string) => { const result = { data: table === "basic_onboarding_applications" ? [app] : table === "onboarding_documents" ? docs : [], error: null }; const chain = { select: () => chain, eq: () => chain, order: async () => result, then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve) }; return chain; };
  const client = { rpc, from, auth: { getSession: async () => ({ data: { session: { user: { id: "synthetic", email: app.email } } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
  return { app, docs, rpc, client };
}
it("does not mark reserved documents uploaded or submit when files are merely selected", async () => {
  const fixture = submissionFixture(false), requestDocument = vi.fn();
  render(<MemoryRouter><OnboardingForm client={fixture.client} requestDocument={requestDocument} /></MemoryRouter>);
  const photo = await screen.findByLabelText("photo image");
  fireEvent.change(photo, { target: { files: [new File(["synthetic"], "photo.png", { type: "image/png" })] } });
  expect(screen.getByRole("button", { name: "Submit photo" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Submit application" })).toBeDisabled();
  expect(screen.queryByText("Photo Uploaded")).not.toBeInTheDocument();
  expect(requestDocument).not.toHaveBeenCalled(); expect(fixture.rpc).not.toHaveBeenCalled();
});
it("explicitly submits the current revision and shows received confirmation only after server success", async () => {
  const fixture = submissionFixture();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  render(<MemoryRouter><OnboardingForm client={fixture.client} requestDocument={vi.fn()} /></MemoryRouter>);
  await screen.findByText("Photo Uploaded"); expect(screen.getByText("Government ID Uploaded")).toBeVisible();
  expect(fixture.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
  expect(await screen.findByRole("dialog", { name: "Your details have been received" })).toBeVisible();
  expect(fixture.rpc).toHaveBeenCalledWith("submit_basic_application_for_review", { p_expected_revision: 3 });
  expect(screen.getByRole("button", { name: "Application submitted" })).toBeDisabled();
  delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).showModal;
});
it("keeps the application unsubmitted and shows a server validation failure", async () => {
  const fixture = submissionFixture(); fixture.rpc.mockResolvedValue({ data: null, error: { message: "Documents expired; upload again." } } as never);
  render(<MemoryRouter><OnboardingForm client={fixture.client} requestDocument={vi.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Submit application" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Documents expired; upload again.");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("keeps upload failures visible without marking an image uploaded", async () => {
  const fixture = submissionFixture(false), requestDocument = vi.fn().mockRejectedValue(new Error("Security scan unavailable. Please retry."));
  render(<MemoryRouter><OnboardingForm client={fixture.client} requestDocument={requestDocument} /></MemoryRouter>);
  const photo = await screen.findByLabelText("photo image");
  const file = new File(["synthetic"], "photo.png", { type: "image/png" });
  fireEvent.change(photo, { target: { files: [file] } });
  vi.spyOn(FormData.prototype, "get").mockImplementation(key => key === "file" ? file : null);
  fireEvent.submit(photo.closest("form")!);
  expect((await screen.findAllByRole("alert")).every(alert => alert.textContent?.includes("Security scan unavailable. Please retry."))).toBe(true);
  expect(screen.queryByText("Photo Uploaded")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit application" })).toBeDisabled();
});
it("reuses a reserved document after a failed upload instead of reserving twice", async () => {
  const fixture = submissionFixture(false); fixture.docs.splice(0);
  fixture.rpc.mockImplementation(async name => ({ data: name === "reserve_onboarding_document" ? { id: "reserved-photo", kind: "photo", uploaded_at: null, expires_at: new Date(Date.now() + 86_400_000).toISOString(), deleted_at: null } : null, error: null }) as never);
  const requestDocument = vi.fn().mockRejectedValue(new Error("Upload interrupted"));
  render(<MemoryRouter><OnboardingForm client={fixture.client} requestDocument={requestDocument} /></MemoryRouter>);
  const photo = await screen.findByLabelText("photo image"), file = new File(["synthetic"], "photo.png", { type: "image/png" });
  fireEvent.change(photo, { target: { files: [file] } });
  vi.spyOn(FormData.prototype, "get").mockImplementation(key => key === "file" ? file : null);
  fireEvent.submit(photo.closest("form")!);
  await screen.findAllByText("Upload interrupted");
  fireEvent.submit(photo.closest("form")!);
  const { waitFor } = await import("@testing-library/react");
  await waitFor(() => expect(requestDocument).toHaveBeenCalledTimes(2));
  expect(fixture.rpc).toHaveBeenCalledTimes(1);
  expect(requestDocument).toHaveBeenLastCalledWith("reserved-photo", file);
});
