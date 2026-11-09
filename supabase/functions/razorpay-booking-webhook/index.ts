import { adminClient } from "../_shared/supabase.ts";
import { liveRazorpay, liveWebhookSettings } from "../_shared/live-desk-payment.ts";
import { createLiveDeskWebhook } from "../_shared/live-desk-webhook.ts";

type Kind = "desk" | "rental" | "event";
const ledgers: Record<Kind, string> = { desk: "live_desk_checkout", rental: "rental_checkout", event: "event_checkout" };
async function operate(action: string, input: object, kind: Kind = "desk") {
  const { data, error } = await adminClient().rpc(ledgers[kind], {
    p_action: action, p_member: null, p_input: input,
  }).abortSignal(AbortSignal.timeout(10000));
  if (error || !data) throw new Error("Webhook reconciliation could not be recorded");
  return data;
}

export const handleWebhook = createLiveDeskWebhook({
  config: () => liveWebhookSettings(liveRazorpay()),
  // Each gate stays closed until its RPC is deployed; an order must match exactly one ledger.
  lookup: async orderId => {
    const kinds: Kind[] = ["desk"];
    if (Deno.env.get("LIVE_RENTAL_WEBHOOK_ENABLED") === "true") kinds.push("rental");
    if (Deno.env.get("LIVE_EVENT_WEBHOOK_ENABLED") === "true") kinds.push("event");
    const found = [];
    for (const kind of kinds) {
      const quote = await operate("lookup_order", { orderId }, kind);
      if (quote.status !== "ignored") found.push({ ...quote, checkout_kind: kind });
    }
    if (found.length > 1) throw new Error("Ambiguous payment order");
    return found[0] ?? null;
  },
  apply: (action, input, quote) => {
    if (!quote.checkout_kind || !Object.hasOwn(ledgers, quote.checkout_kind)) throw new Error("Unknown payment order type");
    return operate(action, input, quote.checkout_kind);
  },
});

if (import.meta.main) Deno.serve(handleWebhook);
