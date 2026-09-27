import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  timeout: 60_000,
  outputDir: "test-results-team-local",
  testDir: "./tests/frontend/e2e", testMatch: "team-membership-local.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:4342", serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } }
  ]
});
