import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EquipmentWishlistPage, AdminEquipmentWishlistPage } from "../../src/pages/EquipmentWishlistPage";
import { WishlistSidebar } from "../../src/components/WishlistSidebar";
import { onboardingAuthReturnPath } from "../../src/lib/authReturnPath";

const mock = vi.hoisted(() => ({ account: null as null | { user_id: string; role: string; status: string }, votes: [] as string[], rows: [] as unknown[], rpc: vi.fn(), refresh: vi.fn(), privateRows: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: mock.account, signedIn: Boolean(mock.account), loading: false }) }));
vi.mock("../../src/context/EquipmentWishlist", () => ({ useEquipmentWishlist: () => ({ rows: mock.rows, count: mock.rows.length, votes: mock.votes, loading: false, error: "", refresh: mock.refresh }) }));
vi.mock("../../src/lib/equipmentWishlist", () => ({ wishlistStatuses: ["open", "planned"], listPrivateEquipmentWishes: mock.privateRows, listEquipmentWishes: vi.fn().mockResolvedValue({ rows: [], count: 0 }), wishRpc: mock.rpc, uploadWishImage: vi.fn(), readPrivateWishImage: vi.fn(), resolveMergedWish: vi.fn().mockResolvedValue(undefined), wishlistCatalogue: vi.fn().mockResolvedValue([]), wishlistImageUrl: () => "/safe-image" }));
const row = { id: "wish-1", component_name: "Robot gripper", project_use_case: "Test grasping", wishlist_category: "Robotics", wishlist_status: "open", requested_quantity: 1, vote_count: 0 };
function show(node: React.ReactNode) { return render(<MemoryRouter>{node}</MemoryRouter>); }
beforeEach(() => { mock.account = null; mock.rows = []; mock.votes = []; mock.rpc.mockReset().mockResolvedValue("wish-1"); mock.refresh.mockReset().mockResolvedValue(undefined); mock.privateRows.mockReset().mockResolvedValue({ rows: [], count: 0 }); });
it("shows real empty state without invented votes or anonymous submit", () => {
  show(<EquipmentWishlistPage />);
  expect(screen.getByText("No published requests yet")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth?next=%2Fcomponents%2Fwishlist");
});
it("sidebar preserves the zero-result state", () => {
  show(<WishlistSidebar />);
  expect(screen.getByText("No equipment requests have been published yet.")).toBeInTheDocument();
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
});
it("approved basic members can support and withdraw without needing paid access", async () => {
  mock.account = { user_id: "member", role: "member", status: "approved" }; mock.rows = [row];
  const view = show(<EquipmentWishlistPage />);
  fireEvent.click(screen.getByRole("button", { name: "Support request" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("vote_component_request", { p_request_id: "wish-1", p_enabled: true }));
  mock.votes = ["wish-1"]; view.rerender(<MemoryRouter><EquipmentWishlistPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Withdraw vote" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenLastCalledWith("vote_component_request", { p_request_id: "wish-1", p_enabled: false }));
});
it("pending members cannot submit or vote even when holding an admin label", () => {
  mock.account = { user_id: "member", role: "admin", status: "pending" }; mock.rows = [row]; show(<EquipmentWishlistPage />);
  expect(screen.queryByRole("button", { name: "Support request" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
});
it("membership-review Staff cannot query or moderate the admin queue", () => {
  mock.account = { user_id: "staff", role: "membership_reviewer", status: "approved" }; show(<AdminEquipmentWishlistPage />);
  expect(screen.getByRole("heading", { name: "Admin access required." })).toBeInTheDocument();
  expect(mock.privateRows).not.toHaveBeenCalled();
});
it("submits a private request and preserves the success notice", async () => {
  mock.account = { user_id: "member", role: "member", status: "approved" }; show(<EquipmentWishlistPage />);
  fireEvent.change(screen.getByLabelText("Equipment name"), { target: { value: "Robot gripper" } });
  fireEvent.change(screen.getByLabelText(/What would you build/), { target: { value: "Evaluate grasping" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("submit_equipment_wish", expect.objectContaining({ p_name: "Robot gripper", p_use_case: "Evaluate grasping", p_quantity: 1, p_budget: "unknown" })));
  expect(await screen.findByText(/Request saved for admin review/)).toBeInTheDocument();
});
it("keeps basic-only auth return narrowly scoped to the public wishlist", () => {
  expect(onboardingAuthReturnPath("/components/wishlist?name=Gripper", true)).toBe("/components/wishlist?name=Gripper");
  expect(onboardingAuthReturnPath("/admin/equipment-wishlist", true)).toBe("/onboarding");
  expect(onboardingAuthReturnPath("https://other.example/components/wishlist", true)).toBe("/onboarding");
});

it("closed requests reject new support while allowing an existing vote to be withdrawn", async () => {
  mock.account = { user_id: "member", role: "member", status: "approved" }; mock.rows = [{ ...row, wishlist_status: "available" }];
  const view = show(<EquipmentWishlistPage />);
  expect(screen.getByRole("button", { name: "Voting closed" })).toBeDisabled();
  mock.votes = ["wish-1"]; view.rerender(<MemoryRouter><EquipmentWishlistPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Withdraw vote" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("vote_component_request", { p_request_id: "wish-1", p_enabled: false }));
});
it("does not display an internal moderation note in the member request list", async () => {
  mock.account = { user_id: "member", role: "member", status: "approved" };
  mock.privateRows.mockResolvedValue({ rows: [{ ...row, decision_note: "Internal review detail", is_published: false }], count: 1 });
  show(<EquipmentWishlistPage />);
  expect(await screen.findByText("Awaiting admin review")).toBeInTheDocument();
  expect(screen.queryByText("Internal review detail")).not.toBeInTheDocument();
});
