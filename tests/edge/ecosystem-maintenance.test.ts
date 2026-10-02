import { beforeEach, describe, expect, it, vi } from 'vitest';
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
describe('ecosystem retention and notification delivery', () => {
  beforeEach(() => {
    mocks.env.ECOSYSTEM_NOTIFICATIONS_ENABLED = 'false';
    mocks.env.RESEND_API_KEY = 'synthetic-provider-key';
    delete mocks.env.MEMBER_NOTIFICATIONS_RESEND_KEY;
    delete mocks.env.ECOSYSTEM_MAINTENANCE_KEY;
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });
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
    mocks.env.ECOSYSTEM_NOTIFICATIONS_ENABLED = 'true';
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ data: [{ submission_id: 'synthetic-receipt', lease: 'lease' }], error: null }).mockResolvedValueOnce({ error: null });
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 1 });
    const providerRequest = vi.mocked(fetch).mock.calls[0][1];
    expect(providerRequest?.headers).toMatchObject({ 'idempotency-key': 'ecosystem:synthetic-receipt' });
    expect(JSON.parse(String(providerRequest?.body)).text).toContain('/admin/ecosystem');
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', { p_submission_id: 'synthetic-receipt', p_lease: 'lease', p_success: true });
  });
  it('leaves a failed provider attempt available to the durable queue', async () => {
    mocks.env.ECOSYSTEM_NOTIFICATIONS_ENABLED = 'true';
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ data: [{ submission_id: 'synthetic-receipt', lease: 'lease' }], error: null }).mockResolvedValueOnce({ error: null });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_ecosystem_notification', { p_submission_id: 'synthetic-receipt', p_lease: 'lease', p_success: false });
  });
  it('can reuse the existing scoped Resend key without duplicating credentials', async () => {
    mocks.env.ECOSYSTEM_NOTIFICATIONS_ENABLED = 'true';
    delete mocks.env.RESEND_API_KEY;
    mocks.env.MEMBER_NOTIFICATIONS_RESEND_KEY = 'synthetic-existing-scoped-key';
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ data: [{ submission_id: 'synthetic-receipt', lease: 'lease' }], error: null }).mockResolvedValueOnce({ error: null });
    expect(await (await handleMaintenance(request())).json()).toEqual({ cleaned: true, sent: 1 });
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer synthetic-existing-scoped-key' });
  });
});
