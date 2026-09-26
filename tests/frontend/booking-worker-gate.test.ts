import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(() => { throw new Error("database reached"); }),
  assertJobSecret: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => mocks);
vi.mock("../../supabase/functions/_shared/env.ts", () => mocks);
vi.mock("../../supabase/functions/_shared/google.ts", () => ({}));
vi.mock("../../supabase/functions/_shared/google-mail.ts", () => ({}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules(); });

for (const worker of ["calendar-sync", "retry-reminders"]) {
  for (const setting of [undefined, "false", "TRUE", "true"]) {
    it(`${worker} only reaches its database with explicit true (setting ${setting})`, async () => {
      let handler!: (request: Request) => Promise<Response>;
      vi.stubGlobal("Deno", {
        env: { get: (key: string) => key === "BOOKING_WORKERS_ENABLED" ? setting : undefined },
        serve: (callback: typeof handler) => { handler = callback; },
      });
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await import(`../../supabase/functions/${worker}/index.ts`);
      const response = await handler(new Request("https://example.com", { method: "POST" }));
      expect(mocks.assertJobSecret).toHaveBeenCalledOnce();
      if (setting === "true") {
        expect(mocks.adminClient).toHaveBeenCalledOnce();
        expect(response.status).toBe(500);
      } else {
        expect(await response.json()).toEqual({ status: "disabled", claimed: 0 });
        expect(mocks.adminClient).not.toHaveBeenCalled();
      }
      expect(fetch).not.toHaveBeenCalled();
    });
  }
}
