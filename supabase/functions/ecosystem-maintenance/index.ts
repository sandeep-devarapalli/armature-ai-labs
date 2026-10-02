import { assertJobSecret, requiredEnv } from '../_shared/env.ts';
import { HttpError, json } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

async function authorizeWakeup(request: Request): Promise<void> {
  if (request.headers.has('x-armature-job-secret') && Deno.env.get('ARMATURE_JOB_SECRET')) {
    try { assertJobSecret(request); return; } catch { /* A signed wakeup can authenticate independently. */ }
  }
  const secret = Deno.env.get('ECOSYSTEM_MAINTENANCE_KEY') ?? '';
  const stamp = request.headers.get('x-armature-wakeup-time') ?? '';
  const signature = request.headers.get('x-armature-wakeup-signature') ?? '';
  const age = Math.floor(Date.now() / 1000) - Number(stamp);
  if (secret.length < 32 || secret.length > 256 || !/^\d{10}$/.test(stamp) || age < -5 || age > 30 || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new HttpError(401, 'Invalid maintenance authorization.');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, (byte) => Number.parseInt(byte, 16));
  if (!await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`ecosystem-maintenance:${stamp}`))) {
    throw new HttpError(401, 'Invalid maintenance authorization.');
  }
}

async function requireEmptyBody(request: Request): Promise<void> {
  if (Number(request.headers.get('content-length') ?? 0) > 512) throw new HttpError(413, 'Maintenance payload is too large.');
  if (!request.body) return;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const text = await Promise.race([
      (async () => {
        const decoder = new TextDecoder();
        let size = 0;
        let result = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) return result + decoder.decode();
          size += value.byteLength;
          if (size > 512) throw new HttpError(413, 'Maintenance payload is too large.');
          result += decoder.decode(value, { stream: true });
        }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HttpError(408, 'Maintenance payload timed out.')), 5000); }),
    ]);
    if (text.trim() !== '' && text.trim() !== '{}') throw new HttpError(400, 'Maintenance accepts only an empty payload.');
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => undefined);
  }
}

export async function handleMaintenance(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(request, { message: 'Use POST.' }, 405);
  try {
    await authorizeWakeup(request);
    await requireEmptyBody(request);
    const client = adminClient();
    const cleanup = await client.rpc('cleanup_ecosystem_private_data');
    if (cleanup.error) throw new Error('Retention failed');
    if (Deno.env.get('ECOSYSTEM_NOTIFICATIONS_ENABLED') !== 'true') return json(request, { cleaned: true, notifications: 'disabled' });
    const sender = requiredEnv('ECOSYSTEM_NOTIFICATION_FROM_EMAIL');
    const recipient = requiredEnv('ECOSYSTEM_NOTIFICATION_ADMIN_EMAIL');
    const apiKey = Deno.env.get('RESEND_API_KEY') || requiredEnv('MEMBER_NOTIFICATIONS_RESEND_KEY');
    const reviewUrl = new URL('/admin/ecosystem', requiredEnv('APP_ORIGIN')).toString();
    const { data, error } = await client.rpc('claim_ecosystem_notifications');
    if (error) throw new Error('Notification claim failed');
    let sent = 0;
    for (const item of data ?? []) {
      let success = false;
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': `ecosystem:${item.submission_id}` },
          body: JSON.stringify({ from: sender, to: [recipient], subject: 'Builder Atlas contribution awaiting review', text: `A contribution is awaiting admin review.\nReceipt: ${item.submission_id}\nReview privately: ${reviewUrl}\nNo changes are public until approved.` }),
        });
        success = response.ok;
      } catch { /* The durable queue retains failed attempts for retry. */ }
      const finish = await client.rpc('finish_ecosystem_notification', { p_submission_id: item.submission_id, p_lease: item.lease, p_success: success });
      if (finish.error) throw new Error('Notification acknowledgement failed');
      if (success) sent++;
    }
    return json(request, { cleaned: true, sent });
  } catch (error) {
    return json(request, { message: 'Ecosystem maintenance did not complete.' }, error instanceof HttpError ? error.status : 503);
  }
}

if (import.meta.main) Deno.serve(handleMaintenance);
