import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthCallbackPage } from "../../src/pages/AuthPages";

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn()
}));

vi.mock("../../src/lib/supabase", () => ({
  googleAuthEnabled: false,
  supabase: {
    auth: {
      getSession: mockGetSession
    }
  }
}));

function renderCallback(next: string) {
  const query = new URLSearchParams({ next }).toString();
  render(
    <MemoryRouter initialEntries={[`/auth/callback?${query}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/join" element={<div>Join destination</div>} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
        <Route path="*" element={<div>Unexpected destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("auth callback return path", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "member" } } },
      error: null
    });
  });

  it("returns an authenticated member to the requested internal page", async () => {
    renderCallback("/join");

    expect(await screen.findByText("Join destination")).toBeInTheDocument();
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "\\\\evil.example\\path",
    "/\\evil.example/path"
  ])("rejects unsafe callback target %s", async (next) => {
    renderCallback(next);

    expect(await screen.findByText("Dashboard destination")).toBeInTheDocument();
    expect(screen.queryByText("Unexpected destination")).not.toBeInTheDocument();
  });
});
