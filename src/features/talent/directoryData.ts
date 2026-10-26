import { normalizeTalentRow, talentClient, talentRpc, type TalentRow } from './liveTalent';
import type { DirectoryPerson, DirectoryQuery } from './directorySearch';

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
export function cachedTalentPage(query: TalentPageQuery) { return cached<TalentPage>(talentPageKey(query)); }
export function cachedTalentFacets() { return cached<TalentFacets>('facets'); }

export function loadTalentPage(query: TalentPageQuery, force = false) {
  return request(talentPageKey(query), async () => {
    const page = await talentRpc<TalentPage>('search_talent_directory', {
      p_query: query.query, p_location: query.location, p_categories: Array.isArray(query.category) ? query.category : [query.category].filter(Boolean),
      p_company: query.company, p_sort: query.sort, p_page: query.page, p_ids: query.ids,
    });
    return { ...page, results: page.results.map(result => ({ ...result, person: normalizeTalentRow({ id: result.person.id, revision: result.person.revision ?? 1, published: true, data: result.person }) })) };
  }, force);
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
