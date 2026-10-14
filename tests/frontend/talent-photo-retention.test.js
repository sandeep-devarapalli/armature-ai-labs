import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = readFileSync('supabase/functions/onboarding-retention/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function setup({ enabled = true, documents = 0, avatars = 0, equipment = 0, removeFails = false, acknowledgeFails = false } = {}) {
  let handler;
  const events = [];
  const limits = [];
  const queried = vi.fn();
  const from = table => ({
    select() { queried(table); return this; },
    lte(column, value) { events.push(['due', table, column, value]); return this; },
    order() { return this; },
    async limit(limit) {
      limits.push([table, limit]);
      const count = table === 'member_avatar_cleanup' ? avatars : 2;
      return { data: Array.from({ length: Math.min(count, limit) }, (_, i) => ({ object_path: `${table}-${i}` })), error: null };
    },
    delete() { return this; },
    async eq(column, path) { events.push(['ack', table, path]); return { error: table === 'talent_photo_cleanup' && acknowledgeFails ? Error('retry') : null }; },
  });
  new Function('Deno', 'assertJobSecret', 'HttpError', 'json', 'adminClient', code)(
    { serve: fn => { handler = fn; }, env: { get: name => name === 'ONBOARDING_RETENTION_ENABLED' || name === 'EQUIPMENT_WISHLIST_CLEANUP_ENABLED' || (enabled && name === 'TALENT_PHOTO_CLEANUP_ENABLED') ? 'true' : undefined } },
    () => {}, class extends Error {}, (_r, body, status = 200) => Response.json(body, { status }),
    () => ({ from, storage: { from: bucket => ({ remove: async paths => { events.push(['remove', bucket, ...paths]); return { error: bucket === 'talent-profile-photos' && removeFails ? Error('retry') : null }; } }) },
      rpc: async (name, args) => { queried(name); if (name === 'claim_talent_photo_cleanup') { limits.push(['talent_photo_cleanup', args.p_limit]); return { data: Array.from({ length: Math.min(2, args.p_limit) }, (_, i) => ({ object_path: `talent_photo_cleanup-${i}` })), error: null }; } return ({ data: name === 'list_due_onboarding_documents' ? Array.from({ length: documents }, (_, id) => ({ id, object_path: `document-${id}` })) : name === 'claim_equipment_wish_images' ? Array.from({ length: equipment }, (_, id) => ({ object_path: `equipment-${id}` })) : null, error: null }); },
    }),
  );
  return { run: () => handler(new Request('https://local.test', { method: 'POST' })), events, queried, limits };
}
it('requires explicit talent cleanup activation', async () => {
  const f = setup({ enabled: false });
  expect(await (await f.run()).json()).toEqual({ examined: 0, deleted: 0, failed: 0 });
  expect(f.queried).not.toHaveBeenCalledWith('claim_talent_photo_cleanup');
});
it('deletes only the directory copy before acknowledging the due queue entry', async () => {
  const f = setup();
  expect(await (await f.run()).json()).toEqual({ examined: 2, deleted: 2, failed: 0 });
  expect(f.queried).toHaveBeenCalledWith('claim_talent_photo_cleanup');
  expect(f.events.filter(e => e[0] !== 'due')).toEqual([
    ['remove', 'talent-profile-photos', 'talent_photo_cleanup-0'], ['ack', 'talent_photo_cleanup', 'talent_photo_cleanup-0'],
    ['remove', 'talent-profile-photos', 'talent_photo_cleanup-1'], ['ack', 'talent_photo_cleanup', 'talent_photo_cleanup-1'],
  ]);
});
it('shares the 100 record limit with documents, avatars and equipment', async () => {
  const f = setup({ documents: 96, avatars: 1, equipment: 2 });
  expect(await (await f.run()).json()).toEqual({ examined: 100, deleted: 100, failed: 0 });
  expect(f.limits).toContainEqual(['talent_photo_cleanup', 1]);
  const full = setup({ documents: 100 });
  await full.run();
  expect(full.queried).not.toHaveBeenCalledWith('claim_talent_photo_cleanup');
});
it('retains removal failures for retry and reports acknowledgement failures', async () => {
  const f = setup({ removeFails: true });
  const response = await f.run();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ examined: 2, deleted: 0, failed: 2 });
  expect(f.events.filter(e => e[0] === 'ack')).toEqual([]);
  const failedAck = await setup({ acknowledgeFails: true }).run();
  expect(failedAck.status).toBe(503);
  expect(await failedAck.json()).toEqual({ examined: 2, deleted: 0, failed: 2 });
});
