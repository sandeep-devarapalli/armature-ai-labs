import { corsHeaders } from '../_shared/cors.ts';
import { requiredEnv } from '../_shared/env.ts';
import { HttpError, json } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { emailPattern, validateEcosystemData } from '../_shared/ecosystem-validation.ts';

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Submission is empty.');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); throw new HttpError(413, 'Submission is too large.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, 'Submission must be valid JSON.'); }
}

export async function handleSubmission(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { message: 'Use POST.' }, 405);
  try {
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid submission.');
    if (body.companyFax) throw new HttpError(400, 'Submission could not be accepted.');
    if (typeof body.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotencyKey)) throw new HttpError(400, 'Invalid submission receipt key.');
    if (!['new', 'update'].includes(body.kind)) throw new HttpError(400, 'Invalid contribution type.');
    if (body.kind === 'update' && (typeof body.targetSlug !== 'string' || body.targetSlug.length > 100 || !Number.isInteger(body.baseRevision) || body.baseRevision < 1)) throw new HttpError(400, 'Reload the listing before suggesting an edit.');
    let proposed: Record<string, unknown>;
    try { proposed = validateEcosystemData(body.proposed); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid listing.'); }
    const name = body.submitterName ?? '';
    const email = body.submitterEmail ?? '';
    if (typeof name !== 'string' || name.length > 120 || typeof email !== 'string' || email.length > 254 || (email && !emailPattern.test(email))) throw new HttpError(400, 'Invalid private follow-up details.');
    if ((proposed.publicEmail || (proposed.publicPhones as unknown[] | undefined)?.length) && body.permissionToShare !== true) throw new HttpError(400, 'Confirm permission to publish these contact details.');
    const client = adminClient();
    const submittedProposed = structuredClone(proposed);
    if (body.creditMe !== true) {
      proposed.credit = null;
      if (body.kind === 'update') {
        const { data, error } = await client.from('ecosystem_listings').select('data').eq('slug', body.targetSlug).eq('published', true).single();
        if (error) throw new HttpError(409, 'Reload the listing before suggesting an edit.');
        proposed.credit = data.data.credit ?? null;
      }
    }
    // Release requires an ingress that overwrites this header; never trust the first XFF value.
    const ipHeader = requiredEnv('ECOSYSTEM_TRUSTED_IP_HEADER').toLowerCase();
    if (!['cf-connecting-ip', 'x-real-ip'].includes(ipHeader)) throw new Error('Untrusted ingress configuration');
    const remoteIp = request.headers.get(ipHeader)?.trim();
    if (!remoteIp || remoteIp.length > 45 || !/^[a-fA-F0-9:.]+$/.test(remoteIp)) throw new HttpError(503, 'Submission protection is unavailable. Please try again later.');
    if (typeof body.turnstileToken !== 'string' || !body.turnstileToken || body.turnstileToken.length > 2048) throw new HttpError(400, 'Complete the verification challenge.');
    // Owner-approved token-only verification. No submitter IP or form content goes to Cloudflare.
    const challenge = new URLSearchParams({ secret: requiredEnv('TURNSTILE_SECRET_KEY'), response: body.turnstileToken, idempotency_key: body.idempotencyKey });
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: challenge, signal: AbortSignal.timeout(10000) });
    const verified = await verification.json();
    if (!verification.ok || !verified.success || verified.action !== 'ecosystem_submit' || verified.hostname !== new URL(requiredEnv('APP_ORIGIN')).hostname) throw new HttpError(400, 'Verification expired or failed. Please try the challenge again.');
    const salt = requiredEnv('ECOSYSTEM_IP_HASH_SECRET');
    if (salt.length < 32) throw new Error('Fingerprint secret is too short');
    const payload = { kind: body.kind, target: body.kind === 'update' ? body.targetSlug : null, revision: body.kind === 'update' ? body.baseRevision : null, proposed, name: name.trim(), email: email.trim(), permission: body.permissionToShare === true };
    const { data: receipt, error } = await client.rpc('receive_ecosystem_submission', {
      p_idempotency_key: body.idempotencyKey, p_payload_hash: await sha256Hex(JSON.stringify({ ...payload, proposed: submittedProposed })),
      p_kind: payload.kind, p_target_slug: payload.target, p_base_revision: payload.revision,
      p_proposed: proposed, p_submitter_name: payload.name || null, p_submitter_email: payload.email || null,
      p_ip_hash: await sha256Hex(`${salt}|${remoteIp}`), p_permission_to_share: payload.permission,
    });
    if (error) {
      if (error.code === 'P0409') throw new HttpError(409, 'An update is awaiting admin review. You can suggest another edit after it is approved or rejected.', 'edit_pending');
      if (error.code === 'P0429') throw new HttpError(429, 'Too many submissions. Please try again in an hour.');
      if (error.code === '40001') throw new HttpError(409, 'This listing changed. Reload it before suggesting an edit.');
      if (error.code === '22023') throw new HttpError(409, 'Submission details changed. Start a new submission or reload this listing.');
      throw new Error('Submission persistence failed');
    }
    if (typeof receipt !== 'string') throw new Error('Missing saved receipt');
    return json(request, { saved: true, receipt }, 201);
  } catch (error) {
    if (error instanceof HttpError) return json(request, { code: error.code, message: error.message }, error.status);
    // Never log form contents, private contacts, IP addresses or provider responses.
    return json(request, { message: 'Submission is temporarily unavailable. Your details have not been cleared; please retry.' }, 503);
  }
}

if (import.meta.main) Deno.serve(handleSubmission);
