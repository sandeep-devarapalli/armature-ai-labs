import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DirectoryPerson } from '../../src/features/talent/directorySearch';
import { cachedTalentPage, clearTalentDirectoryCache, loadTalentFacets, loadTalentPage, talentPageKey, type TalentPage, type TalentPageQuery } from '../../src/features/talent/directoryData';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../src/features/talent/liveTalent', () => ({
  talentRpc: mock.rpc,
  talentClient: vi.fn(),
  normalizeTalentRow: (row: { data: unknown }) => row.data,
}));
const query: TalentPageQuery = { query: '', location: '', category: [], company: '', sort: 'relevance', page: 1, ids: null };
const empty = (total = 0): TalentPage => ({ results: [], total, page: 1, pageSize: 25 });
const view = (total = 0): TalentPage => ({ ...empty(total), pageSize: 10 });
function batch(total: number, pageNumber = 1): TalentPage {
  const page = Math.min(pageNumber, Math.max(1, Math.ceil(total / 25)));
  const start = (page - 1) * 25;
  return { total, page, pageSize: 25, results: Array.from({ length: Math.min(25, total - start) }, (_, index) => {
    const number = start + index + 1;
    const person: DirectoryPerson = { id: `profile-${number}`, name: `Synthetic engineer ${number}`, title: '', headline: '', company: '', location: '', previousCompanies: [], yearsExperience: null, skills: [], physicalAiAreas: [], summary: '', checkedAt: '', linkedinUrl: '', claimed: false };
    return { person, matches: [] };
  }) };
}
const ids = (page: TalentPage) => page.results.map(result => result.person.id);
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }

