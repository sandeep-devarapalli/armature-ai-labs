import { normalizeTalentRow, talentClient, talentRpc, type TalentRow } from './liveTalent';
import type { DirectoryPerson, DirectoryQuery } from './directorySearch';

export const talentResultsPerPage = 10;
const talentBatchSize = 25;

export type TalentPageQuery = DirectoryQuery & { page: number; ids: string[] | null };
export type TalentPage = { results: { person: DirectoryPerson; matches: string[] }[]; total: number; page: number; pageSize: number };
export type TalentFacets = { total: number; locations: string[]; categories: string[]; companies: string[]; specialties: Record<string, number> };
type Entry = { savedAt: number; value: unknown };
const storageKey = 'armature-public-talent-v1';
const ttl = 60_000;
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;

try {
  if (typeof window !== 'undefined') {
    const saved: [string, Entry][] = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    for (const [key, entry] of saved.slice(-6)) if (Date.now() - entry.savedAt < ttl) cache.set(key, entry);
  }
} catch { /* Storage is optional. */ }

function cached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  return entry && Date.now() - entry.savedAt < ttl ? entry.value as T : undefined;
}

function persist() {
  try {
    const saved = JSON.stringify([...cache].filter(([, entry]) => Date.now() - entry.savedAt < ttl).slice(-6));
    if (saved.length < 250_000) sessionStorage.setItem(storageKey, saved);
  } catch { /* Storage is optional. */ }
}

export function clearTalentDirectoryCache() {
  generation++;
  cache.clear();
  pending.clear();
  try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
}
if (typeof window !== 'undefined') window.addEventListener('talent-directory-invalidated', clearTalentDirectoryCache);

async function request<T>(key: string, load: () => Promise<T>, force: boolean): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const value = cached<T>(key);
  if (!force && value !== undefined) return value;
  const started = generation;
  const task = load().then(value => {
    if (started === generation) {
      cache.delete(key);
      cache.set(key, { savedAt: Date.now(), value });
      if (cache.size > 12) cache.delete(cache.keys().next().value!);
      persist();
    }
    return value;
  }).finally(() => { if (pending.get(key) === task) pending.delete(key); });
  pending.set(key, task);
  return task;
}

export function talentPageKey(query: TalentPageQuery) {
  return JSON.stringify({ ...query, category: [...(Array.isArray(query.category) ? query.category : [query.category])].sort(), ids: query.ids ? [...query.ids].sort() : null });
}
function batchQuery(query: TalentPageQuery, page = Math.floor((Math.max(1, query.page) - 1) * talentResultsPerPage / talentBatchSize) + 1): TalentPageQuery {
  return { ...query, page };
}
function pageRange(total: number, requested: number) {
  const page = Math.min(Math.max(1, requested), Math.max(1, Math.ceil(total / talentResultsPerPage)));
  const start = (page - 1) * talentResultsPerPage;
  const end = Math.min(start + talentResultsPerPage, total);
  const first = Math.floor(start / talentBatchSize) + 1;
  const last = Math.max(first, Math.ceil(end / talentBatchSize));
  return { page, start, end, batches: Array.from({ length: last - first + 1 }, (_, index) => first + index) };
}
function visiblePage(batches: TalentPage[], requested: number): TalentPage {
  const first = batches[0];
  const range = pageRange(first.total, requested);
  const results = batches.flatMap(batch => batch.results.slice(Math.max(0, range.start - (batch.page - 1) * talentBatchSize), Math.max(0, range.end - (batch.page - 1) * talentBatchSize)));
  return { total: first.total, results, page: range.page, pageSize: talentResultsPerPage };
}
export function cachedTalentPage(query: TalentPageQuery) {
  const first = cached<TalentPage>(talentPageKey(batchQuery(query)));
  if (!first) return undefined;
  const batches = pageRange(first.total, query.page).batches.map(page => first.page === page ? first : cached<TalentPage>(talentPageKey(batchQuery(query, page))));
  return batches.every((batch): batch is TalentPage => batch !== undefined && batch.total === first.total) ? visiblePage(batches, query.page) : undefined;
}
export function cachedTalentFacets() { return cached<TalentFacets>('facets'); }

function loadTalentBatch(query: TalentPageQuery, force: boolean) {
  return request(talentPageKey(query), async () => {
    const page = await talentRpc<TalentPage>('search_talent_directory', {
      p_query: query.query, p_location: query.location, p_categories: Array.isArray(query.category) ? query.category : [query.category].filter(Boolean),
      p_company: query.company, p_sort: query.sort, p_page: query.page, p_ids: query.ids,
    });
    return { ...page, results: page.results.map(result => ({ ...result, person: normalizeTalentRow({ id: result.person.id, revision: result.person.revision ?? 1, published: true, data: result.person }) })) };
  }, force);
}
export async function loadTalentPage(query: TalentPageQuery, force = false) {
  const started = generation;
  const first = await loadTalentBatch(batchQuery(query), force);
  const batches = await Promise.all(pageRange(first.total, query.page).batches.map(page => {
    if (first.page === page) return first;
    if (started !== generation) throw new Error('The directory changed while loading. Please try again.');
    const next = batchQuery(query, page);
    const existing = cached<TalentPage>(talentPageKey(next));
    return loadTalentBatch(next, force || Boolean(existing && existing.total !== first.total));
  }));
  if (batches.some(batch => batch.total !== first.total)) throw new Error('The directory changed while loading. Please try again.');
  return visiblePage(batches, query.page);
}

export function loadTalentFacets(force = false) {
  return request('facets', () => talentRpc<TalentFacets>('talent_directory_facets'), force);
}

export async function loadTalentProfile(id: string): Promise<DirectoryPerson | null> {
  const { data, error } = await talentClient().from('talent_profiles').select('id,data,revision,published').eq('published', true).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeTalentRow(data as TalentRow) : null;
}

export async function loadShortlistedProfiles(ids: string[]): Promise<DirectoryPerson[]> {
  if (!ids.length) return [];
  const { data, error } = await talentClient().from('talent_profiles').select('id,data,revision,published').eq('published', true).in('id', ids);
  if (error) throw new Error(error.message);
  return (data as TalentRow[]).map(normalizeTalentRow);
}
