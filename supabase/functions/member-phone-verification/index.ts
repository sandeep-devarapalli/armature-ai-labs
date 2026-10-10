import { adminClient, authenticatedUser, bearerToken } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { phoneChannels, phoneNumber, phoneStatus } from "../_shared/member-phone.ts";

export async function handlePhoneVerification(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: corsHeaders(request)});
  if (request.method !== "POST") return json(request, {error: "Use POST.", code: "invalid_request"}, 405);
  try {
    const user = await authenticatedUser(request);
    const raw = await request.text();
    if (raw.length > 1024) throw new HttpError(400, "Invalid request.", "invalid_request");
    let input;
    try { input = JSON.parse(raw); } catch { throw new HttpError(400, "Invalid request.", "invalid_request"); }
    if (!input || !["status", "start", "verify"].includes(input.action)) throw new HttpError(400, "Invalid request.", "invalid_request");
    const enabled = Deno.env.get("MEMBER_PHONE_VERIFICATION_ENABLED") === "true";
    const whatsappEnabled = Deno.env.get("MEMBER_PHONE_WHATSAPP_ENABLED") === "true";
    const channels = phoneChannels(enabled, whatsappEnabled);
    const admin = adminClient();
    const operation = async (action: string, args: Record<string, unknown> = {}) => {
      const {data, error} = await admin.rpc("member_phone_operation", {p_action: action, p_user_id: user.id, ...args});
      if (error || !data) throw new HttpError(503, "Mobile verification is unavailable.", "unavailable");
      if (data.error) throw new HttpError(data.error === "rate_limited" ? 429 : 409,
        data.error === "rate_limited" ? "Please wait before trying again." : "Start a new verification request.", data.error);
      return data;
    };
    if (input.action === "status") return json(request, phoneStatus(await operation("status"), enabled, whatsappEnabled));
    if (!enabled) throw new HttpError(503, "Mobile verification is not open yet.", "unavailable");
    const authRequest = async (path: string, method: string, body: object) => {
      const response = await fetch(`${requiredEnv("SUPABASE_URL")}/auth/v1/${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(10000),
        headers: {apikey: requiredEnv("SUPABASE_ANON_KEY"), Authorization: `Bearer ${bearerToken(request)}`, "content-type": "application/json"},
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new HttpError(response.status === 429 ? 429 : 400,
        path === "verify" ? "Code invalid or expired. Request a new code if needed." : "Code could not be sent. Wait, then try again.",
        response.status === 429 ? "rate_limited" : path === "verify" ? "invalid_code" : "unavailable");
      return result;
    };
    if (input.action === "start") {
      let phone;
      try { phone = phoneNumber(input.phone); } catch { throw new HttpError(400, "Enter your number with its country code, for example +91 followed by your number.", "invalid_request"); }
      if (!["whatsapp", "sms"].includes(input.channel)) throw new HttpError(400, "Choose WhatsApp or SMS.", "invalid_request");
      if (!channels.includes(input.channel)) throw new HttpError(400, "Choose an available delivery channel.", "channel_unavailable");
      const intent = await operation("start", {p_phone: phone, p_channel: input.channel});
      // The Send SMS hook chooses the explicit channel from the protected intent.
      await authRequest("user", "PUT", {phone, channel: "sms"});
      const delivered = await operation("status");
      if (delivered.id !== intent.id || delivered.delivered !== true) throw new HttpError(409, "Code was not sent. Refresh your verification status and try again.", "verification_changed");
      return json(request, phoneStatus(delivered, enabled, whatsappEnabled));
    }
    if (typeof input.code !== "string" || !/^\d{6}$/.test(input.code)) throw new HttpError(400, "Enter the six-digit code.", "invalid_code");
    const intent = await operation("verify");
    if (!channels.includes(intent.channel)) throw new HttpError(400, "Request a new code through an available channel.", "channel_unavailable");
    const result = await authRequest("verify", "POST", {phone: intent.phone, token: input.code, type: "phone_change"});
    if (result.user?.id !== user.id) throw new HttpError(409, "Verification changed. Start again.", "verification_changed");
    return json(request, phoneStatus(await operation("complete", {p_intent: intent.id}), enabled, whatsappEnabled));
  } catch (error) {
    return json(request, {error: error instanceof HttpError ? error.message : "Mobile verification is unavailable.",
      code: error instanceof HttpError ? error.code : "unavailable"}, error instanceof HttpError ? error.status : 503);
  }
}

if (import.meta.main) Deno.serve(handlePhoneVerification);
