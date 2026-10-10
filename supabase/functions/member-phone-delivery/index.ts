import { adminClient } from "../_shared/supabase.ts";
import { requiredEnv } from "../_shared/env.ts";
import { phoneHookPayload, sendPhoneCode, verifyPhoneHook } from "../_shared/member-phone.ts";

export async function handlePhoneDelivery(request: Request) {
  const reply = (status: number, value: object) => new Response(JSON.stringify(value), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});
  if (request.method !== "POST") return reply(405, {error: {http_code: 405, message: "POST required"}});
  try {
    if (Deno.env.get("MEMBER_PHONE_VERIFICATION_ENABLED") !== "true") throw new Error("disabled");
    const raw = await request.text();
    if (raw.length > 32768) throw new Error("oversized");
    const hookId = await verifyPhoneHook(raw, request.headers, requiredEnv("MEMBER_PHONE_HOOK_SECRET"));
    const payload = phoneHookPayload(JSON.parse(raw));
    const admin = adminClient();
    const {data: intent, error} = await admin.rpc("member_phone_operation", {p_action: "claim_hook", p_user_id: payload.userId, p_phone: payload.phone, p_hook_id: hookId});
    if (error || !intent || intent.error) throw new Error("intent_unavailable");
    await sendPhoneCode(intent.channel, payload.phone, payload.code, {
      key: requiredEnv("MSG91_AUTH_KEY"), number: requiredEnv("MSG91_WHATSAPP_NUMBER"), template: requiredEnv("MSG91_WHATSAPP_TEMPLATE"),
      namespace: requiredEnv("MSG91_WHATSAPP_NAMESPACE"), language: requiredEnv("MSG91_WHATSAPP_LANGUAGE"),
      smsTemplate: requiredEnv("MSG91_SMS_TEMPLATE"), smsVariable: requiredEnv("MSG91_SMS_OTP_VARIABLE"),
    });
    const {data: marked, error: markError} = await admin.rpc("member_phone_operation", {p_action: "sent", p_user_id: payload.userId, p_intent: intent.id, p_hook_id: hookId});
    if (markError || !marked || marked.error) throw new Error("delivery_unresolved");
    return reply(200, {});
  } catch {
    // Do not emit provider responses, OTPs, phone numbers, headers or hook bodies into logs.
    return reply(400, {error: {http_code: 400, message: "Mobile verification delivery unavailable"}});
  }
}

if (import.meta.main) Deno.serve(handlePhoneDelivery);
