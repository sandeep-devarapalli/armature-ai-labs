import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memberNotificationTemplate } from '../../supabase/functions/_shared/member-notification-templates.ts';
const source = readFileSync(`${process.cwd()}/supabase/functions/member-notifications/index.ts`, 'utf8').replace(/^import .*;\n/gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const token = 'synthetic-worker-token-never-a-real-secret';
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const lease = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const providerId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const row = { id, lease_token: lease, kind: 'approved', recipient_email: 'synthetic@example.test', template_version: 1, first_attempt_at: null };
function fixture({ enabled = 'true', secret = token, wakeupKey = '', key = 're_synthetic_dedicated_key', rows = [row], prepare = true, finish = true, rpcError = null, fetcher = async () => Response.json({ id: providerId }) } = {}) {
  const env = { MEMBER_NOTIFICATIONS_WAKEUP_KEY: wakeupKey, MEMBER_NOTIFICATIONS_ENABLED: enabled, MEMBER_NOTIFICATIONS_WORKER_TOKEN: secret, MEMBER_NOTIFICATIONS_RESEND_KEY: key };
  let sending = false;
  const rpc = vi.fn((name) => ({ abortSignal: () => {
    if(name === 'prepare_member_notification') sending = prepare;
    const data = name === 'claim_member_notifications' ? rows : name === 'prepare_member_notification' ? prepare : sending && finish;
    return Promise.resolve({error:rpcError === name ? {} : null,data});
  } }));
  const admin = vi.fn(() => ({ rpc }));
  const fetch = vi.fn(fetcher);
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  let handler;
  new Function('Deno', 'adminClient', 'memberNotificationTemplate', 'fetch', 'console', code)(
    { env: { get: (name) => env[name] }, serve: (value) => { handler = value; } }, admin, memberNotificationTemplate, fetch, logger,
  );
  const request = ({ supplied = token, method = 'POST', body } = {}) => new Request('https://example.test/functions/v1/member-notifications', { method, headers: { 'x-armature-job-secret': supplied }, ...(body === undefined ? {} : { body }) });
  return { handler, request, rpc, admin, fetch, logger };
}
afterEach(() => vi.useRealTimers());
it('disabled worker cannot construct an admin client, claim or fetch', async () => {
  const disabled = fixture({ enabled: '' });
  expect((await disabled.handler(disabled.request())).status).toBe(503);
  expect(disabled.admin).not.toHaveBeenCalled(); expect(disabled.rpc).not.toHaveBeenCalled(); expect(disabled.fetch).not.toHaveBeenCalled();
});
it.each(['GET', 'PUT', 'OPTIONS'])('rejects %s without admin or outbound access', async (method) => {
  const f = fixture(); expect((await f.handler(f.request({ method }))).status).toBe(405); expect(f.admin).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
});
it.each(['', 'wrong', `${token}extra`])('rejects invalid worker token before claims', async (supplied) => {
  const f = fixture(); expect((await f.handler(f.request({ supplied }))).status).toBe(401); expect(f.admin).not.toHaveBeenCalled();
});
it.each([{secret:'short'}, {key:''}, {key:'smtp-secret'}, {secret:'x'.repeat(257)}])('fails closed for invalid configuration %j', async (options) => {
  const f = fixture(options); expect((await f.handler(f.request())).status).toBe(503); expect(f.admin).not.toHaveBeenCalled();
});
it.each(['{"to":"attacker@example.test"}', 'x'.repeat(513), '{invalid'])('rejects caller payload before queue access', async (body) => {
  const f = fixture(); expect((await f.handler(f.request({body}))).status).toBe(400); expect(f.rpc).not.toHaveBeenCalled();
});
it('revalidates a lease immediately before sending and reuses stable provider identity', async () => {
  const f = fixture();
  for (let i=0;i<2;i++) expect(await (await f.handler(f.request())).json()).toMatchObject({accepted:1});
  expect(f.rpc.mock.calls.slice(0,3).map(([name])=>name)).toEqual(['claim_member_notifications','prepare_member_notification','finish_member_notification']);
  expect(f.rpc).toHaveBeenCalledWith('claim_member_notifications', {p_limit:10});
  expect(f.fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(`member-${id}-v1`);
  expect(f.fetch.mock.calls[0][1].body).toBe(f.fetch.mock.calls[1][1].body);
  const message = JSON.parse(f.fetch.mock.calls[0][1].body);
  expect(message).toMatchObject({from:'Armature AI Labs <no-reply@mail.armatureailabs.com>',to:['synthetic@example.test'],reply_to:'hello@armatureailabs.com'});
  expect(f.fetch.mock.calls[0][1].redirect).toBe('error');
  expect(f.rpc).toHaveBeenCalledWith('finish_member_notification',{p_id:id,p_lease_token:lease,p_outcome:'accepted',p_provider_id:providerId});
});
it('does not send or finish an event whose preparation was refused', async () => {
  const f=fixture({prepare:false}); expect(await(await f.handler(f.request())).json()).toMatchObject({skipped:1,accepted:0}); expect(f.fetch).not.toHaveBeenCalled(); expect(f.rpc.mock.calls).toHaveLength(2);
});
it.each([429,500,503])('retries provider %s without exposing response details', async (status) => {
  const f=fixture({fetcher:async()=>new Response('private-provider-diagnostics',{status})});
  const result=await(await f.handler(f.request())).json(); expect(result).toMatchObject({retry:1,accepted:0}); expect(JSON.stringify(result)).not.toContain('private');
});
it.each([400,401,403,422])('makes provider %s a final failure', async (status)=>{
  const f=fixture({fetcher:async()=>new Response('private',{status})}); expect(await(await f.handler(f.request())).json()).toMatchObject({failed:1,retry:0});
});
it('bounds hanging requests and marks transport uncertainty for bounded retries', async()=>{
  vi.useFakeTimers();
  const f=fixture({fetcher:(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('timeout'))))});
  const pending=f.handler(f.request()); await vi.advanceTimersByTimeAsync(8_001);
  expect(await(await pending).json()).toMatchObject({retry:1});
});
it.each(['not-json','{}','{"id":"not-a-provider-id"}','x'.repeat(4097)])('successful provider responses with unusable IDs require reconciliation',async(body)=>{
  const f=fixture({fetcher:async()=>new Response(body,{status:200})}); expect(await(await f.handler(f.request())).json()).toMatchObject({unknown:1,retry:0,accepted:0});
});
it('does not report accepted when persistence fails',async()=>{
  const f=fixture({finish:false}); const result=await f.handler(f.request()); expect(result.status).toBe(503); expect(await result.json()).toMatchObject({accepted:0,error:'notification_run_failed'});
});
it.each([{kind:'unknown'}, {kind:'toString'}, {template_version:2}, {recipient_email:'attacker@example.test\r\nBcc:bad@example.test'}])('rejects unsupported or unsafe claimed content %j',async(change)=>{
  const f=fixture({rows:[{...row,...change}]}); expect(await(await f.handler(f.request())).json()).toMatchObject({failed:1}); expect(f.fetch).not.toHaveBeenCalled();
});
it('does not send outside the conservative provider idempotency window',async()=>{
  const f=fixture({rows:[{...row,first_attempt_at:new Date(Date.now()-23*60*60_000).toISOString()}]}); expect(await(await f.handler(f.request())).json()).toMatchObject({unknown:1}); expect(f.fetch).not.toHaveBeenCalled();
});
it('stops the batch before the processing deadline even with slow successful sends',async()=>{
  vi.useFakeTimers();
  const f=fixture({rows:Array.from({length:10},()=>row),fetcher:async()=>{ await new Promise(resolve=>setTimeout(resolve,7_500)); return Response.json({id:providerId}); }});
  const pending=f.handler(f.request()); await vi.advanceTimersByTimeAsync(61_000);
  expect(await(await pending).json()).toMatchObject({accepted:7,skipped:3});
});
describe('immutable privacy-preserving templates',()=>{
  it.each(['registration_saved','ready','resubmission_ready','admin_ready','corrections_requested','approved','rejected','revoked','reinstated'])('%s has only canonical authenticated portal links and no injected personal data',kind=>{
    const template=memberNotificationTemplate(kind,1); expect(template).toBeTruthy();
    const links=[...template.html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]);
    expect(links).toEqual([kind==='admin_ready'?'https://armatureailabs.com/admin/members':'https://armatureailabs.com/onboarding']);
    expect(template.html).not.toMatch(/<img|<script|tracking|token=|storage\/|signed/i);
    expect(template.subject).not.toMatch(/approved|rejected|revoked/i);
    if(kind==='admin_ready') expect(template.text).not.toContain('synthetic@example.test');
  });
  it('lists submitted details in new admin alerts without changing version-one retries', () => {
    const original = memberNotificationTemplate('admin_ready', 1);
    const submitted = memberNotificationTemplate('admin_ready', 2);
    expect(original.text).toBe('An application is ready for review. Open https://armatureailabs.com/admin/members and sign in with your authorised reviewer account. Review identity documents only inside the protected portal. Do not download or retain copies.');
    for (const detail of ['full name', 'email', 'phone number', 'LinkedIn URL', 'date of birth', 'privacy acceptance', 'scanned profile photo', 'scanned government ID']) expect(submitted.text).toContain(detail);
    expect(submitted.text).toContain('Guardian permission, where required, must still be reviewed');
    expect(submitted.html).not.toMatch(/<img|storage\/|signed|token=/i);
    expect(memberNotificationTemplate('admin_ready', 3)).toBeNull();
  });
  it('rejects unsupported template versions without silently switching payloads',()=>expect(memberNotificationTemplate('approved',2)).toBeNull());
});

