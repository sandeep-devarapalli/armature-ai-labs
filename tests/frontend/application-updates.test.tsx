import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationUpdates, type OnboardingUpdate } from "../../src/components/ApplicationUpdates";
import { ApplicationUpdateQueue } from "../../src/components/ApplicationUpdateQueue";
import type { LocalApplication } from "../../src/lib/onboarding";

const nestedForm = vi.hoisted(() => ({ props: null as null | { initialUserId: string; onBusyChange?: (value: boolean) => void; onApplicationUpdate?: () => void } }));
vi.mock("../../src/pages/OnboardingForm", () => ({ OnboardingForm: (props: NonNullable<typeof nestedForm.props>) => { nestedForm.props = props; return <p>Selected application {props.initialUserId}</p>; } }));

const application: LocalApplication = { user_id: "member-one", full_name: "Current Member Name", email: "member@example.test", phone: "+919999991234", linkedin_url: "https://linkedin.com/in/current", date_of_birth: "1990-01-01", status: "approved", revision: 4, submitted_at: "2026-09-01T00:00:00Z", submitted_revision: 4 };
const proposal: OnboardingUpdate = { identity_changed: true, id: "update-one", user_id: application.user_id, status: "pending", revision: 2, application_revision: 4, full_name: "Proposed Member Name", linkedin_url: "https://linkedin.com/in/proposed", date_of_birth: "1990-01-01", previous_details: { full_name: application.full_name, linkedin_url: application.linkedin_url, date_of_birth: application.date_of_birth } };
function fixture(initial: OnboardingUpdate | null = null, options: { admin?: boolean; canReject?: boolean; active?: boolean } = {}) {
  let account = options.admin ? "admin-one" : application.user_id;
  let result: { data: OnboardingUpdate | null; error: { code?: string; message: string } | null } = { data: proposal, error: null };
  const headers = vi.fn();
  const rpc = vi.fn((name: string, _parameters: Record<string, unknown>) => {
    const response = Promise.resolve(name === "get_onboarding_update" ? { data: initial, error: null } : result);
    return Object.assign(response, { setHeader: (key: string, value: string) => { headers(key, value); return response; } });
  });
  const client = { rpc, auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: account }, access_token: `${account}-token` } }, error: null })) } } as unknown as SupabaseClient;
  const onSaved = vi.fn(), onBusyChange = vi.fn(), onProposalChange = vi.fn(), onDocuments = vi.fn();
  const props = { client, application, onSaved, onBusyChange, onProposalChange, onDocuments, ...options };
  const view = render(<ApplicationUpdates {...props} />);
  return { ...view, rpc, client, headers, props, onSaved, onBusyChange, onProposalChange, changeAccount: (value: string) => { account = value; }, respond: (value: typeof result) => { result = value; } };
}
async function edit() { fireEvent.click(await screen.findByRole("button", { name: "Edit application details" })); }
function consent() { fireEvent.click(screen.getByRole("checkbox", { name: /I confirm these proposed changes/ })); }
function submit() { fireEvent.submit(screen.getByLabelText("Full name").closest("form")!); }

