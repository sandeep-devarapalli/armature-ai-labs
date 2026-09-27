import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  timeout: 90_000,
  outputDir: "test-results-inventory-local",
  testDir: "./tests/frontend/e2e",
  testMatch: "booking-inventory-local.spec.ts",
  workers: 1,
  use: { baseURL: process.env.ARMATURE_LOCAL_BOOKING_BASE_URL ?? "http://127.0.0.1:4342", serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } }
  ]
});
