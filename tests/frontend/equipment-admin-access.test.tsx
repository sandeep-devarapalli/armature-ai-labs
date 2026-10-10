import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: null as string | null, rpc: vi.fn() }));
vi.mock("../../src/config/release", async importOriginal => ({ ...await importOriginal<object>(), basicOnboardingAvailable: true, memberPlatformAvailable: false }));
vi.mock("../../src/context/AccountContext", async importOriginal => ({ ...await importOriginal<object>(), useAccount: () => ({ account: state.role ? { user_id: "test", name: "Test account", status: "approved", role: state.role } : null, signedIn: Boolean(state.role), loading: false }), membershipLabels: { approved: "Basic · Approved" }, accountRoleLabels: {} }));
vi.mock("../../src/components/AccountAvatar", () => ({ AccountAvatar: () => null }));
vi.mock("../../src/lib/supabase", async importOriginal => ({ ...await importOriginal<object>(), supabase: { rpc: state.rpc, from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) } }));
import { routes } from "../../src/app/routes";
import { AccountMenu } from "../../src/components/AccountMenu";
beforeEach(() => { state.role = null; state.rpc.mockReset(); state.rpc.mockResolvedValue({ data: { units: [], assets: [], resources: [], locations: [] }, error: null }); });
it.each([null, "member", "membership_reviewer", "admin", "super_admin"])("protects the actual equipment route and navigation for %s with paid routes off", async role => {
  state.role = role;
  const route = routes.flatMap(route => route.children ?? []).find(route => route.path === "/admin/equipment");
  render(<MemoryRouter><AccountMenu /><Suspense fallback={<p>Loading</p>}>{route!.element}</Suspense></MemoryRouter>);
  if (role === "admin" || role === "super_admin") {
    await screen.findByRole("heading", { name: "Equipment operations" });
    expect(screen.getByRole("link", { name: "Admin → Equipment operations", hidden: true })).toHaveAttribute("href", "/admin/equipment");
    expect(state.rpc).toHaveBeenCalledWith("admin_list_equipment_operations");
  } else {
    await screen.findByRole("heading", { name: "Admin access required" });
    expect(screen.queryByRole("link", { name: "Admin → Equipment operations", hidden: true })).not.toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  }
});
