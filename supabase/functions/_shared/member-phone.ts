export type PhoneChannel = "whatsapp" | "sms";
export function phoneNumber(value: unknown): string {
  if (typeof value !== "string" || !/^\+[1-9]\d{7,14}$/.test(value)) throw new Error("invalid_request");
  return value;
}
export function phoneChannels(enabled: boolean, whatsappEnabled = false): PhoneChannel[] {
  return enabled ? whatsappEnabled ? ["sms", "whatsapp"] : ["sms"] : [];
}
export function phoneStatus(data: Record<string, unknown>, enabled: boolean, whatsappEnabled = false) {
  const phone = typeof data.phone === "string" ? data.phone : null;
  return { enabled, available_channels: phoneChannels(enabled, whatsappEnabled), verified: data.verified === true, masked_phone: phone ? `•••• ${phone.slice(-4)}` : null,
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
export type PhoneProviderConfig = { key: string; provider?: string; region?: string; number?: string; template?: string; namespace?: string; language?: string; smsTemplate?: string; smsVariable?: string };
export async function sendPhoneCode(channel: PhoneChannel, phone: string, code: string, config: PhoneProviderConfig, fetcher = fetch) {
  phoneNumber(phone);
  if (!/^\d{6}$/.test(code) || !config.key) throw new Error("delivery_unavailable");
  const provider = config.provider ?? "msg91";
  if (provider === "bird") {
    if (channel !== "sms" || !["us1", "eu1"].includes(config.region ?? "") || !config.key.startsWith(`bk_${config.region}_`)) throw new Error("delivery_unavailable");
    const response = await fetcher(`https://${config.region}.platform.bird.com/v1/sms/messages`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(4000),
      headers: {"content-type": "application/json", authorization: `Bearer ${config.key}`},
      body: JSON.stringify({to: phone, template: {slug: "bird_otp_verification", parameters: {code}}}),
    });
    const result = await response.json().catch(() => null);
    if (response.status !== 202 || typeof result?.id !== "string" || !/^sms_[A-Za-z0-9_-]{8,128}$/.test(result.id) || result.status !== "accepted" || result.to !== phone || result.direction !== "outbound" || result.category !== "authentication") throw new Error("delivery_unavailable");
    // Supabase verifies this code; Bird acceptance alone never verifies a member's phone.
    return;
  }
  if (provider !== "msg91") throw new Error("delivery_unavailable");
  let url: string; let body: object;
  if (channel === "whatsapp") {
    if (![config.number, config.template, config.namespace, config.language].every(Boolean)) throw new Error("delivery_unavailable");
    url = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
    body = { integrated_number: config.number, content_type: "template", payload: { messaging_product: "whatsapp", type: "template", template: {
      name: config.template, language: {code: config.language, policy: "deterministic"}, namespace: config.namespace,
      to_and_components: [{to: [phone.slice(1)], components: { body_1: {type: "text", value: code}, button_1: {subtype: "url", type: "text", value: code} }}],
    } } };
  } else if (channel === "sms") {
    if (!config.smsTemplate || !config.smsVariable || !/^[A-Za-z][A-Za-z0-9_]*$/.test(config.smsVariable) || config.smsVariable === "mobiles") throw new Error("delivery_unavailable");
    url = "https://control.msg91.com/api/v5/flow";
    body = { template_id: config.smsTemplate, short_url: "0", recipients: [{mobiles: phone.slice(1), [config.smsVariable]: code}] };
  } else {
    throw new Error("delivery_unavailable");
  }
  const response = await fetcher(url, {method: "POST", redirect: "error", signal: AbortSignal.timeout(4000), headers: {"content-type": "application/json", authkey: config.key}, body: JSON.stringify(body)});
  const result = await response.json().catch(() => null);
  const id = channel === "whatsapp" ? result?.request_id : result?.type === "success" ? result.message : null;
  if (!response.ok || typeof id !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(id) || result?.status === "error" || result?.hasError === true) throw new Error("delivery_unavailable");
  // Acceptance is not a delivery receipt. No retries: an ambiguous provider outcome may have sent the code.
}