it("submits a separate proposal with revision guards and captured credentials without changing approved details", async () => {
  const f = fixture(); await edit();
  expect(screen.getByLabelText("Full name")).toHaveValue(application.full_name);
  expect(screen.queryByLabelText(/Phone|Email/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Proposed Member Name" } });
  expect(f.rpc).toHaveBeenCalledTimes(1); consent(); submit();
  await screen.findByText("Changes submitted for staff review.");
  expect(f.rpc).toHaveBeenCalledWith("submit_onboarding_update", { p_full_name: "Proposed Member Name", p_linkedin_url: application.linkedin_url, p_date_of_birth: application.date_of_birth, p_notice_version: "2026-09-26-release-1", p_expected_application_revision: 4, p_expected_update_revision: null });
  expect(f.headers).toHaveBeenLastCalledWith("Authorization", "Bearer member-one-token");
  const table = screen.getByRole("table", { name: "Current application and proposed changes" });
  expect(within(table).getByText(application.full_name)).toBeVisible();
  expect(within(table).getByText(proposal.full_name)).toBeVisible();
  expect(application.status).toBe("approved"); expect(application.revision).toBe(4);
  expect(f.onSaved).toHaveBeenCalledOnce(); expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
  await waitFor(() => expect(f.onProposalChange).toHaveBeenLastCalledWith(true, true));
});

it("requires explicit consent and validates identity fields before mutating", async () => {
  const f = fixture(); await edit(); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Accept the privacy notice");
  consent();
  fireEvent.change(screen.getByLabelText("Your LinkedIn profile"), { target: { value: "https://linkedin.com/company/example" } }); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("personal LinkedIn profile");
  expect(f.rpc).toHaveBeenCalledTimes(1);
});

it("rejects future birth dates with visible validation and no mutation", async () => {
  const f = fixture(); await edit(); consent();
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2099-01-01" } }); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(/date of birth|Minimum age/i);
  expect(f.rpc).toHaveBeenCalledTimes(1);
});

it("cancels edits without saving and loads only when the review becomes active", async () => {
  const f = fixture(null, { active: false }); expect(f.rpc).not.toHaveBeenCalled();
  f.rerender(<ApplicationUpdates {...f.props} active />); await edit();
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Unsent draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
  expect(screen.queryByDisplayValue("Unsent draft")).not.toBeInTheDocument();
  expect(f.rpc).toHaveBeenCalledTimes(1); expect(f.onSaved).not.toHaveBeenCalled();
});

it("edits and withdraws the current pending proposal with its revision", async () => {
  const f = fixture(proposal);
  fireEvent.click(await screen.findByRole("button", { name: "Edit proposed changes" }));
  expect(screen.getByLabelText("Full name")).toHaveValue(proposal.full_name);
  consent(); submit(); await screen.findByText("Changes submitted for staff review.");
  expect(f.rpc).toHaveBeenCalledWith("submit_onboarding_update", expect.objectContaining({ p_expected_application_revision: 4, p_expected_update_revision: 2 }));
  f.respond({ data: { ...proposal, status: "withdrawn", revision: 3 }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Withdraw proposed changes" }));
  await screen.findByText("Proposed changes withdrawn. Your current application is unchanged.");
  expect(f.rpc).toHaveBeenCalledWith("withdraw_onboarding_update", { p_id: proposal.id, p_expected_revision: 2 });
  expect(application.full_name).toBe("Current Member Name");
});

it("preserves the draft after a stale revision and does not retry automatically", async () => {
  const f = fixture(); await edit(); consent();
  f.respond({ data: null, error: { code: "40001", message: "private DB detail" } });
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Retained draft" } }); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Reload the latest details");
  expect(screen.getByLabelText("Full name")).toHaveValue("Retained draft");
  expect(f.rpc.mock.calls.filter(([name]) => name === "submit_onboarding_update")).toHaveLength(1);
  expect(f.onSaved).not.toHaveBeenCalled(); expect(screen.queryByText("Changes submitted for staff review.")).not.toBeInTheDocument();
});

it("does not claim success without a server receipt and preserves confirmed success if refresh fails", async () => {
  const f = fixture(); await edit(); consent();
  f.respond({ data: null, error: null }); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("server did not confirm");
  expect(f.onSaved).not.toHaveBeenCalled();
  f.respond({ data: proposal, error: null }); f.onSaved.mockRejectedValue(new Error("refresh unavailable")); submit();
  await screen.findByText("Changes submitted for staff review.");
  expect(screen.getByRole("alert")).toHaveTextContent("change was recorded");
});

it("blocks a changed authenticated account before mutation", async () => {
  const f = fixture(); await edit(); consent(); f.changeAccount("different-member"); submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Your account changed");
  expect(f.rpc).toHaveBeenCalledTimes(1); expect(f.onSaved).not.toHaveBeenCalled();
});

it("discards a late proposal response after unmount", async () => {
  const f = fixture(); await edit(); consent();
  let finish!: (value: unknown) => void;
  f.rpc.mockImplementation(() => { const response = new Promise(resolve => { finish = resolve; }); return Object.assign(response, { setHeader: () => response }) as never; });
  submit(); await waitFor(() => expect(finish).toBeDefined()); f.unmount();
  await act(async () => finish({ data: proposal, error: null }));
  expect(f.onSaved).not.toHaveBeenCalled();
  expect(screen.queryByText(proposal.full_name)).not.toBeInTheDocument();
});

it("keeps review staff rejection unavailable and blocks identity changes missing current evidence", async () => {
  fixture({ ...proposal, needs_documents: true }, { admin: true });
  expect(await screen.findByRole("button", { name: "Apply proposed changes" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Reject proposed changes" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit proposed changes" })).not.toBeInTheDocument();
});


it("retains conflict edits on reload until the member explicitly adopts the latest revision", async () => {
  const f = fixture(proposal);
  fireEvent.click(await screen.findByRole("button", { name: "Edit proposed changes" }));
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "My retained changes" } }); consent();
  f.respond({ data: null, error: { code: "40001", message: "stale" } }); submit();
  await screen.findByRole("alert");
  f.rpc.mockImplementation((name: string) => {
    const response = Promise.resolve({ data: { ...proposal, revision: name === "get_onboarding_update" ? 3 : 4 }, error: null });
    return Object.assign(response, { setHeader: () => response });
  });
  fireEvent.click(screen.getByRole("button", { name: "Reload latest update" }));
  const adopt = await screen.findByRole("button", { name: "Use latest revision for these changes" });
  expect(screen.getByLabelText("Full name")).toHaveValue("My retained changes");
  fireEvent.click(adopt);
  expect(screen.getByRole("checkbox", { name: /I confirm these proposed changes/ })).not.toBeChecked();
  consent(); submit(); await screen.findByText("Changes submitted for staff review.");
  expect(f.rpc).toHaveBeenLastCalledWith("submit_onboarding_update", expect.objectContaining({ p_full_name: "My retained changes", p_expected_update_revision: 3 }));
});

