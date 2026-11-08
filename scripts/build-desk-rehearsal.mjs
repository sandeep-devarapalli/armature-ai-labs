import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const stagingBackend = 'https://gwrdmpvczwuypvvzfyty.supabase.co';
export const stagingOrigin = 'https://booking-staging.armature-lab.pages.dev';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = text => createHash('sha256').update(text).digest('hex');
function once(source, from, to) {
  if (source.split(from).length !== 2) throw new Error(`Rehearsal source changed: ${from}`);
  return source.replace(from, to);
}
export function adapt(name, source) {
  if (name === '_shared/live-desk-payment.ts') {
    source = once(source, 'https://uxfhdfagrmaeyuaipaar.supabase.co', stagingBackend);
    source = once(source, '/^rzp_live_', '/^rzp_test_');
    source = source.replaceAll('LIVE_DESK_', 'REHEARSAL_DESK_');
  }
  if (name === '_shared/desk-checkout.ts') {
    source = once(source, 'live: { origin: "https://armatureailabs.com"', `live: { origin: "${stagingOrigin}"`);
    source = once(source, 'const config = modeConfig[mode];', 'const config = modeConfig[deployment];\n  const mode = "test";');
    source = once(source, 'request: Request, mode: "test" | "live"', 'request: Request, deployment: "test" | "live"');
    source = once(source, 'const live = mode === "live";', 'const live = deployment === "live";');
    source = once(source, '(live ? "PANDADOC_API_KEY" : "PANDADOC_SANDBOX_KEY")', '"PANDADOC_SANDBOX_KEY"');
    source = source.replaceAll('LIVE_DESK_', 'REHEARSAL_DESK_').replaceAll('armature_live_desk', 'armature_rehearsal_desk');
  }
  if (source.includes('https://uxfhdfagrmaeyuaipaar.supabase.co') || source.includes('rzp_live_') || source.includes('LIVE_DESK_')) {
    throw new Error(`Production configuration remains in ${name}`);
  }
  return source;
}
export async function buildRehearsal() {
  const sources = resolve(root, 'supabase/functions');
  const files = new Map();
  async function collect(name) {
    if (files.has(name)) return;
    const original = await readFile(resolve(sources, name), 'utf8');
    const content = adapt(name, original);
    files.set(name, { original, content });
    for (const match of original.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const dependency = relative(sources, resolve(sources, dirname(name), match[1]));
      if (dependency.startsWith('..')) throw new Error('Dependency escaped functions directory');
      await collect(dependency);
    }
  }
  await collect('desk-checkout/index.ts');
  await collect('razorpay-booking-webhook/index.ts');
  const output = await mkdtemp(resolve(tmpdir(), 'armature-desk-rehearsal-'));
  for (const [name, { content }] of files) {
    const target = resolve(output, 'supabase/functions', name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await writeFile(resolve(output, 'supabase/functions/deno.json'), await readFile(resolve(sources, 'deno.json')));
  await writeFile(resolve(output, 'supabase/config.toml'), 'project_id = "gwrdmpvczwuypvvzfyty"\n\n[functions.desk-checkout]\nverify_jwt = false\n\n[functions.razorpay-booking-webhook]\nverify_jwt = false\n');
  const manifest = { backend: stagingBackend, origin: stagingOrigin, mode: 'test', secretPrefix: 'REHEARSAL_DESK_',
    files: [...files].map(([name, data]) => ({ name, sourceSha256: sha(data.original), bundleSha256: sha(data.content) })) };
  await writeFile(resolve(output, 'rehearsal-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildRehearsal());
