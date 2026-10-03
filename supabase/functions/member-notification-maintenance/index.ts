import { adminClient } from "../_shared/supabase.ts";
import { assertJobSecret } from "../_shared/env.ts";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("MEMBER_NOTIFICATIONS_MAINTENANCE_ENABLED") !== "true") return reply({ error: "maintenance_disabled" }, 503);
  const secret = Deno.env.get("MEMBER_NOTIFICATIONS_MAINTENANCE_SECRET") ?? "";
  if (secret.length < 32 || secret.length > 256) return reply({ error: "maintenance_unconfigured" }, 503);
  if ((request.headers.get("x-armature-job-secret") ?? "").length > 256) return reply({ error: "unauthorised" }, 401);
  try { assertJobSecret(request, "MEMBER_NOTIFICATIONS_MAINTENANCE_SECRET"); }
  catch { return reply({ error: "unauthorised_or_unconfigured" }, 401); }
  // No request data controls deletion, recipients, endpoints or batch size.
  if (request.body) {
    const reader = request.body.getReader();
    let expired = false;
    const timer = setTimeout(() => { expired = true; void reader.cancel(); }, 2_000);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (expired) return reply({ error: "request_timeout" }, 408);
        if (value?.byteLength) return reply({ error: "body_not_allowed" }, 400);
        if (done) break;
      }
    } catch { return reply({ error: "invalid_request" }, 400); }
    finally { clearTimeout(timer); void reader.cancel(); }
  }
  try {
    const client = adminClient();
    const cleanup = await client.rpc("maintain_member_notifications", { p_dry_run: Deno.env.get("MEMBER_NOTIFICATIONS_CLEANUP_APPLY") !== "true", p_limit: 100 }).abortSignal(AbortSignal.timeout(10_000));
    if (cleanup.error) throw new Error("cleanup_failed");
    const health = await client.rpc("notification_delivery_health").abortSignal(AbortSignal.timeout(10_000));
    if (health.error) throw new Error("health_failed");
    const snapshot = health.data;
    const attention = Boolean(snapshot.cleanup_overdue || snapshot.queue_overdue || snapshot.expired_leases || snapshot.unknown || snapshot.failed || snapshot.delivery_unconfirmed || snapshot.unmatched_receipts || snapshot.atlas_queue_overdue || snapshot.atlas_expired_leases || snapshot.atlas_unknown || snapshot.atlas_failed || snapshot.atlas_delivery_failed || snapshot.atlas_delivery_unconfirmed || (!cleanup.data.dry_run && cleanup.data.remaining));
    console.log(JSON.stringify({ severity: attention ? "WARNING" : "INFO", event: "member_notification_health", attention, cleanup: cleanup.data, health: snapshot }));
    return reply({ attention, cleanup: cleanup.data, health: snapshot });
  } catch {
    console.error(JSON.stringify({ severity: "ERROR", event: "member_notification_maintenance_failed" }));
    return reply({ error: "maintenance_failed" }, 503);
  }
});
