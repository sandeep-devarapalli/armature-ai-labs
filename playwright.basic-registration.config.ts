import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/basic-registration",
  use: { baseURL: "http://127.0.0.1:4352", trace: "retain-on-failure" },
  webServer: {
    command: "VITE_DEMO_MODE=false VITE_BASIC_ONBOARDING_ENABLED=true VITE_MEMBER_PLATFORM_ENABLED=false VITE_COMPONENT_REQUESTS_ENABLED=false VITE_SUPABASE_URL=https://reserved.invalid VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npm run dev -- --host 127.0.0.1 --port 4352 --strictPort",
    url: "http://127.0.0.1:4352", reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
