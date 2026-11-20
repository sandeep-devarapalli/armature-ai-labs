import { applyGoldenPayment, operateGoldenPass } from "../_shared/golden-pass-checkout.ts";
import { createLiveDeskWebhook } from "../_shared/live-desk-webhook.ts";
import { rentalProvider } from "../_shared/rental-payment.ts";

const handler = createLiveDeskWebhook({
  config: () => {
    const provider = rentalProvider("test");
    const secret = Deno.env.get("GOLDEN_TEST_RAZORPAY_WEBHOOK_SECRET") ?? "";
    const accountId = Deno.env.get("GOLDEN_TEST_RAZORPAY_ACCOUNT_ID") ?? "";
    if (!provider || secret.length < 32 || secret === provider.keySecret || !/^acc_[A-Za-z0-9]{1,80}$/.test(accountId)) return null;
    return { provider, secret, accountId };
  },
  lookup: async orderId => {
    const row = await operateGoldenPass("lookup_order", null, { orderId });
    if (row.status === "ignored") return null;
    if (!row.id || !row.order_id) throw new Error("Golden Pass order is unbound");
    return { ...row, id: row.id, order_id: row.order_id, checkout_kind: "golden" };
  },
  apply: (action, input, _quote, confirmedAt) => applyGoldenPayment(operateGoldenPass, action, input, confirmedAt),
});
Deno.serve(handler);