it.each([['concurrent_idempotent_requests','retry'],['invalid_idempotent_request','failed']])('classifies provider409 %s as %s',async(name,outcome)=>{
  const f=fixture({fetcher:async()=>Response.json({name},{status:409})}); expect(await(await f.handler(f.request())).json()).toMatchObject({[outcome]:1});
});

it('rejects an unfinished request body within five seconds without admin access',async()=>{
  vi.useFakeTimers(); const f=fixture();
  const request=new Request('https://example.test',{method:'POST',headers:{'x-armature-job-secret':token},body:new ReadableStream({start(){}}),duplex:'half'});
  const pending=f.handler(request); await vi.advanceTimersByTimeAsync(5_001);
  expect((await pending).status).toBe(400); expect(f.admin).not.toHaveBeenCalled();
});

it('does not automatically retry an unparseable409 conflict',async()=>{
  const f=fixture({fetcher:async()=>new Response('not-json',{status:409})}); expect(await(await f.handler(f.request())).json()).toMatchObject({unknown:1,retry:0});
});

it('accepts fresh scoped wakeup signatures and rejects stale, future and forged signatures', async () => {
  const key = 'synthetic-wakeup-signing-key-at-least-32-chars';
  const f = fixture({ wakeupKey: key, rows: [] });
  const now = Math.floor(Date.now()/1000);
  for (const [stamp, valid, status] of [[now,true,200],[now-31,true,401],[now+10,true,401],[now,false,401]]) {
    const signature = createHmac('sha256',key).update(`member-notifications:${stamp}`).digest('hex');
    const req = new Request('https://example.test', {method:'POST',headers:{'x-armature-wakeup-time':String(stamp),'x-armature-wakeup-signature':valid?signature:'a'.repeat(64)},body:'{}'});
    expect((await f.handler(req)).status).toBe(status);
  }
  expect(f.rpc).toHaveBeenCalledTimes(1);
});

