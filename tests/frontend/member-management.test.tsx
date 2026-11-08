import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemberManagementPage, memberTierLabel, identityProgress } from "../../src/pages/MemberManagementPage";
vi.mock("../../src/pages/OnboardingForm", () => ({ OnboardingForm: () => <p>Protected application details</p> }));
const member = { user_id: "other", name: "Synthetic Person", email: "person@example.test", registered_at: "2026-09-01", status: "incomplete", application_status: null, role: "member", revision: null, photo_available: false, id_available: false, reviewed_at: null };
function setup(role: string, targetRole = "member", applicationStatus: string | null = null) {
 const rpc = vi.fn(async (name: string) => ({ data: name === "get_basic_account_summary" ? { role } : name === "list_basic_members" ? { items: [{ ...member, role: targetRole, application_status: applicationStatus, revision: 4 }], total: 1, counts: { incomplete: 1 } } : null, error: null }));
 const client = { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: "actor", email: "actor@example.test" } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
 render(<MemoryRouter><MemberManagementPage client={client} /></MemoryRouter>);
 return rpc;
}
it("lists incomplete registrations and lets admins manage Staff, not Admin roles", async () => {
 const rpc = setup("admin");
 await screen.findByText("person@example.test");
 fireEvent.click(screen.getByRole("button", { name: /View Synthetic/ }));
 expect(screen.getByText("This account has not submitted an application yet.")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Manage staff role" }));
 expect(screen.queryByRole("option", { name: "Admin — membership and Staff management" })).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("New role"), { target: { value: "membership_reviewer" } });
 fireEvent.click(screen.getByRole("checkbox"));
 fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_membership_staff_role", { p_user_id: "other", p_role: "membership_reviewer", p_expected_role: "member" }));
});
it("does not offer Admin modification to another Admin", async () => {
 setup("admin", "admin"); await screen.findByText("person@example.test");
 fireEvent.click(screen.getByRole("button", { name: /View Synthetic/ }));
 expect(screen.queryByRole("button", { name: "Manage staff role" })).not.toBeInTheDocument();
});
it("offers Admin appointments only to Super admins", async () => {
 setup("super_admin"); await screen.findByText("person@example.test");
 fireEvent.click(screen.getByRole("button", { name: /View Synthetic/ })); fireEvent.click(screen.getByRole("button", { name: "Manage staff role" }));
 expect(screen.getByRole("option", { name: "Admin — membership and Staff management" })).toBeInTheDocument();
});
it("restricts Staff requests to pending and hides management filters", async () => {
 const rpc = setup("membership_reviewer"); await screen.findByText("person@example.test");
 expect(rpc).toHaveBeenCalledWith("list_basic_members", expect.objectContaining({ p_status: "pending", p_role: null }));
 expect(screen.queryByRole("button", { name: "View notification status" })).not.toBeInTheDocument();
 expect(screen.queryByLabelText("Membership status")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: /View Synthetic/ }));
 expect(screen.queryByRole("button", { name: "Manage staff role" })).not.toBeInTheDocument();
});

