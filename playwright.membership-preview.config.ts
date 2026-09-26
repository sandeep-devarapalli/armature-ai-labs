import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/frontend/e2e",
  testMatch: "membership-preview.spec.ts",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:4340", trace: "retain-on-failure", reducedMotion: "reduce" },
  webServer: {
    command: "VITE_DEMO_MODE=true npm run dev -- --host 127.0.0.1 --port 4340 --strictPort",
    url: "http://127.0.0.1:4340",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
