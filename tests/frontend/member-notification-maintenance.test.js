import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
const transpile = (path) => ts.transpileModule(readFileSync(path, 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const code = transpile('supabase/functions/member-notification-maintenance/index.ts');
const envCode = transpile('supabase/functions/_shared/env.ts');
const atlasCounts = ['atlas_queue_overdue', 'atlas_expired_leases', 'atlas_unknown', 'atlas_failed', 'atlas_delivery_failed', 'atlas_delivery_unconfirmed'];
const healthy = { sending_enabled: false, cleanup_enabled: false, last_cleanup_at: null, cleanup_overdue: false, held: 0, queue_overdue: 0, expired_leases: 0, unknown: 0, failed: 0, delivery_unconfirmed: 0, unmatched_receipts: 0, history_due: 0, ...Object.fromEntries(atlasCounts.map(key => [key, 0])) };
function fixture({ enabled='true', apply='', secret='x'.repeat(32), fail='', health={}, remaining=false }={}) {
 const Deno = { env: { get: (name) => ({ MEMBER_NOTIFICATIONS_MAINTENANCE_ENABLED: enabled, MEMBER_NOTIFICATIONS_CLEANUP_APPLY: apply, MEMBER_NOTIFICATIONS_MAINTENANCE_SECRET: secret })[name] }, serve: (fn) => { handler=fn; } };
 let handler;
 const { assertJobSecret } = new Function('Deno', 'HttpError', envCode + ';return {assertJobSecret};')(Deno, class extends Error {});
 const rpc = vi.fn((name,args) => ({ abortSignal: vi.fn(() => Promise.resolve({ error: name===fail ? { message:'private error' } : null, data: name==='maintain_member_notifications' ? { dry_run:args.p_dry_run, history:0, receipts:0, remaining } : {...healthy,...health} })) }));
 const admin = vi.fn(()=>({rpc}));
 const log=vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
 new Function('Deno','adminClient','assertJobSecret',code)(Deno,admin,assertJobSecret);
 const request = (options={})=> new Request('https://example.test/maintenance',{method:'POST',headers:{'x-armature-job-secret':'x'.repeat(32)},...options});
 return {handler,request,rpc,admin,log};
}
afterEach(()=>{ vi.restoreAllMocks(); vi.useRealTimers(); });
it('defaults to dry-run, bounded batch, and aggregate monitoring',async()=>{
 const f=fixture();const r=await f.handler(f.request());expect(r.status).toBe(200);
 expect(f.rpc).toHaveBeenCalledWith('maintain_member_notifications',{p_dry_run:true,p_limit:100});
 expect(f.rpc).toHaveBeenCalledWith('notification_delivery_health');
 expect((await r.json()).attention).toBe(false);
 expect(f.log.mock.calls[0][0]).not.toContain('x'.repeat(32));
});
it.each([{enabled:''},{secret:''},{secret:'short'}])('fails closed for configuration %j',async(options)=>{
 const f=fixture(options);expect((await f.handler(f.request())).status).toBe(503);expect(f.admin).not.toHaveBeenCalled();
});
it.each(['wrong','x'.repeat(257)])('rejects invalid credentials before DB access',async(credential)=>{
 const f=fixture();expect((await f.handler(f.request({headers:{'x-armature-job-secret':credential}}))).status).toBe(401);expect(f.admin).not.toHaveBeenCalled();
});
it.each(['GET','PUT'])('rejects method %s',async(method)=>{const f=fixture();expect((await f.handler(f.request({method}))).status).toBe(405);expect(f.admin).not.toHaveBeenCalled();});
it('accepts an empty HTTP body stream',async()=>{
 const f=fixture();expect((await f.handler(f.request({body:''}))).status).toBe(200);
});
it('rejects request payloads without database access',async()=>{
 const f=fixture();expect((await f.handler(f.request({body:'{}'}))).status).toBe(400);expect(f.admin).not.toHaveBeenCalled();
});
it('bounds a stalled incoming stream before database access',async()=>{
 vi.useFakeTimers();const f=fixture();const body=new ReadableStream({start(){}});
 const result=f.handler(f.request({body,duplex:'half'}));await vi.advanceTimersByTimeAsync(2001);
 expect((await result).status).toBe(408);expect(f.admin).not.toHaveBeenCalled();
});
it('only the separate apply environment flag requests mutation',async()=>{
 const f=fixture({apply:'true'});expect((await f.handler(f.request())).status).toBe(200);
 expect(f.rpc).toHaveBeenCalledWith('maintain_member_notifications',{p_dry_run:false,p_limit:100});
});
it.each(['queue_overdue','expired_leases','unknown','failed','delivery_unconfirmed','unmatched_receipts','cleanup_overdue',...atlasCounts])('reports actionable %s',async(key)=>{
 const f=fixture({health:{[key]:key==='cleanup_overdue'?true:1}});expect((await (await f.handler(f.request())).json()).attention).toBe(true);
});
it('does not alert solely for held events or dry-run backlog',async()=>{
 const f=fixture({health:{held:99,history_due:99},remaining:true});expect((await (await f.handler(f.request())).json()).attention).toBe(false);
});
it('alerts if applied cleanup leaves backlog',async()=>{
 const f=fixture({apply:'true',remaining:true});expect((await (await f.handler(f.request())).json()).attention).toBe(true);
});
it.each(['maintain_member_notifications','notification_delivery_health'])('fails safely for %s',async(fail)=>{
 const f=fixture({fail});const r=await f.handler(f.request());expect(r.status).toBe(503);expect(await r.text()).not.toContain('private error');
 if(fail==='maintain_member_notifications')expect(f.rpc).toHaveBeenCalledTimes(1);
});
