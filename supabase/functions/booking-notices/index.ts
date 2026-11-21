import { bookingMailMessage } from "../_shared/booking-mail-message.ts";
import { assertJobSecret } from "../_shared/env.ts";
import { bookingMailToken } from "../_shared/google.ts";
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
    assertJobSecret(request);
    if (Deno.env.get("BOOKING_NOTICE_DELIVERY_ENABLED") !== "true") {
      return json(request, { status: "disabled" });
    }
    // Authenticate before claiming. OAuth configuration failures leave the queue intact.
    let token: string;
    try {
      token = await bookingMailToken();
    } catch {
      return json(request, { error: "booking_mail_auth_unavailable" }, 503);
    }
    const client = adminClient();
    const { data, error } = await client.rpc("claim_booking_notices", { p_limit: 10 });
    if (error || !Array.isArray(data)) return json(request, { error: "claim_failed" }, 503);
    const counts = { sent: 0, rejected: 0, ambiguous: 0, unsettled: 0 };
    for (const job of data as Job[]) {
      let status: "sent" | "rejected" | "ambiguous" = "rejected";
      let providerId: string | null = null;
      try {
        const { data: account, error: accountError } = await client.auth.admin.getUserById(job.recipient_id);
        const recipient = account?.user?.email;
        if (accountError || !recipient || !account.user.email_confirmed_at ||
          /\.(?:test|invalid|example|localhost)$/i.test(recipient)) throw new Error("Undeliverable recipient");

        const raw = bookingMailMessage(job.payload, {
          id: job.id, aggregateId: job.aggregate_id, recipient,
          sequence: job.sequence, createdAt: job.created_at,
        });
        // A timeout or unexpected response may occur after Google accepted the message.
        status = "ambiguous";
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(12_000),
        });
        if (response.ok) {
          const result = await response.json();
          if (typeof result.id === "string" && /^[a-z0-9]+$/i.test(result.id)) {
            providerId = result.id;
            status = "sent";
          }
        } else if ([400, 401, 403, 404, 413, 429].includes(response.status)) {
          status = "rejected";
        }
      } catch { /* Settle the state reached without logging recipient or provider payload. */ }
      const settled = await client.rpc("settle_booking_notice", { p_id: job.id, p_status: status, p_provider_id: providerId });
      if (settled.error || settled.data !== true) counts.unsettled++;
      else counts[status]++;
    }
    return json(request, counts, counts.unsettled || counts.rejected || counts.ambiguous ? 503 : 200);
  } catch (error) {
    return errorResponse(request, error);
  }
});
