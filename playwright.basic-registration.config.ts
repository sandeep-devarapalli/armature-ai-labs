import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4352";

export default defineConfig({
  testDir: "./tests/basic-registration",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: process.env.PLAYWRIGHT_PREBUILT === "true"
      ? "npx vite preview --host 127.0.0.1 --port 4352 --strictPort"
      : "VITE_DEMO_MODE=false VITE_BASIC_ONBOARDING_ENABLED=true VITE_GOOGLE_AUTH_ENABLED=true VITE_MEMBER_PLATFORM_ENABLED=false VITE_COMPONENT_REQUESTS_ENABLED=false VITE_SUPABASE_URL=https://reserved.invalid VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npx vite build --outDir dist-basic-registration && npx vite preview --outDir dist-basic-registration --host 127.0.0.1 --port 4352 --strictPort",
    url: baseURL, reuseExistingServer: false, timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
