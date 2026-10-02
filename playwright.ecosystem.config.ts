import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.ECOSYSTEM_TEST_BASE_URL || "http://127.0.0.1:4353";

export default defineConfig({
  testDir: "./tests/frontend/e2e",
  testMatch: "ecosystem-contributions.spec.ts",
  use: { baseURL, serviceWorkers: "block", trace: "retain-on-failure" },
  webServer: process.env.ECOSYSTEM_TEST_BASE_URL ? undefined : {
    command: "VITE_DEMO_MODE=false VITE_BASIC_ONBOARDING_ENABLED=true VITE_GOOGLE_AUTH_ENABLED=false VITE_MEMBER_PLATFORM_ENABLED=false VITE_COMPONENT_REQUESTS_ENABLED=false VITE_ANALYTICS_ENABLED=false VITE_SUPABASE_URL=https://ecosystem-fixture.invalid VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npx vite build --outDir dist-ecosystem && npx vite preview --outDir dist-ecosystem --host 127.0.0.1 --port 4353 --strictPort",
    url: baseURL, reuseExistingServer: false, timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 360, height: 800 } } },
  ],
});
