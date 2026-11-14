// @vitest-environment node
// Edge functions run in Deno, a single-realm runtime; jsdom globals here break undici body parsing on Node 26.
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), dependencies: null as null | {
  lookup: (order: string) => Promise<{ checkout_kind: string } | null>;
  apply: (action: string, input: object, quote: { checkout_kind?: string }) => Promise<unknown>;
} }));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({ adminClient: () => ({ rpc: mock.rpc }) }));
vi.mock("../../supabase/functions/_shared/live-desk-webhook.ts", () => ({ createLiveDeskWebhook: (deps: typeof mock.dependencies) => { mock.dependencies = deps; return vi.fn(); } }));
import "../../supabase/functions/razorpay-booking-webhook/index";
let enabled = false;
beforeEach(() => { mock.rpc.mockReset(); enabled = false; vi.stubGlobal("Deno", { env: { get: () => String(enabled) } }); });
it("does not query an undeployed rental RPC while the rental webhook gate is closed", async () => {
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: null, data: { id: "desk", status: "confirmed" } }) }));
  expect(await mock.dependencies!.lookup("order_Desk")).toMatchObject({ id: "desk", checkout_kind: "desk" });
  expect(mock.rpc.mock.calls.map(([rpc]) => rpc)).toEqual(["live_desk_checkout"]);
});
it("routes only a known rental order to the rental ledger", async () => {
  enabled = true;
  mock.rpc.mockImplementation(rpc => ({ abortSignal: async () => ({ error: null, data:
    rpc === "rental_checkout" ? { id: "rental", status: "approved" } : { status: "ignored" } }) }));
  const quote = await mock.dependencies!.lookup("order_Rental");
  expect(quote).toMatchObject({ checkout_kind: "rental" });
  await mock.dependencies!.apply("capture", { orderId: "order_Rental" }, quote!);
  expect(mock.rpc).toHaveBeenLastCalledWith("rental_checkout", expect.objectContaining({ p_action: "capture", p_member: null }));
});
it("routes only a known event order to the event ledger", async () => {
  enabled = true;
  mock.rpc.mockImplementation(rpc => ({ abortSignal: async () => ({ error: null, data:
    rpc === "event_checkout" ? { id: "event", status: "approved" } : { status: "ignored" } }) }));
  const quote = await mock.dependencies!.lookup("order_Event");
  expect(quote).toMatchObject({ id: "event", checkout_kind: "event" });
  await mock.dependencies!.apply("capture", { orderId: "order_Event" }, quote!);
  expect(mock.rpc).toHaveBeenLastCalledWith("event_checkout", expect.objectContaining({ p_action: "capture", p_member: null }));
});
it("does not query the event RPC while its webhook gate is closed", async () => {
  vi.stubGlobal("Deno", { env: { get: (key: string) => String(key === "LIVE_RENTAL_WEBHOOK_ENABLED") } });
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: null, data: { status: "ignored" } }) }));
  expect(await mock.dependencies!.lookup("order_Unknown")).toBeNull();
  expect(mock.rpc.mock.calls.map(([rpc]) => rpc)).toEqual(["live_desk_checkout", "rental_checkout"]);
});
it("rejects order collisions rather than applying one ledger arbitrarily", async () => {
  enabled = true;
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: null, data: { id: "ambiguous", status: "approved" } }) }));
  await expect(mock.dependencies!.lookup("order_Duplicate")).rejects.toThrow("Ambiguous");
});
it("does not interpret a transient desk lookup error as a rental order", async () => {
  enabled = true;
  mock.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: { code: "timeout" }, data: null }) }));
  await expect(mock.dependencies!.lookup("order_Unknown")).rejects.toThrow("reconciliation");
  expect(mock.rpc).toHaveBeenCalledTimes(1);
});
it("rejects application without a positively identified ledger", async () => {
  expect(() => mock.dependencies!.apply("capture", {}, {})).toThrow("Unknown");
  expect(() => mock.dependencies!.apply("capture", {}, { checkout_kind: "constructor" })).toThrow("Unknown");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("routes only a known sale order to the sale ledger, renaming the record id", async () => {
  enabled = true;
  mock.rpc.mockImplementation(rpc => ({ abortSignal: async () => ({ error: null, data:
    rpc === "equipment_sale" ? { id: "sale", status: "awaiting_payment" } : { status: "ignored" } }) }));
  const quote = await mock.dependencies!.lookup("order_Sale");
  expect(quote).toMatchObject({ id: "sale", checkout_kind: "sale" });
  await mock.dependencies!.apply("capture", { quoteId: "sale", orderId: "order_Sale" }, quote!);
  expect(mock.rpc).toHaveBeenLastCalledWith("equipment_sale", { p_action: "capture", p_member: null, p_input: { saleId: "sale", orderId: "order_Sale" } });
});
