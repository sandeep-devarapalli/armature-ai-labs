import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountProvider, useAccount, useRegistrationLabel, membershipLabels, accountMembershipLabel } from "../../src/context/AccountContext";

function Probe() {
  const { account, loading, signedIn, error, refresh, signOut } = useAccount();
  const label = useRegistrationLabel();
  return <><p>{loading ? "Loading" : account ? `${account.name}: ${membershipLabels[account.status]} (${account.role})` : signedIn ? "Signed in" : "Signed out"}</p><p>{label}</p><p>{error}</p><button onClick={() => void refresh()}>Refresh</button><button onClick={() => void signOut()}>Logout</button></>;
}
function fixture() {
  let user: { id: string } | null = { id: "member-a" };
  let change: (event: string, session: unknown) => void = () => {};
  const rpc = vi.fn().mockResolvedValue({ data: { user_id: "member-a", name: "Member A", status: "approved", role: "member" }, error: null });
  const client = { rpc, auth: {
    getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
    onAuthStateChange: (callback: typeof change) => { change = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => { user = null; change("SIGNED_OUT", null); return { error: null }; },
  } } as unknown as SupabaseClient;
  return { client, rpc, switchUser: (id: string) => { user = { id }; change("SIGNED_IN", { user }); } };
}
it("restores basic membership without paid-platform data and refreshes decisions", async () => {
  const { client, rpc } = fixture(); render(<AccountProvider client={client}><Probe /></AccountProvider>);
  expect(screen.getByText("Loading")).toBeInTheDocument();
  expect(screen.queryByText("Register for free")).not.toBeInTheDocument();
  await screen.findByText("Member A: Basic · Approved (member)");
  expect(screen.getByText("View membership")).toBeInTheDocument();
  rpc.mockResolvedValue({ data: { user_id: "member-a", name: "Member A", status: "revoked", role: "member" }, error: null });
  act(() => window.dispatchEvent(new Event("armature:account-changed")));
  await screen.findByText("Member A: Basic · Revoked (member)");
  fireEvent.click(screen.getByText("Logout")); await screen.findByText("Signed out");
  expect(screen.getByText("Register for free")).toBeInTheDocument();
});
it("discards an old account response after switching identity", async () => {
  const { client, rpc, switchUser } = fixture(); let resolveOld: (value: unknown) => void = () => {};
  rpc.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  render(<AccountProvider client={client}><Probe /></AccountProvider>);
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  rpc.mockResolvedValue({ data: { user_id: "member-b", name: "Member B", status: "incomplete", role: "member" }, error: null });
  act(() => switchUser("member-b")); await screen.findByText("Member B: Registration incomplete (member)");
  await act(async () => resolveOld({ data: { user_id: "member-a", name: "Old administrator", status: "approved", role: "super_admin" }, error: null }));
  expect(screen.queryByText(/Old administrator/)).not.toBeInTheDocument();
  expect(screen.getByText("Complete registration")).toBeInTheDocument();
});
it("clears privileged summary when a refresh fails", async () => {
  const { client, rpc } = fixture(); render(<AccountProvider client={client}><Probe /></AccountProvider>);
  await screen.findByText("Member A: Basic · Approved (member)");
  rpc.mockResolvedValue({ error: new Error("Denied") });
  fireEvent.click(screen.getByText("Refresh"));
  await screen.findByText("Unable to refresh account status. Please retry.");
  expect(screen.queryByText(/Basic · Approved/)).not.toBeInTheDocument();
  expect(screen.getByText("Signed in")).toBeInTheDocument();
});

it("uses server-derived tiers only when both release gates are enabled", async () => {
  const { accountMembershipLabel, accountMembershipLevelsEnabled, applicationStatusLabel } = await import("../../src/context/AccountContext");
  const summary = { user_id: "member-a", name: "A", email: "a@example.test", role: "member" as const, status: "approved", application_status: "approved", revision: 1, owner_approval_available: false, membership_level: "basic" as const, membership_levels_enabled: true };
  vi.stubEnv("VITE_MEMBERSHIP_LEVELS_ENABLED", "false");
  expect(accountMembershipLabel(summary)).toBe("Basic · Approved");
  vi.stubEnv("VITE_MEMBERSHIP_LEVELS_ENABLED", "true");
  expect(accountMembershipLevelsEnabled({ membership_levels_enabled: false })).toBe(false);
  expect(accountMembershipLabel(summary)).toBe("Basic member");
  expect(accountMembershipLabel({ ...summary, membership_level: "verified" })).toBe("Verified member");
  expect(accountMembershipLabel({ ...summary, membership_level: "premium" })).toBe("Premium member");
  expect(applicationStatusLabel("approved", true)).toBe("Identity approved");
  expect(applicationStatusLabel("revoked", true)).toBe("Membership revoked");
  vi.unstubAllEnvs();
});

it("refreshes at a server-provided subscription boundary", async () => {
  vi.useFakeTimers(); vi.stubEnv("VITE_MEMBERSHIP_LEVELS_ENABLED", "true");
  const { client, rpc } = fixture();
  rpc.mockResolvedValue({ data: { user_id: "member-a", name: "Member A", status: "approved", role: "member", membership_levels_enabled: true, membership_level: "premium", next_status_change_at: new Date(Date.now() + 5000).toISOString() }, error: null });
  const { unmount } = render(<AccountProvider client={client}><Probe /></AccountProvider>);
  await act(async () => {});
  expect(rpc).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(5100); });
  expect(rpc).toHaveBeenCalledTimes(2);
  unmount(); vi.useRealTimers(); vi.unstubAllEnvs();
});


it('does not tell a revoked confirmed-email member to verify email again', () => {
  vi.stubEnv('VITE_MEMBERSHIP_LEVELS_ENABLED', 'true');
  try {
    expect(accountMembershipLabel({ membership_levels_enabled: true, membership_level: null, verification: { email: true, mobile: true, identity: false }, status: 'revoked' } as Parameters<typeof accountMembershipLabel>[0])).toBe('Membership access restricted');
  } finally { vi.unstubAllEnvs(); }
});
