import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({ adminClient: () => state.client }));
vi.mock("../../supabase/functions/_shared/env.ts", () => ({ assertJobSecret: vi.fn() }));

let handler: (request: Request) => Promise<Response>;
let rpc: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => name === "ONBOARDING_RETENTION_ENABLED" ? "true" : undefined },
    serve: (value: typeof handler) => { handler = value; },
  });
  rpc = vi.fn(async (name: string) => ({ data: name === "onboarding_id_retention_sla" ? { overdue: 0 } : name === "list_due_onboarding_documents" ? [] : null, error: null }));
  remove = vi.fn(async () => ({ error: null }));
  const empty = { select: () => empty, lte: () => empty, order: () => empty, limit: async () => ({ data: [], error: null }) };
  state.client = { rpc, storage: { from: () => ({ remove }) }, from: () => empty };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function run() {
  const workerModule = "../../supabase/functions/onboarding-retention/index";
  await import(workerModule);
  return handler(new Request("https://example.test/onboarding-retention", { method: "POST" }));
}

it("preserves existing count contract and fails the monitored job when a24hour violation is observed", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockImplementation(async (name: string) => ({ data: name === "onboarding_id_retention_sla" ? { overdue: 2 } : name === "list_due_onboarding_documents" ? [{ id: "private-id", object_path: "private-path" }] : null, error: null }));
  const response = await run();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ examined: 1, deleted: 1, failed: 0 });
  expect(remove).toHaveBeenCalledWith(["private-path"]);
  expect(error).toHaveBeenCalledWith(JSON.stringify({ event: "onboarding_government_id_retention_overdue", count: 2 }));
  expect(JSON.stringify(error.mock.calls)).not.toMatch(/private-id|private-path/);
});

it("does not mark or count failed storage deletion as successful", async () => {
  rpc.mockImplementation(async (name: string) => ({ data: name === "onboarding_id_retention_sla" ? { overdue: 0 } : name === "list_due_onboarding_documents" ? [{ id: "synthetic-id", object_path: "synthetic-path" }] : null, error: null }));
  remove.mockResolvedValue({ error: { message: "storage unavailable" } });
  const response = await run();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ examined: 1, deleted: 0, failed: 1 });
  expect(rpc.mock.calls.map(call => call[0])).not.toContain("mark_onboarding_document_deleted");
});

it("fails closed on unavailable deadline accounting and recovers to the normal healthy response", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "not available" } });
  expect((await run()).status).toBe(500);
  expect(remove).not.toHaveBeenCalled();
  const recovered = await handler(new Request("https://example.test/onboarding-retention", { method: "POST" }));
  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toEqual({ examined: 0, deleted: 0, failed: 0 });
});