it("requires an audited reason and revision for membership revocation", async () => {
 const rpc = setup("admin", "member", "approved"); await screen.findByText("person@example.test");
 fireEvent.click(screen.getByRole("button", { name: /View Synthetic/ }));
 fireEvent.click(screen.getByRole("button", { name: "Revoke membership" }));
 expect(screen.getByLabelText("Reason")).toBeRequired();
 fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic review decision" } });
 fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith("change_basic_membership", { p_user_id: "other", p_action: "revoke", p_reason: "Synthetic review decision", p_expected_revision: 4 }));
});
it("does not fetch member records for an ordinary member", async () => {
 const rpc = setup("member"); await screen.findByText("You do not have permission to review members.");
 expect(rpc).not.toHaveBeenCalledWith("list_basic_members", expect.anything());
});
it("offers reinstatement for revoked membership without implying role removal", async () => {
 const rpc = setup("admin", "membership_reviewer", "revoked"); await screen.findByText("person@example.test");
 fireEvent.click(screen.getByRole("button", { name: /View Synthetic/ }));
 expect(screen.queryByRole("button", { name: "Revoke membership" })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Reinstate membership" }));
 expect(screen.getByText(/Staff access is separate and will not change/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic reinstatement decision" } });
 fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith("change_basic_membership", expect.objectContaining({ p_action: "reinstate", p_expected_revision: 4 })));
});

it("removes notification history on logout and ignores an outstanding response", async () => {
 let authChanged!: (event: string, session: unknown) => void;
 let finish!: (value: unknown) => void;
 const rpc = vi.fn((name: string) => name === "list_member_notification_status" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ error: null, data: name === "get_basic_account_summary" ? { role: "admin" } : { items: [], total: 0, counts: {} } }));
 const client = { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: "actor" } } } }), onAuthStateChange: (callback: typeof authChanged) => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; } } } as unknown as SupabaseClient;
 render(<MemoryRouter><MemberManagementPage client={client} /></MemoryRouter>);
 fireEvent.click(await screen.findByRole("button", { name: "View notification status" }));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith("list_member_notification_status", expect.anything()));
 authChanged("SIGNED_OUT", null);
 await screen.findByRole("link", { name: "Sign in" });
 finish({ error: null, data: { items: [{ id: "secret", recipient_email: "private@example.test", kind: "approved", state: "held", delivery_state: "unconfirmed", attempts: 0, created_at: "2026-09-27", suppressed: false }], total: 1 } });
 await waitFor(() => expect(screen.queryByText(/private@example.test/)).not.toBeInTheDocument());
 expect(screen.queryByRole("region", { name: "Membership notification status" })).not.toBeInTheDocument();
});

it.each([null, "pending"])("View focuses details repeatedly without background refresh stealing focus (%s)", async applicationStatus => {
 const scroll = vi.fn();
 const previous = HTMLElement.prototype.scrollIntoView;
 HTMLElement.prototype.scrollIntoView = scroll;
 try {
  setup("admin", "member", applicationStatus);
  const view = await screen.findByRole("button", { name: /View Synthetic/ });
  fireEvent.click(view);
  const heading = screen.getByRole("heading", { name: "Synthetic Person" });
  expect(heading).toHaveFocus(); expect(view).toHaveAttribute("aria-expanded", "true");
  view.focus(); fireEvent.click(view); expect(heading).toHaveFocus(); expect(scroll).toHaveBeenCalledTimes(2);
  const search = screen.getByLabelText("Search members"); search.focus();
  fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
  await waitFor(() => expect(screen.queryByText("Loading members…")).not.toBeInTheDocument());
  expect(search).toHaveFocus(); expect(scroll).toHaveBeenCalledTimes(2);
 } finally { HTMLElement.prototype.scrollIntoView = previous; }
});

it("keeps tier and review status separate and filters tiers on the server", async () => {
 vi.stubEnv("VITE_MEMBERSHIP_LEVELS_ENABLED", "true");
 const rpc = vi.fn(async (name: string) => ({ data: name === "get_basic_account_summary" ? { role: "admin", membership_levels_enabled: true } : { items: [{ ...member, status: "approved", membership_level: "basic", verification: { email: true, identity: true, mobile: false } }], total: 1, counts: { approved: 1 } }, error: null }));
 const client = { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: "actor" } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
 const { unmount } = render(<MemoryRouter><MemberManagementPage client={client} /></MemoryRouter>);
 await screen.findByText("person@example.test");
 expect(screen.getByText("Basic · Active", { selector: "strong" })).toBeInTheDocument();
 expect(screen.getByText(/Mobile: not verified/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Membership level"), { target: { value: "premium" } });
 await waitFor(() => expect(rpc).toHaveBeenCalledWith("list_basic_members", expect.objectContaining({ p_membership_level: "premium" })));
 unmount(); vi.unstubAllEnvs();
});

it("keeps current tier independent of verification upgrades and retained originals", () => {
 expect(memberTierLabel({ membership_level: "basic", status: "incomplete", verification: { email: true, mobile: false, identity: false } })).toBe("Basic · Active");
 expect(identityProgress({ application_status: null, status: "incomplete" })).toBe("Verification not started");
 expect(identityProgress({ application_status: "pending", status: "incomplete" })).toBe("Verification in progress");
 expect(identityProgress({ application_status: "pending", status: "pending" })).toBe("Awaiting review");
 expect(identityProgress({ application_status: "approved", status: "approved", verification: { email: true, mobile: false, identity: true } })).toBe("Identity approved");
 expect(memberTierLabel({ membership_level: "verified", status: "approved" })).toBe("Verified · Active");
 expect(memberTierLabel({ membership_level: "premium", status: "approved" })).toBe("Premium · Active");
 expect(memberTierLabel({ membership_level: null, status: "approved", verification: { email: true, mobile: true, identity: true } })).toBe("Access restricted");
 expect(memberTierLabel({ membership_level: null, status: "revoked" })).toBe("Access revoked");
});

function sharedMobileReview(role: string, currentLevel = "aal2") {
  vi.stubEnv("VITE_MEMBERSHIP_LEVELS_ENABLED", "true");
  const target = { ...member, status: "approved", application_status: "approved", membership_level: "basic",
    verification: { email: true, identity: true, mobile: false } };
  const headers = vi.fn();
  const rpc = vi.fn((name: string, _args?: unknown) => {
    const response = Promise.resolve({ error: null, data: name === "get_basic_account_summary"
      ? { role, membership_levels_enabled: true } : name === "approve_shared_member_phone"
      ? { approved: true, method: "staff_shared" } : name === "list_basic_members"
      ? { items: [target], total: 1, counts: {} } : { items: [], total: 0 } });
    return Object.assign(response, { setHeader: (key: string, value: string) => {
      headers(name, key, value);
      return response;
    } });
  });
  const getSession = vi.fn(async () => ({
    data: { session: { user: { id: "actor" }, access_token: "synthetic-admin-token" } }, error: null,
  }));
  const client = { rpc, auth: { getSession, mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel }, error: null }) },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
  const view = render(<MemoryRouter><MemberManagementPage client={client} /></MemoryRouter>);
  return { ...view, rpc, getSession, headers };
}

