import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/frontend/e2e",
  testMatch: "resource-feedback.spec.ts",
  outputDir: process.env.FEEDBACK_TEST_OUTPUT || "test-results/resource-feedback",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:4356", trace: "retain-on-failure" },
  webServer: {
    command: "VITE_DEMO_MODE=false VITE_BASIC_ONBOARDING_ENABLED=true VITE_GOOGLE_AUTH_ENABLED=false VITE_MEMBER_PLATFORM_ENABLED=false VITE_COMPONENT_REQUESTS_ENABLED=false VITE_ANALYTICS_ENABLED=false VITE_SUPABASE_URL=https://resource-feedback.invalid VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npx vite build --outDir tmp/feedback-build && npx vite preview --outDir tmp/feedback-build --host 127.0.0.1 --port 4356 --strictPort",
    url: "http://127.0.0.1:4356", reuseExistingServer: false, timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 360, height: 800 } } },
  ],
});