beforeEach(() => { clearTalentDirectoryCache(); mock.rpc.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T00:00:00Z')); });
afterEach(() => { clearTalentDirectoryCache(); vi.useRealTimers(); });

it('deduplicates concurrent page requests and reuses a recent public response', async () => {
  const pending = deferred<TalentPage>(); mock.rpc.mockReturnValue(pending.promise);
  const first = loadTalentPage(query); const second = loadTalentPage(query);
  expect(mock.rpc).toHaveBeenCalledOnce();
  expect(mock.rpc).toHaveBeenCalledWith('search_talent_directory', { p_query: '', p_location: '', p_categories: [], p_company: '', p_sort: 'relevance', p_page: 1, p_ids: null });
  pending.resolve(empty(8025));
  await expect(first).resolves.toEqual(view(8025)); await expect(second).resolves.toEqual(view(8025));
  await expect(loadTalentPage(query)).resolves.toEqual(view(8025));
  expect(mock.rpc).toHaveBeenCalledOnce();
});

it('expires cached pages and retries the server after the public-cache lifetime', async () => {
  mock.rpc.mockResolvedValueOnce(empty(1)).mockResolvedValueOnce(empty(2));
  await loadTalentPage(query);
  vi.advanceTimersByTime(59_999);
  expect(cachedTalentPage(query)?.total).toBe(1);
  vi.advanceTimersByTime(1);
  expect(cachedTalentPage(query)).toBeUndefined();
  expect((await loadTalentPage(query)).total).toBe(2);
  expect(mock.rpc).toHaveBeenCalledTimes(2);
});

it('does not let a response started before invalidation overwrite or recache newer data', async () => {
  const old = deferred<TalentPage>(); const current = deferred<TalentPage>();
  mock.rpc.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const first = loadTalentPage(query);
  clearTalentDirectoryCache();
  const second = loadTalentPage(query);
  old.resolve(empty(1)); await first;
  expect(cachedTalentPage(query)).toBeUndefined();
  const shared = loadTalentPage(query);
  expect(mock.rpc).toHaveBeenCalledTimes(2);
  current.resolve(empty(2)); await second; await shared;
  expect(cachedTalentPage(query)?.total).toBe(2);
});

it('does not cache failures or leave failed requests blocking retries', async () => {
  mock.rpc.mockRejectedValueOnce(new Error('Temporary network failure')).mockResolvedValueOnce(empty(3));
  await expect(loadTalentPage(query)).rejects.toThrow('Temporary network failure');
  expect(cachedTalentPage(query)).toBeUndefined();
  await expect(loadTalentPage(query)).resolves.toEqual(view(3));
  expect(mock.rpc).toHaveBeenCalledTimes(2);
});

it('deduplicates equivalent category and shortlist filters and keeps facets separate', async () => {
  mock.rpc.mockResolvedValue(empty());
  await loadTalentPage({ ...query, category: ['SLAM', 'Embedded'], ids: ['b', 'a'] });
  await loadTalentPage({ ...query, category: ['Embedded', 'SLAM'], ids: ['a', 'b'] });
  expect(mock.rpc).toHaveBeenCalledOnce();
  await loadTalentFacets();
  expect(mock.rpc).toHaveBeenLastCalledWith('talent_directory_facets');
  expect(mock.rpc).toHaveBeenCalledTimes(2);
});

it('restores the full recent server batch and projects another page without a request', async () => {
  mock.rpc.mockResolvedValue(batch(53));
  await loadTalentPage(query);
  vi.resetModules();
  const restored = await import('../../src/features/talent/directoryData');
  try {
    expect(restored.cachedTalentPage(query)).toMatchObject({ total: 53, page: 1, pageSize: 10 });
    const second = await restored.loadTalentPage({ ...query, page: 2 });
    expect(ids(second)).toEqual(Array.from({ length: 10 }, (_, index) => `profile-${index + 11}`));
    expect(mock.rpc).toHaveBeenCalledOnce();
  } finally { restored.clearTalentDirectoryCache(); }
});

it('ignores malformed and expired browser-stored results and fetches fresh data', async () => {
  const expired = JSON.stringify([[talentPageKey(query), { savedAt: Date.now() - 60_000, value: empty(999) }]]);
  for (const saved of ['{invalid JSON', expired]) {
    sessionStorage.setItem('armature-public-talent-v1', saved);
    mock.rpc.mockReset().mockResolvedValue(empty(2));
    vi.resetModules();
    const restored = await import('../../src/features/talent/directoryData');
    try {
      expect(restored.cachedTalentPage(query)).toBeUndefined();
      await expect(restored.loadTalentPage(query)).resolves.toEqual(view(2));
      expect(mock.rpc).toHaveBeenCalledOnce();
    } finally { restored.clearTalentDirectoryCache(); }
  }
});


const profileIds = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => `profile-${first + index}`);
function serve(total: number) { mock.rpc.mockImplementation((_name: string, args: { p_page: number }) => Promise.resolve(batch(total, args.p_page))); }

it('shows ten profiles per page and reuses the same server batch for adjacent pages', async () => {
  serve(103);
  const first = await loadTalentPage(query);
  const second = await loadTalentPage({ ...query, page: 2 });
  expect(first).toMatchObject({ total: 103, page: 1, pageSize: 10 });
  expect(ids(first)).toEqual(profileIds(1, 10));
  expect(ids(second)).toEqual(profileIds(11, 20));
  expect(cachedTalentPage({ ...query, page: 3 })).toBeUndefined();
  expect(mock.rpc).toHaveBeenCalledOnce();
});

it('deduplicates concurrent requests that share one side of a boundary page', async () => {
  const first = deferred<TalentPage>(); const second = deferred<TalentPage>();
  mock.rpc.mockImplementation((_name: string, args: { p_page: number }) => args.p_page === 1 ? first.promise : second.promise);
  const third = loadTalentPage({ ...query, page: 3 });
  const fourth = loadTalentPage({ ...query, page: 4 });
  expect(mock.rpc).toHaveBeenCalledTimes(2);
  first.resolve(batch(103, 1)); second.resolve(batch(103, 2));
  expect(ids(await third)).toEqual(profileIds(21, 30));
  expect(ids(await fourth)).toEqual(profileIds(31, 40));
  expect(mock.rpc).toHaveBeenCalledTimes(2);
});

it('returns every profile once across all visible pages and server boundaries', async () => {
  serve(103);
  const all: string[] = [];
  for (let page = 1; page <= 11; page++) {
    const current = await loadTalentPage({ ...query, page });
    expect(current).toMatchObject({ total: 103, page, pageSize: 10 });
    expect(ids(current)).toEqual(profileIds((page - 1) * 10 + 1, Math.min(page * 10, 103)));
    expect(cachedTalentPage({ ...query, page })).toEqual(current);
    all.push(...ids(current));
  }
  expect(all).toEqual(profileIds(1, 103));
  expect(new Set(all).size).toBe(103);
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_page)).toEqual([1, 2, 3, 4, 5]);
});

it('withholds a cached boundary page until both server batches are available', async () => {
  const second = deferred<TalentPage>();
  mock.rpc.mockImplementation((_name: string, args: { p_page: number }) => args.p_page === 1 ? Promise.resolve(batch(53, 1)) : second.promise);
  await loadTalentPage(query);
  expect(cachedTalentPage({ ...query, page: 3 })).toBeUndefined();
  const third = loadTalentPage({ ...query, page: 3 });
  await Promise.resolve();
  expect(cachedTalentPage({ ...query, page: 3 })).toBeUndefined();
  second.resolve(batch(53, 2));
  expect(ids(await third)).toEqual(profileIds(21, 30));
  expect(ids(cachedTalentPage({ ...query, page: 3 })!)).toEqual(profileIds(21, 30));
});

