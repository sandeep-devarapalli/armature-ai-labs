import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => {
  const env: Record<string, string> = { APP_ORIGIN: 'https://example.org', ECOSYSTEM_TRUSTED_IP_HEADER: 'x-real-ip', ECOSYSTEM_IP_HASH_SECRET: 'synthetic-test-secret-at-least-thirty-two-characters', TURNSTILE_SECRET_KEY: 'synthetic-secret' };
  Object.assign(globalThis, { Deno: { env: { get: (key: string) => env[key] } } });
  return { env, rpc: vi.fn(), from: vi.fn() };
});
vi.mock('../../supabase/functions/_shared/supabase.ts', () => ({ adminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('../../supabase/functions/_shared/crypto.ts', () => ({ sha256Hex: async () => 'a'.repeat(64) }));
import { handleSubmission } from '../../supabase/functions/submit-ecosystem/index';

const draft = { idempotencyKey: '10000000-0000-4000-8000-000000000010', kind: 'new', proposed: { name: 'Synthetic facility', summary: 'Synthetic public fixture', primaryType: 'supplier', websiteUrl: 'https://example.org' }, turnstileToken: 'synthetic-token', permissionToShare: false, creditMe: false, submitterName: 'Private name', submitterEmail: 'private@example.org', companyFax: '' };
const request = (body: unknown, headers = { 'x-real-ip': '127.0.0.1' }) => new Request('https://api.example.org/submit-ecosystem', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
describe('anonymous ecosystem intake', () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: '10000000-0000-4000-8000-000000000099', error: null });
    mocks.env.ECOSYSTEM_TRUSTED_IP_HEADER = 'x-real-ip';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true, action: 'ecosystem_submit', hostname: 'example.org' }), { status: 200 })));
  });
  it('allows the actual Supabase SDK request headers in browser preflight without opening other origins', async () => {
    let sdkRequest: Request | undefined;
    const sdk = createClient('https://api.example.org', 'synthetic-public-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        sdkRequest = new Request(input, init);
        return new Response('{}', { headers: { 'content-type': 'application/json' } });
      } },
    });
    await sdk.functions.invoke('submit-ecosystem', { body: draft });
    const requestedHeaders = [...sdkRequest!.headers.keys()];
    expect(requestedHeaders).toEqual(expect.arrayContaining(['authorization', 'apikey', 'content-type', 'x-client-info']));
    const preflight = (origin: string) => new Request(sdkRequest!.url, { method: 'OPTIONS', headers: {
      origin, 'access-control-request-method': 'POST', 'access-control-request-headers': requestedHeaders.join(','),
    } });
    const response = await handleSubmission(preflight('https://armatureailabs.com'));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://armatureailabs.com');
    const allowedHeaders = response.headers.get('access-control-allow-headers')!.split(',').map((value) => value.trim());
    expect(allowedHeaders).toEqual(expect.arrayContaining(requestedHeaders));
    expect((await handleSubmission(preflight('https://untrusted.example'))).headers.get('access-control-allow-origin')).not.toBe('https://untrusted.example');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns a saved receipt for a fast genuine request only after persistence', async () => {
    const result = await handleSubmission(request(draft));
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ saved: true, receipt: '10000000-0000-4000-8000-000000000099' });
    expect(mocks.rpc).toHaveBeenCalledWith('receive_ecosystem_submission', expect.objectContaining({ p_submitter_email: 'private@example.org', p_permission_to_share: false }));
    expect(mocks.rpc.mock.calls[0][1].p_proposed).not.toHaveProperty('submitterEmail');
  });
  it('sends only the challenge token and required verification metadata, never IP or contacts', async () => {
    await handleSubmission(request(draft));
    const challenge = vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams;
    expect([...challenge.keys()].sort()).toEqual(['idempotency_key', 'response', 'secret']);
    expect(challenge.toString()).not.toContain('127.0.0.1');
    expect(challenge.toString()).not.toContain('private');
  });
  it('queues valid guide metadata privately and rejects unsafe Maps URLs before persistence', async () => {
    const proposed = { ...draft.proposed, city: 'bangalore', guideCategories: ['cafes'], googleMapsUrl: 'https://maps.app.goo.gl/syntheticPlace' };
    expect((await handleSubmission(request({ ...draft, proposed }))).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('receive_ecosystem_submission', expect.objectContaining({ p_proposed: expect.objectContaining(proposed) }));
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.rpc.mockClear();
    expect((await handleSubmission(request({ ...draft, proposed: { ...proposed, googleMapsUrl: 'https://maps.google.com.evil.test/' } }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not claim success for a honeypot or rejected database write', async () => {
    const trapped = await handleSubmission(request({ ...draft, companyFax: 'bot' }));
    expect(trapped.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000' } });
    const failed = await handleSubmission(request(draft));
    expect(failed.status).toBe(503);
    expect(await failed.json()).not.toHaveProperty('receipt');
  });
  it('fails closed for missing trusted ingress or wrong challenge audience', async () => {
    const missingIp = await handleSubmission(request(draft, {} as { 'x-real-ip': string }));
    expect(missingIp.status).toBe(503);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, action: 'different', hostname: 'example.org' })));
    expect((await handleSubmission(request(draft))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires publication permission for phones and bounds the request body', async () => {
    expect((await handleSubmission(request({ ...draft, proposed: { ...draft.proposed, publicPhones: [{ label: 'Office', number: '+91 8000000000' }] } }))).status).toBe(400);
    expect((await handleSubmission(request({ ...draft, large: 'x'.repeat(33000) }))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('reports stale-edit and rate-limit failures without a receipt', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    expect((await handleSubmission(request(draft))).status).toBe(409);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0429' } });
    expect((await handleSubmission(request(draft))).status).toBe(429);
  });
  it('returns the public pending-edit conflict without private submission data', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0409', details: 'private reviewer details' } });
    const response = await handleSubmission(request(draft));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'edit_pending', message: 'An update is awaiting admin review. You can suggest another edit after it is approved or rejected.' });
  });
});
