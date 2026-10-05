import { adminClient } from "../_shared/supabase.ts";
import { memberNotificationTemplate } from "../_shared/member-notification-templates.ts";

type Notice = { id: string; lease_token: string; kind: string; recipient_email: string; template_version: number; first_attempt_at: string | null };
type Outcome = "accepted" | "retry" | "failed" | "unknown";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function boundedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel(); }, 5_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error("body_timeout");
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("body_limit");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { clearTimeout(timer); await reader.cancel(); }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("MEMBER_NOTIFICATIONS_ENABLED") !== "true") return response({ error: "notifications_disabled" }, 503);
  const secret = Deno.env.get("MEMBER_NOTIFICATIONS_WORKER_TOKEN") ?? "";
  if (secret.length < 32 || secret.length > 256) return response({ error: "worker_unconfigured" }, 503);
  const supplied = request.headers.get("x-armature-job-secret") ?? "";
  let difference = secret.length ^ supplied.length;
  for (let i = 0; i < secret.length; i++) difference |= secret.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0);
  if (difference !== 0) {
    const signingKey = Deno.env.get("MEMBER_NOTIFICATIONS_WAKEUP_KEY") ?? "";
    const stamp = request.headers.get("x-armature-wakeup-time") ?? "";
    const signature = request.headers.get("x-armature-wakeup-signature") ?? "";
    const age = Math.floor(Date.now() / 1000) - Number(stamp);
    if (signingKey.length < 32 || signingKey.length > 256 || !/^\d{10}$/.test(stamp)
      || age < -5 || age > 30 || !/^[a-f0-9]{64}$/.test(signature)) return response({ error: "unauthorised" }, 401);
    const encoder = new TextEncoder();
    const signing = await crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
    if (!await crypto.subtle.verify("HMAC", signing, bytes, encoder.encode(`member-notifications:${stamp}`))) return response({ error: "unauthorised" }, 401);
  }
  const key = Deno.env.get("MEMBER_NOTIFICATIONS_RESEND_KEY") ?? "";
  if (!/^re_[A-Za-z0-9_-]{16,}$/.test(key)) return response({ error: "sender_unconfigured" }, 503);
  try {
    const raw = await boundedText(request.body, 512);
    if (raw && (raw.trim() !== "{}")) return response({ error: "unexpected_payload" }, 400);
  } catch { return response({ error: "invalid_payload" }, 400); }

  const counts = { claimed: 0, accepted: 0, retry: 0, failed: 0, unknown: 0, skipped: 0 };
  const deadline = Date.now() + 60_000;
  try {
    const client = adminClient();
    const rpc = (name: string, args: Record<string, unknown>) => client.rpc(name, args).abortSignal(AbortSignal.timeout(8_000));
    let claimed = await rpc("claim_member_notifications", { p_limit: 10 });
    if (claimed.status === 401 && claimed.error?.code === "PGRST303") {
      // PostgREST rejected authentication before executing the claim; no send has begun.
      console.warn(JSON.stringify({ event: "member_notification_claim_auth_retry", status: 401, code: "PGRST303" }));
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      claimed = await rpc("claim_member_notifications", { p_limit: 10 });
      console.info(JSON.stringify({ event: "member_notification_claim_auth_retry_result", status: claimed.status, recovered: !claimed.error && Array.isArray(claimed.data) && claimed.data.length <= 10 }));
    }
    const { data, error } = claimed;
    if (error || !Array.isArray(data) || data.length > 10) {
      console.error(JSON.stringify({ event: "member_notification_claim_failed", status: claimed.status, code: error?.code === "PGRST303" ? "PGRST303" : "other" }));
      throw new Error("claim_failed");
    }
    counts.claimed = data.length;
    for (const notice of data as Notice[]) {
      if (Date.now() > deadline - 8_000) { counts.skipped++; continue; }
      if (!uuid.test(notice.id) || !uuid.test(notice.lease_token)) throw new Error("invalid_claim");
      const prepared = await rpc("prepare_member_notification", { p_id: notice.id, p_lease_token: notice.lease_token });
      if (prepared.error) throw new Error("prepare_failed");
      if (prepared.data !== true || Date.now() > deadline - 8_000) { counts.skipped++; continue; }
      let outcome: Outcome = "failed";
      let providerId: string | null = null;
      const template = memberNotificationTemplate(notice.kind, notice.template_version);
      const age = notice.first_attempt_at === null ? 0 : Date.now() - Date.parse(notice.first_attempt_at);
      if (!Number.isFinite(age) || age < 0 || age >= 23 * 60 * 60_000) outcome = "unknown";
      else if (template && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notice.recipient_email)) {
        // A stable key and immutable template cover ambiguous retries inside the provider window.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        try {
          const sent = await fetch("https://api.resend.com/emails", {
            method: "POST", redirect: "error", signal: controller.signal,
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `member-${notice.id}-v${notice.template_version}` },
            body: JSON.stringify({ from: "Armature AI Labs <no-reply@mail.armatureailabs.com>", to: [notice.recipient_email], reply_to: "hello@armatureailabs.com", ...template }),
          });
          if (sent.status === 429 || sent.status >= 500) { outcome = "retry"; await sent.body?.cancel(); }
          else if (sent.status === 409) {
            outcome = "unknown";
            const conflict = JSON.parse(await boundedText(sent.body, 4096));
            outcome = conflict.name === "concurrent_idempotent_requests" ? "retry" : "failed";
          }
          else if (!sent.ok) { outcome = "failed"; await sent.body?.cancel(); }
          else {
            outcome = "unknown";
            const body = JSON.parse(await boundedText(sent.body, 4096));
            if (typeof body.id === "string" && uuid.test(body.id)) { providerId = body.id; outcome = "accepted"; }
          }
        } catch { if (outcome !== "unknown") outcome = "retry"; }
        finally { clearTimeout(timer); }
      }
      const finished = await rpc("finish_member_notification", { p_id: notice.id, p_lease_token: notice.lease_token, p_outcome: outcome, p_provider_id: providerId });
      if (finished.error || finished.data !== true) throw new Error("finish_failed");
      counts[outcome]++;
    }
    return response(counts);
  } catch { return response({ ...counts, error: "notification_run_failed" }, 503); }
});
