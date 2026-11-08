import { adminClient } from "../_shared/supabase.ts";
import { liveRazorpay, liveWebhookSettings } from "../_shared/live-desk-payment.ts";
import { createLiveDeskWebhook } from "../_shared/live-desk-webhook.ts";

async function operate(action: string, input: object, kind: "desk" | "rental" = "desk") {
  const { data, error } = await adminClient().rpc(kind === "desk" ? "live_desk_checkout" : "rental_checkout", {
    p_action: action, p_member: null, p_input: input,
  }).abortSignal(AbortSignal.timeout(10000));
  if (error || !data) throw new Error("Webhook reconciliation could not be recorded");
  return data;
}

export const handleWebhook = createLiveDeskWebhook({
  config: () => liveWebhookSettings(liveRazorpay()),
  lookup: async orderId => {
    const desk = await operate("lookup_order", { orderId });
    if (Deno.env.get("LIVE_RENTAL_WEBHOOK_ENABLED") !== "true") return desk.status === "ignored" ? null : { ...desk, checkout_kind: "desk" };
    const rental = await operate("lookup_order", { orderId }, "rental");
    if (desk.status !== "ignored" && rental.status !== "ignored") throw new Error("Ambiguous payment order");
    return desk.status !== "ignored" ? { ...desk, checkout_kind: "desk" }
      : rental.status !== "ignored" ? { ...rental, checkout_kind: "rental" } : null;
  },
  apply: (action, input, quote) => {
    if (quote.checkout_kind !== "desk" && quote.checkout_kind !== "rental") throw new Error("Unknown payment order type");
    return operate(action, input, quote.checkout_kind);
  },
});

if (import.meta.main) Deno.serve(handleWebhook);