async function openSharedMobileForm() {
  fireEvent.click(await screen.findByRole("button", { name: /View Synthetic/ }));
  fireEvent.click(screen.getByRole("button", { name: "Approve shared mobile" }));
  fireEvent.change(screen.getByLabelText("Source account email"), { target: { value: "Source@Example.test" } });
  fireEvent.change(screen.getByLabelText("Approval reason"), { target: { value: "Same owner confirmed on both accounts" } });
}

it("binds approval to the selected member after the reviewer attests to consent", async () => {
  const { rpc, headers, unmount } = sharedMobileReview("admin");
  try {
    await openSharedMobileForm();
    const submit = screen.getByRole("button", { name: "Confirm shared mobile approval" });
    fireEvent.submit(submit.closest("form")!);
    expect(rpc).not.toHaveBeenCalledWith("approve_shared_member_phone", expect.anything());
    fireEvent.click(screen.getByRole("checkbox", { name: /both accounts belong to the same person/ }));
    fireEvent.click(submit);
    expect(await screen.findByText("Shared mobile confirmed by staff.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("approve_shared_member_phone", {
      p_target_user_id: "other", p_source_email: "source@example.test",
      p_reason: "Same owner confirmed on both accounts", p_confirmed_same_person: true,
    });
    expect(headers).toHaveBeenCalledWith("approve_shared_member_phone", "Authorization", "Bearer synthetic-admin-token");
  } finally { unmount(); vi.unstubAllEnvs(); }
});

it("does not present shared-mobile approval to identity review Staff", async () => {
  const { unmount } = sharedMobileReview("membership_reviewer");
  try {
    fireEvent.click(await screen.findByRole("button", { name: /View Synthetic/ }));
    expect(screen.queryByRole("button", { name: "Approve shared mobile" })).not.toBeInTheDocument();
  } finally { unmount(); vi.unstubAllEnvs(); }
});

it.each(["session changed", "MFA missing"])("does not submit shared-mobile approval when %s", async issue => {
  const { rpc, getSession, unmount } = sharedMobileReview("admin", issue === "MFA missing" ? "aal1" : "aal2");
  try {
    await openSharedMobileForm();
    if (issue === "session changed") getSession.mockResolvedValueOnce({
      data: { session: { user: { id: "different" }, access_token: "other-synthetic-token" } }, error: null,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /both accounts belong to the same person/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm shared mobile approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Verify the current Admin session with your authenticator");
    expect(rpc).not.toHaveBeenCalledWith("approve_shared_member_phone", expect.anything());
  } finally { unmount(); vi.unstubAllEnvs(); }
});
