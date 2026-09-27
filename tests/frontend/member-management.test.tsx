import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemberManagementPage } from "../../src/pages/MemberManagementPage";
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
