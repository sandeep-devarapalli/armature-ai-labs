import { adminClient } from "../_shared/supabase.ts";
import { liveRazorpay, liveWebhookSettings } from "../_shared/live-desk-payment.ts";
import { createLiveDeskWebhook } from "../_shared/live-desk-webhook.ts";

async function operate(action: string, input: object) {
  const { data, error } = await adminClient().rpc("live_desk_checkout", {
    p_action: action, p_member: null, p_input: input,
  }).abortSignal(AbortSignal.timeout(10000));
  if (error || !data) throw new Error("Webhook reconciliation could not be recorded");
  return data;
}

export const handleWebhook = createLiveDeskWebhook({
  config: () => liveWebhookSettings(liveRazorpay()),
  lookup: async orderId => {
    const result = await operate("lookup_order", { orderId });
    return result.status === "ignored" ? null : result;
  },
  apply: operate,
});

if (import.meta.main) Deno.serve(handleWebhook);
