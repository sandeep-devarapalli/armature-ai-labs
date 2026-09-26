import { afterEach, expect, it, vi } from "vitest";

const envModule = "../../supabase/functions/_shared/env.ts";

afterEach(() => vi.unstubAllGlobals());

it("isolates retention credentials from booking credentials without fallback", async () => {
  vi.stubGlobal("Deno", { env: { get: (name: string) => ({
    ARMATURE_JOB_SECRET: "booking-only", ONBOARDING_RETENTION_JOB_SECRET: "retention-only",
  } as Record<string, string>)[name] } });
  const { assertJobSecret } = await import(envModule);
  const request = (value: string) => new Request("https://example.test", { headers: { "x-armature-job-secret": value } });
  for (const invalid of ["", "booking-only", "retention-only-extra"]) {
    expect(() => assertJobSecret(request(invalid), "ONBOARDING_RETENTION_JOB_SECRET")).toThrow();
  }
  expect(() => assertJobSecret(request("retention-only"), "ONBOARDING_RETENTION_JOB_SECRET")).not.toThrow();
  expect(() => assertJobSecret(request("retention-only"))).toThrow();
  expect(() => assertJobSecret(request("booking-only"))).not.toThrow();
});

it("fails closed if the dedicated credential is absent", async () => {
  vi.stubGlobal("Deno", { env: { get: (name: string) => name === "ARMATURE_JOB_SECRET" ? "booking-only" : undefined } });
  const { assertJobSecret } = await import(envModule);
  expect(() => assertJobSecret(new Request("https://example.test"), "ONBOARDING_RETENTION_JOB_SECRET")).toThrow("Missing required environment variable");
});
