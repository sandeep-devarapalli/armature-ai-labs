import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemberNotificationStatus } from "../../src/components/MemberNotificationStatus";
const item = { id: "one", recipient_email: "person@example.test", kind: "approved", state: "accepted", delivery_state: "delivered", created_at: "2026-09-27T00:00:00Z", delivery_updated_at: "2026-09-27T00:01:00Z", attempts: 1, suppressed: false };
function setup(data = { items: [item], total: 26 }) {
 const rpc = vi.fn().mockResolvedValue({ data, error: null });
 const view = render(<MemberNotificationStatus client={{ rpc } as unknown as SupabaseClient} />);
 return { rpc, ...view };
}
it("loads only on expansion and distinguishes acceptance from delivery", async () => {
 const { rpc } = setup(); expect(rpc).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: "View notification status" }));
 await screen.findByRole("cell", { name: /person@example.test/ });
 expect(screen.getByRole("cell", { name: "Accepted by provider" })).toBeInTheDocument();
 expect(screen.getByRole("cell", { name: "Delivered to recipient server" })).toBeInTheDocument();
 expect(screen.getByText(/does not confirm that someone read it/)).toBeInTheDocument();
 expect(screen.queryByRole("button", { name: /^send|retry|enable/i })).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Next notifications" }));
 await waitFor(() => expect(rpc).toHaveBeenLastCalledWith("list_member_notification_status", { p_page: 2, p_search: "", p_state: "" }));
 fireEvent.change(screen.getByLabelText("Recipient email"), { target: { value: "person" } });
 fireEvent.change(screen.getByLabelText("Notification status"), { target: { value: "accepted" } });
 await waitFor(() => expect(rpc).toHaveBeenLastCalledWith("list_member_notification_status", { p_page: 1, p_search: "person", p_state: "accepted" }));
});
it("displays suppression and clears data on failed refresh", async () => {
 const { rpc } = setup({ items: [{ ...item, suppressed: true, delivery_state: "bounced" }], total: 1 });
 fireEvent.click(screen.getByRole("button", { name: "View notification status" }));
 await screen.findByText("Further sends to this address are blocked.");
 rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
 fireEvent.click(screen.getByRole("button", { name: "Refresh notifications" }));
 await screen.findByRole("alert"); expect(screen.queryByRole("cell", { name: /person@example.test/ })).not.toBeInTheDocument();
});
it("does not resurrect stale data when collapsed during a request", async () => {
 const { rpc } = setup(); let resolve!: (value: unknown) => void;
 rpc.mockReturnValue(new Promise((done) => { resolve = done; }));
 fireEvent.click(screen.getByRole("button", { name: "View notification status" }));
 await waitFor(() => expect(rpc).toHaveBeenCalled());
 fireEvent.click(screen.getByRole("button", { name: "Hide notification status" }));
 resolve({ data: { items: [item], total: 1 }, error: null });
 await waitFor(() => expect(screen.queryByRole("cell", { name: /person@example.test/ })).not.toBeInTheDocument());
});
it("shows an empty result without action controls", async () => {
 setup({ items: [], total: 0 }); fireEvent.click(screen.getByRole("button", { name: "View notification status" }));
 await screen.findByText("No matching notifications."); expect(screen.getByRole("button", { name: "Next notifications" })).toBeDisabled();
});
