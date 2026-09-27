import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { Webhook } from 'svix';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
const source = readFileSync(`${process.cwd()}/supabase/functions/member-notification-events/index.ts`, 'utf8').replace(/^import .*;\n/gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const key = Buffer.from('synthetic-webhook-secret-never-real');
const secret = `whsec_${key.toString('base64')}`;
const providerId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const event = { type: 'email.delivered', created_at: '2026-09-27T01:00:00.123Z', data: { email_id: providerId, to: ['private@example.test'], subject: 'Do not retain me' } };
function fixture({ enabled = 'true', configuredSecret = secret, result = true, error = null, reject = false } = {}) {
  const rpc = vi.fn(() => ({ abortSignal: vi.fn(() => reject ? Promise.reject(new Error('private diagnostics')) : Promise.resolve({ data: result, error })) }));
  const admin = vi.fn(() => ({ rpc }));
  let handler;
  new Function('Deno', 'adminClient', 'Webhook', code)({ env: { get: (name) => ({ MEMBER_NOTIFICATIONS_WEBHOOK_ENABLED: enabled, MEMBER_NOTIFICATIONS_WEBHOOK_SECRET: configuredSecret })[name] }, serve: (fn) => { handler = fn; } }, admin, Webhook);
  function request({ raw = JSON.stringify(event), id = 'msg_synthetic_event', timestamp = Math.floor(Date.now() / 1000), body = raw, method = 'POST', headers = {} } = {}) {
    const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
    return new Request('https://example.test/functions/v1/member-notification-events', { method, headers: { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}`, ...headers }, ...(method === 'GET' ? {} : { body, duplex: 'half' }) });
  }
  return { handler, request, admin, rpc };
}
afterEach(() => vi.useRealTimers());
it('verifies a real HMAC over exact raw bytes and persists only the minimal delivery event', async () => {
  const f = fixture();
  const result = await f.handler(f.request({ raw: JSON.stringify(event, null, 2) }));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ received: true });
  expect(f.rpc).toHaveBeenCalledWith('record_member_notification_event', { p_event_id: 'msg_synthetic_event', p_provider_id: providerId, p_event_type: 'email.delivered', p_occurred_at: event.created_at });
  expect(JSON.stringify(f.rpc.mock.calls)).not.toContain('private@example.test');
  expect(f.rpc.mock.results[0].value.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
});
it.each([true, false])('passes repeated signed events to atomic DB deduplication (inserted=%s)', async (result) => {
  const f = fixture({ result });
  for (let i = 0; i < 2; i++) expect((await f.handler(f.request())).status).toBe(200);
  expect(f.rpc.mock.calls[0]).toEqual(f.rpc.mock.calls[1]);
});
it.each(['email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained', 'email.failed', 'email.suppressed'])('accepts signed %s events', async (type) => {
  const f = fixture(); expect((await f.handler(f.request({ raw: JSON.stringify({ ...event, type }) }))).status).toBe(200);
  expect(f.rpc.mock.calls[0][1].p_event_type).toBe(type);
});
it.each([{ enabled: '' }, { configuredSecret: '' }, { configuredSecret: 'invalid' }])('fails closed before DB access for configuration %j', async (options) => {
  const f = fixture(options); expect((await f.handler(f.request())).status).toBe(503); expect(f.admin).not.toHaveBeenCalled();
});
it.each(['GET', 'PUT', 'OPTIONS'])('rejects %s', async (method) => {
  const f = fixture(); expect((await f.handler(f.request({ method }))).status).toBe(405); expect(f.admin).not.toHaveBeenCalled();
});
it.each([{ body: JSON.stringify({ ...event, type: 'email.bounced' }) }, { headers: { 'svix-id': 'msg_replaced' } }, { headers: { 'svix-signature': '' } }, { headers: { 'svix-timestamp': 'abc' } }, { headers: { 'svix-signature': 'v1,bad' } }])('rejects unsigned or tampered content %j', async (options) => {
  const f = fixture(); expect((await f.handler(f.request(options))).status).toBe(401); expect(f.admin).not.toHaveBeenCalled();
});
it.each([-301, 301])('rejects signed timestamps outside five-minute tolerance (%s)', async (offset) => {
  const f = fixture(); expect((await f.handler(f.request({ timestamp: Math.floor(Date.now() / 1000) + offset }))).status).toBe(401); expect(f.admin).not.toHaveBeenCalled();
});
it('accepts a valid rotated signature among multiple versions', async () => {
  const f = fixture(); const request = f.request(); request.headers.set('svix-signature', `v1,bad ${request.headers.get('svix-signature')}`);
  expect((await f.handler(request)).status).toBe(200);
});
it.each(['{broken', 'null', '[]', '{}', JSON.stringify({ ...event, data: {} }), JSON.stringify({ ...event, data: { email_id: 'invalid' } }), JSON.stringify({ ...event, created_at: 'yesterday' })])('rejects signed malformed payload %s', async (raw) => {
  const f = fixture(); expect((await f.handler(f.request({ raw }))).status).toBe(400); expect(f.admin).not.toHaveBeenCalled();
});
it('ignores an unsupported event only after authenticating it', async () => {
  const f = fixture(); const raw = JSON.stringify({ type: 'email.opened' });
  expect(await (await f.handler(f.request({ raw }))).json()).toEqual({ ignored: true });
  expect((await f.handler(f.request({ raw, headers: { 'svix-signature': 'v1,bad' } }))).status).toBe(401);
  expect(f.admin).not.toHaveBeenCalled();
});
it('rejects a body exceeding 64 KiB without using the database', async () => {
  const f = fixture(); expect((await f.handler(f.request({ raw: 'x'.repeat(65537) }))).status).toBe(400); expect(f.admin).not.toHaveBeenCalled();
});
it('cancels a stalled request body at five seconds', async () => {
  vi.useFakeTimers(); const f = fixture(); const cancel = vi.fn();
  const promise = f.handler(f.request({ body: new ReadableStream({ cancel }) }));
  await vi.advanceTimersByTimeAsync(5001);
  expect((await promise).status).toBe(400); expect(cancel).toHaveBeenCalled(); expect(f.admin).not.toHaveBeenCalled();
});
it.each([{ error: { message: 'private SQL details' } }, { result: null }, { reject: true }])('requests provider retry on persistence failure %j', async (options) => {
  const f = fixture(options); const result = await f.handler(f.request()); expect(result.status).toBe(503); expect(await result.text()).not.toContain('private');
});