const authRejectedClaim = { data: null, status: 401, error: { code: 'PGRST303', message: 'private-auth-diagnostic', details: 'private-token' } };
it('recovers an authentication-rejected claim once before making exactly one provider send', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.rpc.mockImplementationOnce(() => ({ abortSignal: () => Promise.resolve(authRejectedClaim) }));
  const pending = f.handler(f.request());
  await vi.advanceTimersByTimeAsync(2_999);
  expect(f.rpc).toHaveBeenCalledTimes(1);
  expect(f.fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ claimed: 1, accepted: 1 });
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['claim_member_notifications', 'claim_member_notifications', 'prepare_member_notification', 'finish_member_notification']);
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(f.fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(`member-${id}-v1`);
  expect(JSON.parse(f.logger.info.mock.calls[0][0])).toMatchObject({ recovered: true });
  expect(JSON.stringify([f.logger.warn.mock.calls, f.logger.info.mock.calls])).not.toMatch(/private|synthetic@|token/);
});
it('keeps persistent authentication failure actionable without sending or retrying again', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve(authRejectedClaim) }));
  const pending = f.handler(f.request());
  await vi.advanceTimersByTimeAsync(3_000);
  const result = await pending;
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({ claimed: 0, error: 'notification_run_failed' });
  expect(f.rpc).toHaveBeenCalledTimes(2);
  expect(f.fetch).not.toHaveBeenCalled();
  expect(JSON.parse(f.logger.info.mock.calls[0][0])).toMatchObject({ recovered: false });
  expect(JSON.stringify(f.logger.error.mock.calls)).not.toMatch(/private|token/);
});
it.each([[401, 'PGRST301'], [500, 'PGRST303'], [0, ''], [503, 'PGRST000']])('does not retry other claim failures (%s/%s)', async (status, code) => {
  const f = fixture();
  f.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: null, status, error: { code } }) }));
  expect((await f.handler(f.request())).status).toBe(503);
  expect(f.rpc).toHaveBeenCalledTimes(1);
  expect(f.fetch).not.toHaveBeenCalled();
});
it('does not replay a claim after an ambiguous transport failure', async () => {
  const f = fixture();
  f.rpc.mockImplementation(() => ({ abortSignal: () => Promise.reject(new Error('transport timeout')) }));
  expect((await f.handler(f.request())).status).toBe(503);
  expect(f.rpc).toHaveBeenCalledTimes(1);
  expect(f.fetch).not.toHaveBeenCalled();
});
