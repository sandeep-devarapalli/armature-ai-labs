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

async function providerResult(response: Response): Promise<{ outcome: string; providerId: string | null }> {
  const unknown = { outcome: 'unknown', providerId: null };
  if ([400, 401, 403, 404, 405, 422].includes(response.status)) {
    void response.body?.cancel().catch(() => undefined);
    return { outcome: 'failed', providerId: null };
  }
  if ((!response.ok && response.status !== 429) || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    return unknown;
  }
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const body = await Promise.race([
      (async () => {
        const decoder = new TextDecoder();
        let size = 0;
        let text = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return JSON.parse(text + decoder.decode());
          size += value.byteLength;
          if (size > 65_536) throw new Error('Provider response too large');
          text += decoder.decode(value, { stream: true });
        }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Provider response timed out')), 10_000); }),
    ]);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return unknown;
    if (response.status === 429) return { outcome: ['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded'].includes(body.name) ? 'retry' : 'unknown', providerId: null };
    if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) return unknown;
    return { outcome: 'accepted', providerId: body.id.toLowerCase() };
  } catch {
    return unknown;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
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
    const recipient = requiredEnv('ECOSYSTEM_NOTIFICATION_ADMIN_EMAIL').trim().toLowerCase();
    const apiKey = Deno.env.get('RESEND_API_KEY') || requiredEnv('MEMBER_NOTIFICATIONS_RESEND_KEY');
    const reviewUrl = new URL('/admin/ecosystem', requiredEnv('APP_ORIGIN')).toString();
    const { data, error } = await client.rpc('claim_ecosystem_notifications', { p_recipient_email: recipient });
    if (error) throw new Error('Notification claim failed');
    let sent = 0;
    for (const item of data ?? []) {
      const prepared = await client.rpc('prepare_ecosystem_notification', { p_submission_id: item.submission_id, p_lease: item.lease });
      if (prepared.error || typeof prepared.data !== 'boolean') throw new Error('Notification preparation failed');
      if (!prepared.data) continue;
      let result = { outcome: 'unknown', providerId: null as string | null };
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': `ecosystem:${item.submission_id}` },
          body: JSON.stringify({ from: sender, to: [recipient], subject: 'Builder Atlas contribution awaiting review', text: `A contribution is awaiting admin review.\nReceipt: ${item.submission_id}\nReview privately: ${reviewUrl}\nNo changes are public until approved.` }),
        });
        result = await providerResult(response);
      } catch { /* An ambiguous send must be reconciled, never blindly retried. */ }
      const finish = await client.rpc('finish_ecosystem_notification', { p_submission_id: item.submission_id, p_lease: item.lease, p_outcome: result.outcome, p_provider_id: result.providerId });
      if (finish.error || finish.data !== true) throw new Error('Notification acknowledgement failed');
      if (result.outcome === 'accepted') sent++;
    }
    return json(request, { cleaned: true, sent });
  } catch (error) {
    return json(request, { message: 'Ecosystem maintenance did not complete.' }, error instanceof HttpError ? error.status : 503);
  }
}

if (import.meta.main) Deno.serve(handleMaintenance);
