import { Webhook } from "npm:svix@2.5.0";
import { adminClient } from "../_shared/supabase.ts";

const eventTypes = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed", "email.suppressed"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function readBody(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel(); }, 5_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) throw new Error("body_timeout");
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) throw new Error("body_limit");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { clearTimeout(timer); void reader.cancel(); }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("MEMBER_NOTIFICATIONS_WEBHOOK_ENABLED") !== "true") return response({ error: "webhook_disabled" }, 503);
  const secret = Deno.env.get("MEMBER_NOTIFICATIONS_WEBHOOK_SECRET") ?? "";
  let verifier: Webhook;
  try {
    if (!/^whsec_[A-Za-z0-9+/=]{24,256}$/.test(secret)) throw new Error("invalid_secret");
    verifier = new Webhook(secret);
  } catch { return response({ error: "webhook_unconfigured" }, 503); }
  const eventId = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId) || !/^\d{1,12}$/.test(timestamp) || signature.length > 2048) return response({ error: "invalid_signature" }, 401);
  let raw: string;
  try { raw = await readBody(request); }
  catch { return response({ error: "invalid_payload" }, 400); }
  let event: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; from?: unknown; subject?: unknown; headers?: { name?: unknown; value?: unknown }[] } };
  try {
    verifier.verify(raw, { "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": signature });
    event = JSON.parse(raw) as typeof event;
  } catch (error) { return response({ error: error instanceof SyntaxError ? "invalid_payload" : "invalid_signature" }, error instanceof SyntaxError ? 400 : 401); }
  if (!event || typeof event !== "object" || typeof event.type !== "string") return response({ error: "invalid_payload" }, 400);
  if (!eventTypes.has(event.type)) return response({ ignored: true });
  if (typeof event.data?.email_id !== "string" || !uuid.test(event.data.email_id) || typeof event.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(event.created_at) || !Number.isFinite(Date.parse(event.created_at))) return response({ error: "invalid_payload" }, 400);
  const authProject = Array.isArray(event.data.headers) && event.data.headers.some(header =>
    header && header.name === "X-Pm-Metadata-Project-Ref" && header.value === "uxfhdfagrmaeyuaipaar");
  const signInEmail = authProject && typeof event.data.from === "string" && event.data.subject === "Your sign-in link" &&
    ["no-reply@mail.armatureailabs.com", "Armature AI Labs <no-reply@mail.armatureailabs.com>", '"Armature AI Labs" <no-reply@mail.armatureailabs.com>'].includes(event.data.from);
  try {
    const { data, error } = await adminClient().rpc("record_classified_notification_event", {
      p_event_id: eventId, p_provider_id: event.data.email_id, p_event_type: event.type, p_occurred_at: event.created_at,
      p_sender: signInEmail ? event.data.from : null, p_subject: signInEmail ? event.data.subject : null,
    }).abortSignal(AbortSignal.timeout(5_000));
    if (error || typeof data !== "boolean") throw new Error("persistence_failed");
    return response({ received: true });
  } catch { return response({ error: "event_persistence_failed" }, 503); }
});
