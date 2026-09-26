import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/frontend/e2e", testMatch: "onboarding-local.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:4341", reducedMotion: "reduce" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
