import { authorizeMarketWakeup } from '../_shared/market-wakeup.ts';
import { adminClient } from '../_shared/supabase.ts';

Deno.serve(async (request: Request) => {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  if (!await authorizeMarketWakeup(request, 'market-message-reminders', 'MARKET_MESSAGE_WAKEUP_KEY', 'MARKET_MESSAGE_JOB_SECRET')) return reply({ error: 'unauthorized' }, 401);
  const client = adminClient();
  const workflow = await client.rpc('market_process_reminders');
  if (workflow.error) return reply({ error: 'workflow_reminders_failed' },503);
  if (Deno.env.get('MARKET_MESSAGE_EMAIL_ENABLED') !== 'true') return reply({workflow_notices: workflow.data, email_enabled: false});
  const apiKey = Deno.env.get('MEMBER_NOTIFICATIONS_RESEND_KEY');
  const from = 'Armature AI Labs <no-reply@mail.armatureailabs.com>'; 
  if (!apiKey || !from) return reply({ error: 'sender_unconfigured' }, 503);
  const claimed = await client.rpc('market_claim_reminders');
  if (claimed.error) return reply({ error: 'claim_failed' }, 503);
  const counts = { accepted: 0, retry: 0, failed: 0, skipped: 0, unknown: 0 };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const notice of claimed.data ?? []) {
    const args = { user_id: notice.user_id, lease_token: notice.lease_token };
    const prepared = await client.rpc('market_prepare_reminder', { ...args, recipient_email: notice.email });
    if (prepared.error) return reply({ error: 'prepare_failed' }, 503);
    let outcome: 'accepted' | 'retry' | 'failed' | 'skipped' | 'unknown' = 'skipped';
    let providerId: string | null = null;
    const domain = notice.email?.split('@')[1]?.trim().toLowerCase() ?? '';
    if (prepared.data === true && !/(^|\.)(test|invalid|localhost|example|example\.(com|org|net))\.?$/.test(domain)) {
      try {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(notice.event_key));
        const key = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `market-message-${key}` },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ from, to: [notice.email], subject: 'Unread messages in Armature Talent Network', text: 'You have unread messages in Armature Talent Network. Sign in to read them:\nhttps://armatureailabs.com/talent-network/#messages\n\nYou can turn off these reminders in Messages. Message contents and files remain private.' }),
        });
        if (response.ok) {
          const reader = response.body?.getReader(); if (!reader) throw new Error('missing_response');
          const chunks: Uint8Array[] = []; let size = 0;
          try { for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 4096) throw new Error('oversize_response'); chunks.push(value); } } finally { void reader.cancel(); }
          const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
          const data = JSON.parse(new TextDecoder().decode(bytes)); providerId = typeof data.id === 'string' && uuid.test(data.id) ? data.id : null; outcome = providerId ? 'accepted' : 'unknown'; }
        else { outcome = response.status === 429 || response.status >= 500 ? 'retry' : 'failed'; await response.body?.cancel(); }
      } catch { outcome = 'unknown'; }
    }
    const finished = await client.rpc('market_finish_reminder', { ...args, outcome, provider_id: providerId });
    if (finished.error) return reply({ error: 'record_failed' }, 503);
    counts[outcome]++;
  }
  return reply(counts);
});
