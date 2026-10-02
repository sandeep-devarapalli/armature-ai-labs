import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEcosystemData } from '../supabase/functions/_shared/ecosystem-validation.ts';

const allowed = new Set(['schemaVersion', 'id', 'kind', 'targetSlug', 'baseRevision', 'data', 'publicationConsent']);
const privateKeys = /^(submitter.*|reviewer.*|ip_?hash|private.*|email|phone)$/i;
function rejectPrivateFields(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (privateKeys.test(key)) throw new Error('Private contact or review fields cannot be committed. Use the website for private follow-up.');
    rejectPrivateFields(item);
  }
}
export function validateContribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Contribution must be a JSON object.');
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('Unsupported contribution field.');
  rejectPrivateFields(value);
  if (value.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9-]{2,99}$/.test(value.id || '')) throw new Error('Use schemaVersion 1 and a unique lowercase contribution id.');
  if (!['new', 'edit'].includes(value.kind) || value.publicationConsent !== true) throw new Error('Choose new or edit and explicitly permit publication of all listing details.');
  if (value.kind === 'edit' && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.targetSlug || '') || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 1)) throw new Error('Edits need the published targetSlug and baseRevision.');
  if (value.kind === 'new' && (value.targetSlug != null || value.baseRevision != null)) throw new Error('New entries cannot have an edit target.');
  const data = validateEcosystemData(value.data);
  if (value.kind === 'new' && !data.slug) throw new Error('New GitHub entries require a stable public slug so later imports remain idempotent.');
  if (value.kind === 'edit' && data.slug && data.slug !== value.targetSlug) throw new Error('An edit cannot change the listing identifier.');
  return { ...value, data };
}
function identityName(data) { return data.name.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function identityUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  return `${url.host.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${url.search}`;
}
export function findExistingListing(data, listings) {
  const urls = [data.websiteUrl, data.sourceUrl].map(identityUrl).filter(Boolean);
  return listings.find(row => row.slug === data.slug || identityName(row.data) === identityName(data) || [row.data.websiteUrl, row.data.sourceUrl].some(value => value && urls.includes(identityUrl(value))));
}
export function prepareImports(contributions, listings = []) {
  const ids = new Set();
  const newListings = [...listings];
  return contributions.map(raw => {
    const entry = validateContribution(raw);
    if (ids.has(entry.id)) throw new Error(`Duplicate contribution id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.kind === 'new') {
      const existing = findExistingListing(entry.data, newListings);
      if (existing) throw new Error(`Existing organisation ${existing.slug}; submit an explicit revision-bound edit instead.`);
      newListings.push({ slug: entry.data.slug || entry.id, data: entry.data });
    }
    return {
      p_import_key: `github:${entry.id}`, p_kind: entry.kind === 'edit' ? 'update' : 'new',
      p_target_slug: entry.targetSlug || null, p_base_revision: entry.baseRevision || null,
      p_proposed: entry.data,
    };
  });
}
export async function loadContributions(directory) {
  const result = [];
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
    if (!/^[a-z0-9][a-z0-9-]*\.json$/.test(name)) throw new Error('Contribution filenames must use lowercase letters, numbers and hyphens.');
    const path = resolve(directory, name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) throw new Error(`Invalid contribution file: ${name}`);
    result.push(validateContribution(JSON.parse(await readFile(path, 'utf8'))));
  }
  return result;
}
export async function importContributions(entries, { url, key, fetcher = fetch }) {
  if (!url || !key || !/^https:\/\//.test(url)) throw new Error('A trusted HTTPS Supabase URL and server-only service credential are required.');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const base = url.replace(/\/$/, '');
  const published = await fetcher(`${base}/rest/v1/ecosystem_listings?select=slug,data&published=eq.true`, { headers });
  if (!published.ok) throw new Error('Cannot check existing listings; nothing imported.');
  const listings = await published.json();
  // Existing imported rows must be allowed through so the server can return their original receipts.
  const imports = prepareImports(entries);
  for (const entry of entries) {
    const match = entry.kind === 'new' && findExistingListing(entry.data, listings);
    if (match && match.slug !== entry.data.slug) throw new Error(`Possible duplicate of ${match.slug}; review the contribution before importing.`);
  }
  const receipts = [];
  for (const body of imports) {
    const response = await fetcher(`${base}/rest/v1/rpc/import_ecosystem_submission`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Queue import failed for ${body.p_import_key}. Retry safely after reviewing the server error; no automatic publication occurred.`);
    const receipt = await response.json();
    if (typeof receipt !== 'string' || !/^[0-9a-f-]{36}$/i.test(receipt)) throw new Error('Import did not return a valid queue receipt.');
    receipts.push({ id: body.p_import_key, receipt });
  }
  return receipts;
}
async function main() {
  const entries = await loadContributions(resolve('contributions/ecosystem'));
  prepareImports(entries);
  if (!process.argv.includes('--apply')) {
    console.log(`Validated ${entries.length} contributions. No requests sent.`);
    return;
  }
  if (process.env.ECOSYSTEM_IMPORT_ENABLED !== 'true') throw new Error('Import is disabled. Enable only after release approval.');
  const receipts = await importContributions(entries, { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
  console.log(`Queued ${receipts.length} contributions; admin approval is still required.`);
  console.log(`Receipt digest: ${createHash('sha256').update(JSON.stringify(receipts)).digest('hex')}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
