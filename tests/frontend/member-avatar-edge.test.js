import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.Deno = { env: { get: () => undefined } }; });
import { HttpError } from '../../supabase/functions/_shared/http';
const source = readFileSync(`${process.cwd()}/supabase/functions/member-avatar/index.ts`, 'utf8').replace(/^import .*;\n/gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function setup({ found = null, scanError = null, stale = false } = {}) {
  const queries = [];
  const query = (table) => {
    const chain = { then: (resolve) => resolve({ error: null }), maybeSingle: async () => ({ data: found, error: null }) };
    for (const method of ['select','eq','is','not','gt','order','limit','insert']) chain[method] = (...args) => { queries.push([table, method, ...args]); return chain; };
    return chain;
  };
  const upload = vi.fn(async () => ({ error: null }));
  const download = vi.fn(async () => ({ data: new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]) }));
  const client = { from: query, storage: { from: () => ({ upload, download }) }, rpc: vi.fn(async (name) => ({ data: name === 'finish_member_avatar_change' ? !stale : 'operation', error: null })) };
  const scan = vi.fn(async (bytes) => { if (scanError) throw scanError; return bytes; });
  let handler;
  new Function('Deno','createClient','requiredEnv','corsHeaders','HttpError','json','adminClient','authenticatedUser','bearerToken','scanOnboardingImage', code)(
    { serve: (value) => { handler = value; }, env: { get: () => undefined } }, () => client, () => 'https://example.test', () => ({}), HttpError,
    (_request, value, status = 200) => Response.json(value, { status }), () => client, async () => ({ id: 'owner' }), () => 'session', scan,
  );
  return { handler, queries, upload, download, scan, client };
}
const consent = { use_profile_photo: true, consent_version: '2026-09-27-avatar-1' };
const post = (body = consent) => new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
it('does not download private bytes when scoped lookup denies access', async () => {
  const f = setup(); expect((await f.handler(new Request('https://example.test?user_id=other'))).status).toBe(404); expect(f.download).not.toHaveBeenCalled();
});
it('only reuses an unexpired own photo and fails closed when scanning fails', async () => {
  const f = setup({ found: { object_path: 'owner/photo' }, scanError: new HttpError(503, 'Scanner unavailable') });
  expect((await f.handler(post())).status).toBe(503);
  expect(f.queries).toContainEqual(['onboarding_documents','eq','kind','photo']);
  expect(f.queries).toContainEqual(['onboarding_documents','eq','user_id','owner']);
  expect(f.upload).not.toHaveBeenCalled();
});
it('rejects missing consent and oversized JSON before fetching a photo', async () => {
  const f = setup(); expect((await f.handler(post({}))).status).toBe(400);
  expect((await f.handler(post({ junk: 'x'.repeat(2000) }))).status).toBe(413);
  expect(f.download).not.toHaveBeenCalled();
});
it('rejects stale upload completion after removal', async () => {
  const f = setup({ found: { object_path: 'owner/photo' }, stale: true });
  expect((await f.handler(post())).status).toBe(409);
  expect(f.upload).toHaveBeenCalledTimes(1);
  expect(f.queries.some((q) => q[0] === 'member_avatar_cleanup' && q[1] === 'insert')).toBe(true);
});
it('deletes only the authenticated account and invalidates inflight uploads', async () => {
  const f = setup(); expect((await f.handler(new Request('https://example.test?user_id=other', { method: 'DELETE' }))).status).toBe(200);
  expect(f.client.rpc).toHaveBeenCalledWith('begin_member_avatar_change', { p_user_id: 'owner', p_remove: true });
});
function retention(removeFails) {
  const source = readFileSync(`${process.cwd()}/supabase/functions/onboarding-retention/index.ts`, 'utf8').replace(/^import .*;\n/gm, '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const erased = vi.fn();
  const chain = { select(){return this;},lte(){return this;},order(){return this;},limit: async () => ({ data: [{ object_path: 'old-avatar' }] }),delete(){return this;},eq: async () => { erased(); return {error:null}; } };
  const remove = vi.fn(async () => ({ error: removeFails ? new Error('retry') : null }));
  let handler;
  new Function('Deno','assertJobSecret','HttpError','json','adminClient',code)({ serve: (fn) => {handler=fn;},env:{get:()=> 'true'} },()=>{},HttpError,(_r,body,status=200)=>Response.json(body,{status}),()=>({ rpc: async ()=>({data:[]}),from:()=>chain,storage:{from:()=>({remove})} }));
  return {handler,erased,remove};
}
it('managed retention retries avatar storage failures without losing queued paths', async () => {
  const f=retention(true);
  expect((await f.handler(new Request('https://example.test',{method:'POST'}))).status).toBe(503);
  expect(f.erased).not.toHaveBeenCalled();
});
it('managed retention deletes queued bytes before acknowledging cleanup', async () => {
  const f=retention(false);
  const response=await f.handler(new Request('https://example.test',{method:'POST'}));
  expect(await response.json()).toMatchObject({avatarsDeleted:1,failed:0});
  expect(f.remove).toHaveBeenCalledWith(['old-avatar']);expect(f.erased).toHaveBeenCalledOnce();
});
