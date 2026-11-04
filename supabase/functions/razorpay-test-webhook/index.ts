import { createTestWebhookHandler, testConfig, TestPaymentError } from "../_shared/razorpay-test.ts";
import { adminClient } from "../_shared/supabase.ts";

export const handleRazorpayTestWebhook = createTestWebhookHandler({
  config: () => testConfig(name => Deno.env.get(name)),
  authenticate: async () => { throw new TestPaymentError(405, "method_not_allowed"); },
  operation: async () => { throw new TestPaymentError(405, "method_not_allowed"); },
  webhook: async (eventId, hash, event, payment, refund) => {
    const { data, error } = await adminClient().rpc("razorpay_test_webhook", {
      p_eventid: eventId, p_hash: hash, p_event: event, p_payment: payment, p_refund: refund,
    }).abortSignal(AbortSignal.timeout(10000));
    if (error) throw new TestPaymentError(error.code === "22023" ? 400 : 503, "test_webhook_not_recorded");
    return data;
  },
});

if (import.meta.main) Deno.serve(handleRazorpayTestWebhook);