it("submits an independent reviewer decision with the proposal revision and explanation", async () => {
  const f = fixture(proposal, { admin: true, canReject: true });
  const apply = await screen.findByRole("button", { name: "Apply proposed changes" });
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Checked matching current identity evidence." } });
  f.respond({ data: { ...proposal, status: "approved", revision: 3 }, error: null });
  fireEvent.click(apply);
  await screen.findByText(/Changes applied/);
  expect(f.rpc).toHaveBeenCalledWith("review_onboarding_update", { p_id: proposal.id, p_expected_revision: 2, p_decision: "approved", p_reason: "Checked matching current identity evidence.", p_guardian_email: null, p_guardian_evidence: null, p_guardian_received_at: null });
  expect(f.headers).toHaveBeenLastCalledWith("Authorization", "Bearer admin-one-token");
});

it("paginates the administrator queue and opens the chosen application without permitting self review", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const header = vi.fn();
  const rpc = vi.fn((_name: string, args: { p_page: number }) => {
    const items = args.p_page === 1 ? [{ ...proposal, id: "own-update", user_id: "admin-one", previous_details: { ...proposal.previous_details, full_name: "My own proposal" } }, proposal] : [{ ...proposal, id: "last-update", user_id: "member-last", previous_details: { ...proposal.previous_details, full_name: "Last proposal" } }];
    const response = Promise.resolve({ data: { items, total: 21 }, error: null });
    return Object.assign(response, { setHeader: (key: string, value: string) => { header(key, value); return response; } });
  });
  const client = { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: "admin-one" }, access_token: "admin-token" } }, error: null }) } } as unknown as SupabaseClient;
  render(<ApplicationUpdateQueue client={client} userId="admin-one" />);
  await screen.findByText("21 updates awaiting review.");
  expect(screen.getByRole("button", { name: /Review proposed changes\s*for My own proposal/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Review proposed changes\s*for Current Member Name/ }));
  expect(await screen.findByText("Selected application member-one")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Review member changes" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Next updates" }));
  await screen.findByRole("button", { name: /Review proposed changes\s*for Last proposal/ });
  expect(screen.queryByText("Selected application member-one")).not.toBeInTheDocument();
  expect(rpc).toHaveBeenLastCalledWith("list_onboarding_updates", { p_status: "pending", p_page: 2 });
  expect(header).toHaveBeenLastCalledWith("Authorization", "Bearer admin-token");
  expect(screen.getByRole("button", { name: "Next updates" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Review proposed changes\s*for Last proposal/ }));
  expect(await screen.findByText("Selected application member-last")).toBeVisible();
});


