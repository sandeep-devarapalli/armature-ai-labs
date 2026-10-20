import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.Deno = { env: { get: () => undefined } }; });
import { HttpError } from '../../supabase/functions/_shared/http';
const source = ts.transpileModule(readFileSync('supabase/functions/member-directory-avatar/index.ts', 'utf8').replace(/^import .*;\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function setup({ available = true, withdrawn = false, failed = false } = {}) {
 let handler, reads = 0;
 const rpc = vi.fn(async () => ({ data: available && !(++reads > 1 && withdrawn) ? { object_path: 'scanned/photo.png', content_type: 'image/png' } : null }));
 const download = vi.fn(async () => ({ data: new Uint8Array([137,80,78,71]), error: failed ? Error('storage') : null }));
 const bucket = vi.fn(() => ({ download }));
 new Function('Deno', 'adminClient', 'corsHeaders', 'HttpError', 'errorResponse', source)(
  { serve: fn => handler = fn }, () => ({ rpc, storage: { from: bucket } }), () => ({}), HttpError,
  (_r, e) => Response.json({ error: e.message }, { status: e.status || 500 }),
 );
 return { handler, rpc, bucket, download };
}
const url = 'https://example.test?profile_id=60000000-0000-4000-8000-000000000001';
it('serves only explicitly authorised retained avatars without caching', async () => {
 const f = setup(); const r = await f.handler(new Request(url));
 expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toContain('no-store');
 expect(r.headers.get('x-content-type-options')).toBe('nosniff');
 expect(f.bucket).toHaveBeenCalledWith('member-avatars'); expect(f.rpc).toHaveBeenCalledTimes(2);
});
it('fails closed before reading bytes for unlisted or ineligible members', async () => {
 const f = setup({ available: false }); expect((await f.handler(new Request(url))).status).toBe(404); expect(f.download).not.toHaveBeenCalled();
});
it('rechecks withdrawal and replacement after fetching bytes', async () => {
 const f = setup({ withdrawn: true }); expect((await f.handler(new Request(url))).status).toBe(404);
});
it('fails closed on storage failures', async () => {
 const f = setup({ failed: true }); expect((await f.handler(new Request(url))).status).toBe(404);
});
it('rejects invalid profile identifiers and mutation requests without storage access', async () => {
 const f = setup(); expect((await f.handler(new Request('https://example.test?profile_id=bad'))).status).toBe(404);
 expect((await f.handler(new Request(url, { method: 'POST' }))).status).toBe(405); expect(f.rpc).not.toHaveBeenCalled();
});
