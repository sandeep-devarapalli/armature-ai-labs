import { adminClient } from "../_shared/supabase.ts";
import { rentalProvider } from "../_shared/rental-payment.ts";
import { createLiveDeskWebhook } from "../_shared/live-desk-webhook.ts";

async function operate(action: string, input: object) {
  const { data, error } = await adminClient().rpc("rental_checkout", { p_action: action, p_member: null, p_input: input })
    .abortSignal(AbortSignal.timeout(10000));
  if (error || !data) throw new Error("Test rental reconciliation unavailable");
  return data;
}
export const handleWebhook = createLiveDeskWebhook({
  config: () => {
    const provider = rentalProvider("test");
    const secret = Deno.env.get("RENTAL_TEST_WEBHOOK_SECRET") ?? "";
    const accountId = Deno.env.get("RENTAL_TEST_ACCOUNT_ID") ?? "";
    if (!provider || Deno.env.get("RENTAL_TEST_WEBHOOK_ENABLED") !== "true" || secret.length < 32
      || secret === provider.keySecret || !/^acc_[A-Za-z0-9]{1,80}$/.test(accountId)) return null;
    return { provider, secret, accountId };
  },
  lookup: async orderId => {
    const quote = await operate("lookup_order", { orderId });
    return quote.status === "ignored" ? null : quote;
  },
  apply: operate,
});
if (import.meta.main) Deno.serve(handleWebhook);