it("keeps the mutation and refresh busy until their receipts complete and suppresses duplicate submission", async () => {
  const f = fixture(); await edit(); consent();
  let finish!: (value: unknown) => void, finishRefresh!: () => void;
  f.onSaved.mockImplementation(() => new Promise<void>(resolve => { finishRefresh = resolve; }));
  f.rpc.mockImplementation(() => { const response = new Promise(resolve => { finish = resolve; }); return Object.assign(response, { setHeader: () => response }) as never; });
  submit(); submit();
  await waitFor(() => expect(finish).toBeDefined());
  expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("button", { name: "Cancel changes" })).toBeDisabled();
  expect(f.rpc.mock.calls.filter(([name]) => name === "submit_onboarding_update")).toHaveLength(1);
  await act(async () => finish({ data: proposal, error: null }));
  await waitFor(() => expect(finishRefresh).toBeDefined());
  f.rerender(<ApplicationUpdates {...f.props} refreshKey="refreshed-document" />);
  expect(f.rpc.mock.calls.filter(([name]) => name === "get_onboarding_update")).toHaveLength(1);
  expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("button", { name: "Edit proposed changes" })).toBeDisabled();
  await act(async () => finishRefresh());
  await waitFor(() => expect(f.onBusyChange).toHaveBeenLastCalledWith(false));
  expect(screen.getByText("Changes submitted for staff review.")).toBeVisible();
});

it("locks every queue exit during a nested mutation and refreshes after confirmation without losing the selected receipt", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  let completed = false;
  const rpc = vi.fn(() => { const response = Promise.resolve({ data: { items: completed ? [] : [proposal, { ...proposal, id: "other-update", user_id: "other-member", previous_details: { ...proposal.previous_details, full_name: "Other member" } }], total: completed ? 0 : 21 }, error: null }); return Object.assign(response, { setHeader: () => response }); });
  const client = { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: "admin-one" }, access_token: "admin-token" } }, error: null }) } } as unknown as SupabaseClient;
  const onBusyChange = vi.fn();
  const view = render(<ApplicationUpdateQueue client={client} userId="admin-one" onBusyChange={onBusyChange} />);
  fireEvent.click(await screen.findByRole("button", { name: /Review proposed changes\s*for Current Member Name/ }));
  await act(async () => nestedForm.props!.onBusyChange?.(true));
  for (const name of ["Close proposed changes", "Refresh proposed changes", "Previous updates", "Next updates"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Review proposed changes\s*for Other member/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Close proposed changes" }));
  expect(screen.getByText("Selected application member-one")).toBeVisible();
  expect(rpc).toHaveBeenCalledTimes(1); expect(onBusyChange).toHaveBeenLastCalledWith(true);
  completed = true;
  await act(async () => nestedForm.props!.onApplicationUpdate?.());
  await screen.findByText("0 updates awaiting review.");
  expect(screen.getByText("Selected application member-one")).toBeVisible();
  expect(screen.getByRole("button", { name: "Close proposed changes" })).toBeDisabled();
  await act(async () => nestedForm.props!.onBusyChange?.(false));
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole("button", { name: "Close proposed changes" })).toBeEnabled();
  view.rerender(<ApplicationUpdateQueue client={client} userId="admin-one" onBusyChange={onBusyChange} blocked />);
  expect(screen.getByRole("button", { name: "Close proposed changes" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh proposed changes" })).toBeDisabled();
});
