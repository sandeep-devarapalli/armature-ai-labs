import { bookingMailMessage } from "../_shared/booking-mail-message.ts";
import { bookingReviewInbox } from "../_shared/booking-notice.ts";
import { assertJobSecret } from "../_shared/env.ts";

import { errorResponse, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

type Job = {
  id: string;
  aggregate_id: string;
  recipient_id: string;
  created_at: string;
  sequence: number;
  payload: Parameters<typeof bookingMailMessage>[0];
};

Deno.serve(async request => {
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    assertJobSecret(request, "BOOKING_NOTICE_RUNNER_SECRET");
    if (Deno.env.get("BOOKING_NOTICE_DELIVERY_ENABLED") !== "true") {
      return json(request, { status: "disabled" });
    }
    const client = adminClient();
    const input = await request.json();
    if (input.action === "settle") {
      if (!/^[0-9a-f-]{36}$/i.test(input.id) ||
        !["sent", "rejected", "ambiguous"].includes(input.status) ||
        (input.status === "sent" ? !/^[a-z0-9]+$/i.test(input.providerId) : input.providerId !== null)) {
        return json(request, { error: "invalid_settlement" }, 400);
      }
      const settled = await client.rpc("settle_booking_notice", {
        p_id: input.id, p_status: input.status, p_provider_id: input.providerId,
      });
      return json(request, { settled: settled.data === true }, settled.error || settled.data !== true ? 503 : 200);
    }
    if (input.action !== "claim") return json(request, { error: "invalid_action" }, 400);
    const allowlist = Deno.env.get("BOOKING_NOTICE_TEST_RECIPIENT");
    const { data, error } = await client.rpc("claim_booking_notices", { p_limit: 10 });
    if (error || !Array.isArray(data)) return json(request, { error: "claim_failed" }, 503);
    const messages: { id: string; raw: string }[] = [];
    for (const job of data as Job[]) {
      try {
        const { data: account, error: accountError } = await client.auth.admin.getUserById(job.recipient_id);
        const recipient = account?.user?.email;
        if (accountError || !recipient || !account.user.email_confirmed_at ||
          ((job.payload.kind === "golden_application" || job.payload.kind === "venture_application" || job.payload.stage === "approval_required") &&
            recipient.toLowerCase() !== bookingReviewInbox) ||
          (job.payload.kind === "venture" && job.payload.stage === "approved" &&
            !(Date.parse(job.payload.paymentExpiresAt) > Date.now())) ||
          (allowlist && recipient.toLowerCase() !== allowlist.toLowerCase()) ||
          /\.(?:test|invalid|example|localhost)$/i.test(recipient)) throw new Error("Undeliverable recipient");
        let memberName: string | undefined;
        if (job.payload.stage === "confirmed" && ["day", "golden"].includes(job.payload.kind)) {
          const [application, profile] = await Promise.all([
            client.from("basic_onboarding_applications").select("full_name").eq("user_id", job.recipient_id).maybeSingle(),
            client.from("profiles").select("display_name").eq("id", job.recipient_id).maybeSingle(),
          ]);
          memberName = [application.data?.full_name, profile.data?.display_name, account.user.user_metadata?.full_name,
            account.user.user_metadata?.name].find(value => typeof value === "string" && value.trim());
        }
        messages.push({ id: job.id, raw: bookingMailMessage(job.payload, {
          id: job.id, aggregateId: job.aggregate_id, recipient,
          sequence: job.sequence, createdAt: job.created_at, memberName,
        }) });
      } catch {
        const settled = await client.rpc("settle_booking_notice", {
          p_id: job.id, p_status: "rejected", p_provider_id: null,
        });
        if (settled.error || settled.data !== true) console.error("booking_notice_rejection_unsettled");
      }
    }
    return json(request, { messages });
  } catch (error) {
    return errorResponse(request, error);
  }
});
