export type PhoneChannel = "whatsapp" | "sms";
export function phoneNumber(value: unknown): string {
  if (typeof value !== "string" || !/^\+[1-9]\d{7,14}$/.test(value)) throw new Error("invalid_request");
  return value;
}
export function phoneStatus(data: Record<string, unknown>, enabled: boolean) {
  const phone = typeof data.phone === "string" ? data.phone : null;
  return { enabled, verified: data.verified === true, masked_phone: phone ? `•••• ${phone.slice(-4)}` : null,
    channel: data.channel ?? null, expires_at: data.expires_at ?? null, resend_available_at: data.resend_available_at ?? null };
}
export async function verifyPhoneHook(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("webhook-id"), timestamp = headers.get("webhook-timestamp"), signatures = headers.get("webhook-signature");
  if (!id || id.length > 200 || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !signatures) throw new Error("invalid_hook");
  const encoded = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const message = new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
  for (const signature of signatures.split(" ")) {
    if (!signature.startsWith("v1,")) continue;
    try {
      if (await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(signature.slice(3)), c => c.charCodeAt(0)), message)) return id;
    } catch { /* A malformed signature cannot authorize delivery. */ }
  }
  throw new Error("invalid_hook");
}
export function phoneHookPayload(value: unknown) {
  const body = value as {user?: {id?: unknown; phone?: unknown; new_phone?: unknown; email?: unknown; email_confirmed_at?: unknown}; sms?: {otp?: unknown; phone?: unknown}};
  if (!body?.user || typeof body.user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.user.id) || !body.user.email || !body.user.email_confirmed_at || typeof body.sms?.otp !== "string" || !/^\d{6}$/.test(body.sms.otp)) throw new Error("invalid_hook");
  // New Auth versions include sms.phone; older versions serialize the pending target as new_phone.
  const target = body.sms.phone ?? body.user.new_phone;
  if (typeof target !== "string" || typeof body.user.new_phone !== "string" || target.replace(/^\+/, "") !== body.user.new_phone.replace(/^\+/, "")) throw new Error("invalid_hook");
  return { userId: body.user.id, phone: phoneNumber(`+${target.replace(/^\+/, "")}`), code: body.sms.otp };
}
export type PhoneProviderConfig = { key: string; number: string; template: string; namespace: string; language: string; smsTemplate: string; smsVariable: string };
export async function sendPhoneCode(channel: PhoneChannel, phone: string, code: string, config: PhoneProviderConfig, fetcher = fetch) {
  phoneNumber(phone);
  if (!/^\d{6}$/.test(code) || !config.key) throw new Error("delivery_unavailable");
  let url: string; let body: object;
  if (channel === "whatsapp") {
    if (![config.number, config.template, config.namespace, config.language].every(Boolean)) throw new Error("delivery_unavailable");
    url = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
    body = { integrated_number: config.number, content_type: "template", payload: { messaging_product: "whatsapp", type: "template", template: {
      name: config.template, language: {code: config.language, policy: "deterministic"}, namespace: config.namespace,
      to_and_components: [{to: [phone.slice(1)], components: { body_1: {type: "text", value: code}, button_1: {subtype: "url", type: "text", value: code} }}],
    } } };
  } else {
    if (!config.smsTemplate || !/^[A-Za-z][A-Za-z0-9_]*$/.test(config.smsVariable) || config.smsVariable === "mobiles") throw new Error("delivery_unavailable");
    url = "https://control.msg91.com/api/v5/flow";
    body = { template_id: config.smsTemplate, short_url: "0", recipients: [{mobiles: phone.slice(1), [config.smsVariable]: code}] };
  }
  const response = await fetcher(url, {method: "POST", redirect: "error", signal: AbortSignal.timeout(4000), headers: {"content-type": "application/json", authkey: config.key}, body: JSON.stringify(body)});
  const result = await response.json().catch(() => null);
  const id = channel === "whatsapp" ? result?.request_id : result?.type === "success" ? result.message : null;
  if (!response.ok || typeof id !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(id) || result?.status === "error" || result?.hasError === true) throw new Error("delivery_unavailable");
  // Acceptance is not a delivery receipt. No retries: an ambiguous provider outcome may have sent the code.
}
