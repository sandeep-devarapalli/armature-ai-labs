import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const valid = {
  VITE_SUPABASE_URL: "https://production-test.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  VITE_TURNSTILE_SITE_KEY: "0x4AAAAAAAAAAAAAAAAAAAAAAA",
  VITE_SITE_URL: "https://armatureailabs.com",
  VITE_BASIC_ONBOARDING_ENABLED: "true",
  VITE_GOOGLE_AUTH_ENABLED: "true",
  VITE_MEMBER_PLATFORM_ENABLED: "false",
  VITE_COMPONENT_REQUESTS_ENABLED: "false",
};
const check = (overrides = {}) => spawnSync(process.execPath, ["scripts/assert-production-env.mjs"], { env: { ...valid, ...overrides }, encoding: "utf8" });

test("accepts explicit production-shaped public configuration", () => {
  assert.equal(check().status, 0);
});

test("requires a non-test Turnstile site key", () => {
  for (const value of ["", " ", "1x00000000000000000000AA", "2x00000000000000000000AB", "3x00000000000000000000FF", "your-site-key", "synthetic-site-key"]) {
    assert.notEqual(check({ VITE_TURNSTILE_SITE_KEY: value }).status, 0);
  }
});

test("rejects local and fixture backends", () => {
  for (const value of ["http://127.0.0.1:55443", "https://ecosystem-fixture.invalid", "http://production-test.supabase.co", "https://production-test.supabase.co.example.com"]) {
    assert.notEqual(check({ VITE_SUPABASE_URL: value }).status, 0);
  }
});

test("preserves demo and site release guards", () => {
  assert.notEqual(check({ VITE_DEMO_MODE: "true" }).status, 0);
  assert.notEqual(check({ VITE_SITE_URL: "http://localhost:4173" }).status, 0);
  assert.notEqual(check({ VITE_MEMBER_PLATFORM_ENABLED: "" }).status, 0);
});


test("requires the exact approved proxy for enabled production analytics", () => {
  const analytics = { VITE_ANALYTICS_ENABLED: "true", VITE_POSTHOG_KEY: "phc_synthetic_test", VITE_POSTHOG_HOST: "https://z.armatureailabs.com" };
  assert.equal(check(analytics).status, 0);
  for (const host of ["https://us.i.posthog.com", "http://z.armatureailabs.com", "https://z.armatureailabs.com.evil.test", ""]) {
    assert.notEqual(check({ ...analytics, VITE_POSTHOG_HOST: host }).status, 0);
  }
  assert.notEqual(check({ ...analytics, VITE_POSTHOG_KEY: "" }).status, 0);
});
