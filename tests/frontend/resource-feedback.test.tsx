import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount, type AccountSummary } from "../../src/context/AccountContext";
import { ResourceFeedbackAdminPage, ResourceFeedbackPage } from "../../src/pages/ResourceFeedbackPage";
import { feedbackSource } from "../../src/lib/resourceFeedback";

vi.mock("../../src/context/AccountContext", () => ({ useAccount: vi.fn() }));
const basic: AccountSummary = { user_id: "basic-user", name: "Private registration name", email: "private@example.test", status: "incomplete", application_status: null, role: "member", revision: null, owner_approval_available: false, membership_level: "basic", membership_levels_enabled: true };
const row = { id: "feedback-one", document: "actuator-specifications", version: "2026-10-25", kind: "correction", reference: "RS06 mass", body: "Check whether the cable is included in the mass.", source_url: "https://example.test/datasheet", display_name: "Chosen public name", response: "", created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z", revision: 1, status: "pending", review_note: "" };
function account(value: AccountSummary | null) {
  vi.mocked(useAccount).mockReturnValue({ account: value, signedIn: Boolean(value), loading: false, error: "", refresh: vi.fn(), signOut: vi.fn() });
}
function fixture(options: { moderation?: boolean; own?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => ({ data: name === "resource_feedback_access" ? { can_submit: true, can_moderate: Boolean(options.moderation) } : { items: name === "list_my_resource_feedback" && options.own || name === "list_resource_feedback_queue" && options.moderation ? [row] : [], total: name === "list_my_resource_feedback" && options.own || name === "list_resource_feedback_queue" && options.moderation ? 1 : 0 }, error: null }));
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}
function page(client: SupabaseClient) {
  return <MemoryRouter initialEntries={["/resources/white-paper/robotic-actuators/feedback?document=actuator-specifications"]}><ResourceFeedbackPage client={client} /></MemoryRouter>;
}
beforeEach(() => { vi.clearAllMocks(); account(null); });

describe("Resource feedback", () => {
  it("loads only the public feed for signed-out readers and offers Basic sign-in", async () => {
    const { client, rpc } = fixture(); render(page(client));
    expect(await screen.findByText("No published feedback yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in or register for free" })).toHaveAttribute("href", "/auth");
    expect(rpc).toHaveBeenCalledWith("list_resource_feedback", { p_document: "actuator-specifications", p_page: 1 });
    expect(rpc).not.toHaveBeenCalledWith("resource_feedback_access", expect.anything());
    expect(screen.queryByLabelText("Public display name")).not.toBeInTheDocument();
  });
  it("allows Basic membership without identity approval and never pre-fills private identity", async () => {
    account(basic); const { client } = fixture({ own: true }); render(page(client));
    expect(await screen.findByLabelText("Public display name")).toHaveValue("");
    expect(screen.getByText(/Awaiting review/)).toBeVisible();
    expect(screen.getByText("No published feedback yet.")).toBeVisible();
    expect(screen.queryByText(basic.email)).not.toBeInTheDocument();
    expect(screen.queryByText(basic.name)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("preserves text and the idempotency key after an ambiguous submission failure", async () => {
    account(basic); const { client, rpc } = fixture();
    const normal = rpc.getMockImplementation()!;
    rpc.mockImplementation(async name => name === "submit_resource_feedback" ? { data: null, error: { message: "Network failed" } } as never : normal(name));
    render(page(client));
    fireEvent.change(await screen.findByLabelText("Public display name"), { target: { value: "Public author" } });
    fireEvent.change(screen.getByLabelText("Your comment or correction"), { target: { value: "Please check this specification." } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your text is still here");
    expect(screen.getByLabelText("Your comment or correction")).toHaveValue("Please check this specification.");
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(rpc.mock.calls.filter(call => call[0] === "submit_resource_feedback")).toHaveLength(2));
    const submissions = (rpc.mock.calls as unknown as [string, Record<string, unknown>][]).filter(call => call[0] === "submit_resource_feedback");
    expect(submissions[0][1].p_request_id).toBe(submissions[1][1].p_request_id);
    expect(submissions[0][1]).toMatchObject({ p_document: "actuator-specifications", p_display_name: "Public author", p_consent_version: "2026-10-25-resource-feedback-v1" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Your comment or correction"), { target: { value: "Changed correction with a new source." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(rpc.mock.calls.filter(call => call[0] === "submit_resource_feedback")).toHaveLength(3));
    const third = (rpc.mock.calls as unknown as [string, Record<string, unknown>][]).filter(call => call[0] === "submit_resource_feedback")[2];
    expect(third[1].p_request_id).not.toBe(submissions[0][1].p_request_id);
  });
  it("clears private submissions and drafts when the account changes", async () => {
    account(basic); const { client } = fixture({ own: true }); const view = render(page(client));
    fireEvent.change(await screen.findByLabelText("Public display name"), { target: { value: "Private draft" } });
    expect(screen.getByText(row.body)).toBeVisible();
    account(null); await act(async () => view.rerender(page(client)));
    expect(screen.queryByText(row.body)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Private draft")).not.toBeInTheDocument();
  });
  it("does not fetch the moderation queue for membership-review staff", async () => {
    account({ ...basic, role: "membership_reviewer" }); const { client, rpc } = fixture();
    render(<MemoryRouter><ResourceFeedbackAdminPage client={client} /></MemoryRouter>);
    expect(await screen.findByText("Only active Admins and Super admins can review resource feedback.")).toBeVisible();
    expect(rpc).not.toHaveBeenCalledWith("list_resource_feedback_queue", expect.anything());
  });
  it("keeps unsent feedback while another submission is withdrawn and lists reload", async () => {
    account(basic); const { client, rpc } = fixture({ own: true }); render(page(client));
    fireEvent.change(await screen.findByLabelText("Public display name"), { target: { value: "Unsent public name" } });
    fireEvent.change(screen.getByLabelText("Your comment or correction"), { target: { value: "Unsent correction draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw my feedback" }));
    await waitFor(() => expect(rpc.mock.calls.filter(call => call[0] === "list_my_resource_feedback")).toHaveLength(2));
    expect(screen.getByLabelText("Public display name")).toHaveValue("Unsent public name");
    expect(screen.getByLabelText("Your comment or correction")).toHaveValue("Unsent correction draft");
  });
  it("discards an in-flight private response when the signed-in account changes", async () => {
    account(basic); const { client, rpc } = fixture(); const normal = rpc.getMockImplementation()!;
    let finish!: (value: { data: { items: typeof row[]; total: number }; error: null }) => void;
    rpc.mockImplementation(name => name === "list_my_resource_feedback" ? new Promise(resolve => { finish = resolve; }) : normal(name));
    const view = render(page(client));
    await waitFor(() => expect(finish).toBeDefined());
    account(null); await act(async () => view.rerender(page(client)));
    await act(async () => finish({ data: { items: [row], total: 1 }, error: null }));
    expect(screen.queryByText(row.body)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your submissions" })).not.toBeInTheDocument();
  });
  it("requires a rejection explanation and submits the expected revision", async () => {
    account({ ...basic, role: "admin" }); const { client, rpc } = fixture({ moderation: true });
    render(<MemoryRouter><ResourceFeedbackAdminPage client={client} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a note");
    fireEvent.change(screen.getByLabelText("Review note to the author (not public)"), { target: { value: "Please provide a source." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("review_resource_feedback", expect.objectContaining({ p_id: row.id, p_expected_revision: 1, p_status: "rejected", p_review_note: "Please provide a source." })));
  });
  it("rejects executable source links", () => {
    expect(feedbackSource("javascript:alert(1)")).toBeNull();
    expect(feedbackSource("data:text/html,test")).toBeNull();
    expect(feedbackSource("https://example.test/source")).toBe("https://example.test/source");
  });
});
