import { createVentureWebhook } from "../_shared/venture-pass-payment.ts";

Deno.serve(createVentureWebhook());
