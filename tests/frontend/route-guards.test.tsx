import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminRoute, MemberRoute } from "../../src/components/RouteGuard";
import { hasAdminRole } from "../../src/lib/liveData";

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));

vi.mock("../../src/context/AppContext", () => ({
  useApp: mockUseApp
}));

function renderFinancialsRoute() {
  render(
    <MemoryRouter initialEntries={["/financials"]}>
      <Routes>
        <Route path="/auth" element={<div>Member sign in</div>} />
        <Route path="/dashboard" element={<div>Member dashboard</div>} />
        <Route
          path="/financials"
          element={(
            <MemberRoute>
              <AdminRoute><div>Financial model</div></AdminRoute>
            </MemberRoute>
          )}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("admin route access", () => {
  beforeEach(() => mockUseApp.mockReset());

  it("waits for the admin role check", () => {
    mockUseApp.mockReturnValue({ isAdmin: false, loading: true });
    render(<MemoryRouter><AdminRoute><div>Financial model</div></AdminRoute></MemoryRouter>);
    expect(screen.getByText("Checking admin role…")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to member sign in", () => {
    mockUseApp.mockReturnValue({ currentMember: null, isAdmin: false, loading: false });
    renderFinancialsRoute();
    expect(screen.getByText("Member sign in")).toBeInTheDocument();
  });

  it("sends a non-admin member back to their dashboard", () => {
    mockUseApp.mockReturnValue({ currentMember: { id: "member" }, isAdmin: false, loading: false });
    renderFinancialsRoute();
    expect(screen.getByText("Member dashboard")).toBeInTheDocument();
  });

  it("allows an admin to view the financial model", () => {
    mockUseApp.mockReturnValue({ currentMember: { id: "admin" }, isAdmin: true, loading: false });
    renderFinancialsRoute();
    expect(screen.getByText("Financial model")).toBeInTheDocument();
  });
});

describe("admin role classification", () => {
  it("allows only admin and super-admin roles", () => {
    expect(hasAdminRole([])).toBe(false);
    expect(hasAdminRole([{ role: "operations" }])).toBe(false);
    expect(hasAdminRole([{ role: "safety" }])).toBe(false);
    expect(hasAdminRole([{ role: "admin" }])).toBe(true);
    expect(hasAdminRole([{ role: "super_admin" }])).toBe(true);
  });
});
