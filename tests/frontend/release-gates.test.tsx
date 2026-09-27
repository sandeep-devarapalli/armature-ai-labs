import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReleaseGate, RouteFailurePage } from "../../src/components/OpeningSoonPage";

describe("public-first release gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("shows the shared opening-soon page when a feature is disabled", () => {
    render(
      <MemoryRouter>
        <ReleaseGate enabled={false}>
          <div>Operational controls</div>
        </ReleaseGate>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Operational access is opening soon." })).toBeInTheDocument();
    expect(screen.queryByText("Operational controls")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore projects/ })).toHaveAttribute("href", "/projects");
  });

  it("renders operational content only when its feature is enabled", () => {
    render(
      <MemoryRouter>
        <ReleaseGate enabled>
          <div>Operational controls</div>
        </ReleaseGate>
      </MemoryRouter>
    );

    expect(screen.getByText("Operational controls")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Operational access is opening soon." })).not.toBeInTheDocument();
  });

  it("shows a production-safe recovery screen for route failures", () => {
    render(
      <MemoryRouter>
        <RouteFailurePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "This page did not load." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload page/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to the lab" })).toHaveAttribute("href", "/");
  });

  it("does not infer demo mode from missing Supabase configuration", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

    const backend = await import("../../src/lib/supabase");

    expect(backend.dataMode).toBe("supabase");
    expect(backend.isSupabaseConfigured).toBe(false);
    expect(backend.isBackendAvailable).toBe(false);
    expect(backend.supabase).toBeNull();
  });

  it("enables local demo behavior only through the explicit flag", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");

    const backend = await import("../../src/lib/supabase");

    expect(backend.dataMode).toBe("demo");
    expect(backend.demoModeEnabled).toBe(true);
    expect(backend.isBackendAvailable).toBe(true);
    expect(backend.supabase).toBeNull();
  });

  it("does not initialize a backend client while prerendering a configured production build", async () => {
    vi.stubEnv("SSR", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_SUPABASE_URL", "https://reserved.invalid");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    vi.stubEnv("VITE_MEMBER_PLATFORM_ENABLED", "false");
    vi.stubEnv("VITE_COMPONENT_REQUESTS_ENABLED", "false");
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const backend = await import("../../src/lib/supabase");
      const release = await import("../../src/config/release");
      expect(backend.isSupabaseConfigured).toBe(true);
      expect(backend.isBackendAvailable).toBe(true);
      expect(backend.supabase).toBeNull();
      expect(release.memberPlatformAvailable).toBe(false);
      expect(release.componentRequestsAvailable).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("requires an explicit configured basic-onboarding gate without enabling paid access", async () => {
    vi.stubEnv("SSR", true);
    vi.stubEnv("VITE_DEMO_MODE", "false");
    vi.stubEnv("VITE_SUPABASE_URL", "https://reserved.invalid");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    vi.stubEnv("VITE_MEMBER_PLATFORM_ENABLED", "false");
    vi.stubEnv("VITE_BASIC_ONBOARDING_ENABLED", "true");
    const release = await import("../../src/config/release");
    expect(release.basicOnboardingAvailable).toBe(true);
    expect(release.memberPlatformAvailable).toBe(false);
    vi.stubEnv("VITE_BASIC_ONBOARDING_ENABLED", "false");
    vi.resetModules();
    expect((await import("../../src/config/release")).basicOnboardingAvailable).toBe(false);
  });

  it("keeps both production feature gates opt-in", async () => {
    vi.stubEnv("VITE_MEMBER_PLATFORM_ENABLED", "");
    vi.stubEnv("VITE_COMPONENT_REQUESTS_ENABLED", "");

    const release = await import("../../src/config/release");

    expect(release.equipmentPageAvailable).toBe(false);
    expect(release.memberPlatformEnabled).toBe(false);
    expect(release.componentRequestsEnabled).toBe(false);
  });

  it("fails closed when feature flags are enabled without a backend", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    vi.stubEnv("VITE_MEMBER_PLATFORM_ENABLED", "true");
    vi.stubEnv("VITE_COMPONENT_REQUESTS_ENABLED", "true");

    const release = await import("../../src/config/release");

    expect(release.memberPlatformEnabled).toBe(true);
    expect(release.componentRequestsEnabled).toBe(true);
    expect(release.memberPlatformAvailable).toBe(false);
    expect(release.componentRequestsAvailable).toBe(false);
  });

  it("opens operational gates in explicit local demo mode", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_MEMBER_PLATFORM_ENABLED", "");
    vi.stubEnv("VITE_COMPONENT_REQUESTS_ENABLED", "");

    const release = await import("../../src/config/release");

    expect(release.memberPlatformEnabled).toBe(false);
    expect(release.componentRequestsEnabled).toBe(false);
    expect(release.memberPlatformAvailable).toBe(true);
    expect(release.componentRequestsAvailable).toBe(true);
  });
});
