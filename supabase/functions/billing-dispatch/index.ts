import { assertJobSecret } from "../_shared/env.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import { runBillingDispatch } from "../_shared/refrens.ts";
import { adminClient } from "../_shared/supabase.ts";

// Scheduled job only. Sends nothing unless REFRENS_INVOICING_ENABLED and billing_settings.invoicing_enabled are both on.
Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.", "method_not_allowed");
    assertJobSecret(request);
    const client = adminClient();
    const rpc = async (action: string, input: object) => {
      const { data, error } = await client.rpc("billing_dispatch", { p_action: action, p_input: input });
      if (error || !data) throw new HttpError(503, "Billing ledger unavailable.", "billing_ledger_unavailable");
      return data as Record<string, unknown>;
    };
    return json(request, await runBillingDispatch(name => Deno.env.get(name), rpc));
  } catch (error) {
    return errorResponse(request, error);
  }
});