it('returns and caches a final partial page across two server batches', async () => {
  serve(76);
  const last = await loadTalentPage({ ...query, page: 8 });
  expect(last).toMatchObject({ total: 76, page: 8, pageSize: 10 });
  expect(ids(last)).toEqual(profileIds(71, 76));
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_page)).toEqual([3, 4]);
  expect(cachedTalentPage({ ...query, page: 8 })).toEqual(last);
});

it('uses both required chunks when a far-out requested page clamps to a partial page', async () => {
  serve(76);
  const last = await loadTalentPage({ ...query, page: 100 });
  expect(last).toMatchObject({ total: 76, page: 8, pageSize: 10 });
  expect(ids(last)).toEqual(profileIds(71, 76));
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_page)).toEqual([40, 3]);
  expect(cachedTalentPage({ ...query, page: 100 })).toEqual(last);
});

it('clamps a requested page when a filtered total shrinks to one batch', async () => {
  serve(8);
  const last = await loadTalentPage({ ...query, page: 11 });
  expect(last).toMatchObject({ total: 8, page: 1, pageSize: 10 });
  expect(ids(last)).toEqual(profileIds(1, 8));
  expect(mock.rpc).toHaveBeenCalledOnce();
});

it('revalidates both chunks when a boundary page is force refreshed', async () => {
  serve(103);
  await loadTalentPage({ ...query, page: 3 });
  mock.rpc.mockClear();
  await loadTalentPage({ ...query, page: 3 }, true);
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_page)).toEqual([1, 2]);
});

it('does not start secondary work or cache old chunks after invalidation', async () => {
  const first = deferred<TalentPage>(); mock.rpc.mockReturnValue(first.promise);
  const third = loadTalentPage({ ...query, page: 3 });
  clearTalentDirectoryCache();
  first.resolve(batch(103));
  await expect(third).rejects.toThrow('The directory changed while loading');
  expect(mock.rpc).toHaveBeenCalledOnce();
  expect(cachedTalentPage(query)).toBeUndefined();
  expect(cachedTalentPage({ ...query, page: 3 })).toBeUndefined();
});

it('withholds inconsistent cached totals and refreshes the older secondary chunk', async () => {
  mock.rpc.mockResolvedValueOnce(batch(103, 2)).mockResolvedValueOnce(batch(76, 1)).mockResolvedValueOnce(batch(76, 2));
  await loadTalentPage({ ...query, page: 4 });
  await loadTalentPage(query);
  expect(cachedTalentPage({ ...query, page: 3 })).toBeUndefined();
  const third = await loadTalentPage({ ...query, page: 3 });
  expect(ids(third)).toEqual(profileIds(21, 30));
  expect(third.total).toBe(76);
  expect(mock.rpc).toHaveBeenCalledTimes(3);
});

it('does not combine independently fetched chunks when their totals disagree', async () => {
  mock.rpc.mockResolvedValueOnce(batch(103, 1)).mockResolvedValueOnce(batch(76, 2));
  await expect(loadTalentPage({ ...query, page: 3 })).rejects.toThrow('The directory changed while loading');
  expect(cachedTalentPage({ ...query, page: 3 })).toBeUndefined();
});

it('retries the failed half of a boundary page without refetching a valid cached half', async () => {
  mock.rpc.mockResolvedValueOnce(batch(103, 1)).mockRejectedValueOnce(new Error('Temporary boundary failure')).mockResolvedValueOnce(batch(103, 2));
  await expect(loadTalentPage({ ...query, page: 3 })).rejects.toThrow('Temporary boundary failure');
  expect(cachedTalentPage({ ...query, page: 3 })).toBeUndefined();
  expect(ids(await loadTalentPage({ ...query, page: 3 }))).toEqual(profileIds(21, 30));
  expect(mock.rpc.mock.calls.map(([, args]) => args.p_page)).toEqual([1, 2, 2]);
});

it('preserves search, location, category, company, sort and shortlist filters across both chunks', async () => {
  serve(103);
  await loadTalentPage({ query: 'robotics engineer', location: 'bengaluru', category: ['SLAM', 'Embedded'], company: 'Synthetic lab', sort: 'name', page: 3, ids: ['profile-1', 'profile-2'] });
  for (const [index, page] of [1, 2].entries()) expect(mock.rpc).toHaveBeenNthCalledWith(index + 1, 'search_talent_directory', { p_query: 'robotics engineer', p_location: 'bengaluru', p_categories: ['SLAM', 'Embedded'], p_company: 'Synthetic lab', p_sort: 'name', p_page: page, p_ids: ['profile-1', 'profile-2'] });
});
