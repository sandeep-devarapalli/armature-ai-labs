import { createTestHandler, testConfig, TestPaymentError } from "../_shared/razorpay-test.ts";
import { adminClient, authenticatedUser, requireStaff } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

export const handleRazorpayTest = createTestHandler({
  config: () => testConfig(name => Deno.env.get(name)),
  headers: corsHeaders,
  authenticate: async request => {
    try {
      const user = await authenticatedUser(request);
      await requireStaff(user.id, ["admin", "super_admin"]);
      return user.id;
    } catch (error) {
      const status = (error as { status?: number }).status;
      throw new TestPaymentError(status === 403 ? 403 : 401, "admin_authentication_required");
    }
  },
  operation: async (actor, action, input) => {
    const { data, error } = await adminClient().rpc("razorpay_test_operation", {
      p_actor: actor, p_action: action, p_input: input,
    }).abortSignal(AbortSignal.timeout(10000));
    if (error || !data || typeof data !== "object") {
      const status = error?.code === "42501" ? 403 : error?.code === "22023" ? 400 : error?.code === "23505" || error?.code === "40001" ? 409 : 503;
      throw new TestPaymentError(status, "test_ledger_request_rejected");
    }
    return data;
  },
  webhook: async () => { throw new TestPaymentError(405, "method_not_allowed"); },
});

if (import.meta.main) Deno.serve(handleRazorpayTest);
