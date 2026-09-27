import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthCallbackPage, AuthPage } from "../../src/pages/AuthPages";

const { mockGetSession, mockSignInGoogle, mockRequestOtp, gate } = vi.hoisted(() => ({
  gate: { basic: false },
  mockSignInGoogle: vi.fn(),
  mockRequestOtp: vi.fn(),
  mockGetSession: vi.fn()
}));

vi.mock("../../src/config/release", () => ({ get basicOnboardingAvailable() { return gate.basic; }, memberPlatformAvailable: false }));

vi.mock("../../src/lib/supabase", () => ({
  googleAuthEnabled: true,
  supabase: {
    auth: {
      getSession: mockGetSession
    }
  }
}));

vi.mock("../../src/context/AppContext", () => ({
  useApp: () => ({ currentMember: null, mode: "supabase", signInGoogle: mockSignInGoogle, requestOtp: mockRequestOtp })
}));

function renderCallback(next: string, suffix = "") {
  const query = new URLSearchParams({ next }).toString();
  render(
    <MemoryRouter initialEntries={[`/auth/callback?${query}${suffix}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/join" element={<div>Join destination</div>} />
        <Route path="/onboarding" element={<div>Onboarding destination</div>} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
        <Route path="*" element={<div>Unexpected destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("auth callback return path", () => {
  beforeEach(() => {
    gate.basic = false;
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

  it("keeps basic-only sign-in out of paid workspaces", async () => {
    gate.basic = true;
    renderCallback("/book");
    expect(await screen.findByText("Onboarding destination")).toBeInTheDocument();
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


describe("auth callback failures", () => {
  beforeEach(() => {
    gate.basic = false;
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "previous-account" } } }, error: null });
  });

  it.each([
    "&error=access_denied",
    "#error=access_denied&error_description=Untrusted+provider+text",
    "&error_code=otp_expired",
    "#error_description=Expired+link"
  ])("does not use an existing session after callback failure %s", async (suffix) => {
    renderCallback("/join", suffix);
    expect(await screen.findByText("Sign-in was not completed. Please return to sign in and try again.")).toBeInTheDocument();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(screen.queryByText("Join destination")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute("href", "/auth");
  });

  it("offers recovery when no session is returned", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    renderCallback("/join");
    expect(await screen.findByText("No active session was returned.")).toBeInTheDocument();
  });

  it("handles a rejected session request", async () => {
    mockGetSession.mockRejectedValue(new Error("Connection failed"));
    renderCallback("/join");
    expect(await screen.findByText("We could not finish sign-in. Please return to sign in and try again.")).toBeInTheDocument();
  });
});

describe("sign-in submission guard", () => {
  beforeEach(() => {
    gate.basic = true;
    mockSignInGoogle.mockReset();
    mockRequestOtp.mockReset();
  });

  it("blocks competing requests while Google sign-in is pending and recovers on failure", async () => {
    let reject!: (reason: Error) => void;
    mockSignInGoogle.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    const google = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(google);
    expect(google).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    fireEvent.click(google);
    expect(mockSignInGoogle).toHaveBeenCalledExactlyOnceWith("/onboarding");
    await act(async () => reject(new Error("Google is unavailable")));
    expect(screen.getByRole("alert")).toHaveTextContent("Google is unavailable");
    expect(google).toBeEnabled();
    mockSignInGoogle.mockResolvedValue(undefined);
    fireEvent.click(google);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => {});
  });

  it("blocks Google while an email request is pending", async () => {
    let resolve!: () => void;
    mockRequestOtp.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "member@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a secure link" }));
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    expect(mockRequestOtp).toHaveBeenCalledExactlyOnceWith("member@example.com", "/onboarding");
    await act(async () => resolve());
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });
});
