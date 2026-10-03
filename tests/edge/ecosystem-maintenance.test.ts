import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const mocks = vi.hoisted(() => {
  const env: Record<string, string> = { ARMATURE_JOB_SECRET: 'synthetic-job-secret', APP_ORIGIN: 'https://example.org', ECOSYSTEM_NOTIFICATION_FROM_EMAIL: 'hello@example.org', ECOSYSTEM_NOTIFICATION_ADMIN_EMAIL: 'admin@example.org', RESEND_API_KEY: 'synthetic-provider-key' };
  Object.assign(globalThis, { Deno: { env: { get: (key: string) => env[key] } } });
  return { env, rpc: vi.fn() };
});
vi.mock('../../supabase/functions/_shared/supabase.ts', () => ({ adminClient: () => ({ rpc: mocks.rpc }) }));
import { handleMaintenance } from '../../supabase/functions/ecosystem-maintenance/index';
const request = (secret = 'synthetic-job-secret') => new Request('https://example.org/maintenance', { method: 'POST', headers: { 'x-armature-job-secret': secret } });
const signingKey = 'synthetic-maintenance-key-not-for-production';
const signedRequest = (age = 0, purpose = 'ecosystem-maintenance', body = '{}', signature?: string) => {
  const stamp = String(Math.floor(Date.now() / 1000) - age);
  return new Request('https://example.org/maintenance', { method: 'POST', headers: {
    'x-armature-wakeup-time': stamp,
    'x-armature-wakeup-signature': signature ?? createHmac('sha256', signingKey).update(`${purpose}:${stamp}`).digest('hex'),
  }, body });
};
const providerId = '10000000-abcd-4000-8000-000000000001';
function notification(finished: unknown = true, prepared: unknown = true, prepareError: unknown = null) {
  mocks.env.ECOSYSTEM_NOTIFICATIONS_ENABLED = 'true';
  mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ data: [{ submission_id: 'synthetic-receipt', lease: 'lease' }], error: null }).mockResolvedValueOnce({ data: prepared, error: prepareError }).mockResolvedValueOnce({ data: finished, error: null });
}
const finishArgs = (outcome: string, id: string | null = null) => ({ p_submission_id: 'synthetic-receipt', p_lease: 'lease', p_outcome: outcome, p_provider_id: id });
describe('ecosystem retention and notification delivery', () => {
  beforeEach(() => {
    mocks.env.ECOSYSTEM_NOTIFICATIONS_ENABLED = 'false';
    mocks.env.RESEND_API_KEY = 'synthetic-provider-key';
    delete mocks.env.MEMBER_NOTIFICATIONS_RESEND_KEY;
    delete mocks.env.ECOSYSTEM_MAINTENANCE_KEY;
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: providerId }), { status: 200 })));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it('accepts a current purpose-bound signature without the reusable job credential', async () => {
    mocks.env.ECOSYSTEM_MAINTENANCE_KEY = signingKey;
    expect((await handleMaintenance(signedRequest())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('cleanup_ecosystem_private_data');
  });
  it('allows the 30-second window and rejects expired or far-future signatures', async () => {
    mocks.env.ECOSYSTEM_MAINTENANCE_KEY = signingKey;
    vi.spyOn(Date, 'now').mockReturnValue(1790940000000);
    try {
      expect((await handleMaintenance(signedRequest(30))).status).toBe(200);
      mocks.rpc.mockClear();
      expect((await handleMaintenance(signedRequest(31))).status).toBe(401);
      expect((await handleMaintenance(signedRequest(-6))).status).toBe(401);
      expect(mocks.rpc).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });
  it('rejects bad signatures, another worker purpose, and a missing signing key', async () => {
    expect((await handleMaintenance(signedRequest())).status).toBe(401);
    mocks.env.ECOSYSTEM_MAINTENANCE_KEY = signingKey;
    expect((await handleMaintenance(signedRequest(0, 'member-notifications'))).status).toBe(401);
    expect((await handleMaintenance(signedRequest(0, undefined, '{}', 'a'.repeat(64)))).status).toBe(401);
    expect((await handleMaintenance(signedRequest(0, undefined, '{}', 'not-hex'))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects signed nonempty or oversized payloads before any database call', async () => {
    mocks.env.ECOSYSTEM_MAINTENANCE_KEY = signingKey;
    expect((await handleMaintenance(signedRequest(0, undefined, '{"sent":true}'))).status).toBe(400);
    expect((await handleMaintenance(signedRequest(0, undefined, ' '.repeat(513)))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires job authorization and keeps delivery disabled by default', async () => {
    expect((await handleMaintenance(request('wrong'))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, notifications: 'disabled' });
    expect(mocks.rpc).toHaveBeenCalledWith('cleanup_ecosystem_private_data');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only receipt and private admin route using provider idempotency', async () => {
    notification();
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_ecosystem_notifications', { p_recipient_email: 'admin@example.org' });
    const providerRequest = vi.mocked(fetch).mock.calls[0][1];
    expect(providerRequest?.redirect).toBe('error');
    expect(providerRequest?.headers).toMatchObject({ 'idempotency-key': 'ecosystem:synthetic-receipt' });
    expect(JSON.parse(String(providerRequest?.body)).text).toContain('/admin/ecosystem');
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('accepted', providerId));
  });
  it('holds a server error as unknown instead of retrying a possibly accepted email', async () => {
    notification();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('unknown'));
  });
  it('can reuse the existing scoped Resend key without duplicating credentials', async () => {
    notification();
    delete mocks.env.RESEND_API_KEY;
    mocks.env.MEMBER_NOTIFICATIONS_RESEND_KEY = 'synthetic-existing-scoped-key';
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 1 });
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer synthetic-existing-scoped-key' });
  });
  it.each(['{}', '{"id":"not-a-uuid"}', '{"id":42}', '{"id":"00000000-0000-0000-0000-000000000000"}', 'null', '[]', 'not json'])('holds malformed success response %s', async (body) => {
    notification();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body));
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('unknown'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('normalizes the validated provider identifier', async () => {
    notification();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: providerId.toUpperCase() })));
    expect((await handleMaintenance(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('accepted', providerId));
  });
  it.each([false, null])('fails the request when completion cannot retain the active lease: %s', async (finished) => {
    notification(finished);
    const response = await handleMaintenance(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Ecosystem maintenance did not complete.' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([new Error('network unavailable'), new DOMException('timeout', 'TimeoutError')])('holds network failures without retrying', async (error) => {
    notification();
    vi.mocked(fetch).mockRejectedValueOnce(error);
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('unknown'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded'])('retries a definitive rejected 429 %s through the durable queue', async (name) => {
    notification();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ name }), { status: 429 }));
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('retry'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403, 404, 405, 422])('records a definitive request rejection %s as failed', async (status) => {
    notification();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status }));
    expect((await handleMaintenance(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('failed'));
  });
  it.each([409, 429, 500])('holds unclassified or conflicting responses %s', async (status) => {
    notification();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status }));
    expect((await handleMaintenance(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('unknown'));
  });
  it('bounds oversized provider bodies and cancels the stream', async () => {
    notification();
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream));
    expect((await handleMaintenance(request())).status).toBe(200);
    expect(cancel).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('unknown'));
  });
  it('bounds a stalled provider body and keeps the outcome unknown', async () => {
    vi.useFakeTimers();
    notification();
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ start() {}, cancel })));
    const response = handleMaintenance(request());
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await response).status).toBe(200);
    expect(cancel).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', finishArgs('unknown'));
  });

  it('skips stale leases rejected at preparation without sending or finishing', async () => {
    notification(true, false);
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('prepare_ecosystem_notification', { p_submission_id: 'synthetic-receipt', p_lease: 'lease' });
  });
  it.each([{ data: null, error: null }, { data: true, error: { message: 'private database failure' } }])('fails closed for invalid preparation %j', async ({ data, error }) => {
    notification(true, data, error);
    const response = await handleMaintenance(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database failure');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rechecks suppression for each claimed item after a preceding send', async () => {
    mocks.env.ECOSYSTEM_NOTIFICATIONS_ENABLED = 'true';
    let suppressed = false;
    mocks.rpc.mockImplementation(async (name) => {
      if (name === 'claim_ecosystem_notifications') return { data: [{ submission_id: 'first', lease: 'lease-one' }, { submission_id: 'second', lease: 'lease-two' }], error: null };
      if (name === 'prepare_ecosystem_notification') return { data: !suppressed, error: null };
      return { data: true, error: null };
    });
    vi.mocked(fetch).mockImplementationOnce(async () => {
      suppressed = true;
      return new Response(JSON.stringify({ id: providerId }));
    });
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenLastCalledWith('prepare_ecosystem_notification', { p_submission_id: 'second', p_lease: 'lease-two' });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'finish_ecosystem_notification')).toHaveLength(1);
  });

});
