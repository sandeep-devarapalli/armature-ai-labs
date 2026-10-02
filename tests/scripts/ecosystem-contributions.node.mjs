import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { findExistingListing, importContributions, loadContributions, prepareImports, validateContribution } from '../../scripts/ecosystem-contributions.mjs';
import { bengaluruEcosystem } from '../../src/data/bengaluruEcosystem.ts';

const entry = {
  schemaVersion: 1, id: 'synthetic-test-01', kind: 'new', publicationConsent: true,
  data: { slug: 'synthetic-place', name: 'Synthetic place', summary: 'Synthetic fixture for queue validation.', primaryType: 'other', websiteUrl: 'https://example.invalid/place', publicPhones: [] },
};
test('owner lab listing preserves the supplied map pin and remains review-only', async () => {
  const lab = validateContribution(JSON.parse(await readFile(new URL('../../contributions/ecosystem/owner-20261002-armature-ai-labs.json', import.meta.url), 'utf8')));
  assert.equal(lab.data.slug, 'armature-ai-labs');
  assert.equal(lab.data.sourceUrl, 'https://maps.app.goo.gl/XeNziZfx3V8S8jza7');
  assert.deepEqual(lab.data.coordinates, [77.6454331, 12.9179704]);
  assert.equal(lab.data.locationPrecision, 'Address-level');
  assert.deepEqual(lab.data.publicPhones, [{ label: 'Lab enquiries', number: '+91 97484 85583' }]);
  assert.match(lab.data.accessNote, /confirm opening hours/);
  const sql = await readFile(new URL('../../supabase/migrations/202610020003_armature_ecosystem_submission.sql', import.meta.url), 'utf8');
  assert.match(sql, /select public.import_ecosystem_submission/);
  assert.doesNotMatch(sql, /insert into public.ecosystem_listings|review_ecosystem_submission/);
  const payload = sql.match(/  '(.*)'::jsonb/)[1].replace(/''/g, "'");
  assert.deepEqual(JSON.parse(payload), lab.data);
});
test('shared listing validation and explicit public contact permission', () => {
  assert.equal(validateContribution(entry).data.name, 'Synthetic place');
  assert.throws(() => validateContribution({ ...entry, data: { ...entry.data, slug: '' } }), /stable public slug/);
  const { slug: _slug, ...withoutSlug } = entry.data;
  assert.throws(() => validateContribution({ ...entry, data: withoutSlug }), /stable public slug/);
  assert.throws(() => validateContribution({ ...entry, publicationConsent: false }), /permit publication/);
  assert.throws(() => validateContribution({ ...entry, data: { ...entry.data, submitterEmail: 'private@example.invalid' } }), /Private contact/);
  assert.throws(() => validateContribution({ ...entry, data: { ...entry.data, credit: { name: 'Public name', email: 'private@example.invalid' } } }), /Private contact/);
  assert.throws(() => validateContribution({ ...entry, data: { ...entry.data, websiteUrl: 'javascript:alert(1)' } }), /HTTP/);
});
test('multiple phones and revision-bound edits', () => {
  const phones = [{ label: 'Reception', number: '+91 8000000000' }, { label: 'Workshop', number: '+91 8111111111' }];
  assert.equal(validateContribution({ ...entry, data: { ...entry.data, publicPhones: phones } }).data.publicPhones.length, 2);
  assert.throws(() => validateContribution({ ...entry, kind: 'edit' }), /baseRevision/);
  assert.equal(prepareImports([{ ...entry, kind: 'edit', targetSlug: 'synthetic-place', baseRevision: 3 }])[0].p_base_revision, 3);
});
test('deduplicate IDs, names and canonical organisation URLs', () => {
  assert.throws(() => prepareImports([entry, entry]), /Duplicate contribution/);
  const listings = [{ slug: 'existing-place', data: { ...entry.data, name: 'Different spelling', websiteUrl: 'http://www.example.invalid/place/' } }];
  assert.equal(findExistingListing(entry.data, listings).slug, 'existing-place');
  assert.throws(() => prepareImports([entry], listings), /Existing organisation/);
  const sourceOnly = { ...entry, data: { ...entry.data, websiteUrl: '', sourceUrl: 'https://example.invalid/source' } };
  const sourceListing = [{ slug: 'existing-source', data: { name: 'Another name', websiteUrl: '', sourceUrl: 'http://www.example.invalid/source/' } }];
  assert.equal(findExistingListing(sourceOnly.data, sourceListing).slug, 'existing-source');
  assert.throws(() => prepareImports([sourceOnly], sourceListing), /Existing organisation/);
  assert.equal(findExistingListing({ ...sourceOnly.data, sourceUrl: 'https://example.invalid/source?id=2' }, sourceListing), undefined);
});
test('RPC import uses stable keys, returns receipts, never writes public listings', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(options.method ? '11111111-1111-4111-8111-111111111111' : []));
  };
  const options = { url: 'https://synthetic.invalid', key: 'fixture-only', fetcher };
  assert.equal((await importContributions([entry], options))[0].id, 'github:synthetic-test-01');
  await importContributions([entry], options);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 2);
  assert.ok(calls.filter(call => call.options.method === 'POST').every(call => call.url.endsWith('/rpc/import_ecosystem_submission')));
  assert.deepEqual(JSON.parse(calls[1].options.body), JSON.parse(calls[3].options.body));
});
test('failed duplicate checks and failed receipts never claim success', async () => {
  await assert.rejects(importContributions([entry], { url: 'https://synthetic.invalid', key: 'fixture', fetcher: async () => new Response('', { status: 500 }) }), /nothing imported/);
  await assert.rejects(importContributions([entry], { url: 'https://synthetic.invalid', key: 'fixture', fetcher: async (_, opts) => new Response(JSON.stringify(opts.method ? null : [])) }), /valid queue receipt/);
});
test('an open-edit conflict fails the import without a receipt or publication', async () => {
  const edit = { ...entry, kind: 'edit', targetSlug: 'synthetic-place', baseRevision: 1 };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    return options.method
      ? new Response(JSON.stringify({ code: 'P0409', message: 'An update is awaiting admin review.' }), { status: 409 })
      : new Response('[]');
  };
  await assert.rejects(importContributions([edit], { url: 'https://synthetic.invalid', key: 'fixture', fetcher }), /Queue import failed for github:synthetic-test-01/);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('/rpc/import_ecosystem_submission'));
});
test('research candidates remain review-only with corrections and no inferred pins or dates', async () => {
  const entries = await loadContributions(fileURLToPath(new URL('../../contributions/ecosystem', import.meta.url)));
  const research = entries.filter(item => item.id.startsWith('research-20261002-'));
  assert.equal(research.length, 13);
  assert.equal(prepareImports(entries).length, entries.length);
  for (const item of research.filter(item => item.kind === 'new')) {
    assert.equal(item.data.coordinates, undefined);
    assert.equal(item.data.verifiedAt, undefined);
    assert.equal(item.data.needs.includes('pilot'), false);
  }
  assert.equal(entries.find(item => item.data.slug === 'ikp-eden').data.sourceUrl, 'https://ikpeden.com/smart-fab/');
  const sql = await readFile(new URL('../../supabase/migrations/202610020002_ecosystem_seed.sql', import.meta.url), 'utf8');
  assert.match(sql, /on conflict \(slug\) do nothing/);
  assert.equal((sql.match(/select public.import_ecosystem_submission/g) || []).length, 13);
  const seeded = [...sql.matchAll(/^  \('([^']+)', 1, '(.*)'::jsonb, true\)[,]?$/gm)].map(match => JSON.parse(match[2].replace(/''/g, "'")));
  assert.equal(seeded.length, bengaluruEcosystem.length);
  for (const legacy of bengaluruEcosystem) {
    const row = seeded.find(candidate => candidate.slug === legacy.slug);
    for (const [key, value] of Object.entries(legacy)) assert.deepEqual(row[key], value);
  }
});
