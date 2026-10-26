import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cachedTalentPage, clearTalentDirectoryCache, loadTalentFacets, loadTalentPage, talentPageKey, type TalentPage, type TalentPageQuery } from '../../src/features/talent/directoryData';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../src/features/talent/liveTalent', () => ({
  talentRpc: mock.rpc,
  talentClient: vi.fn(),
  normalizeTalentRow: (row: { data: unknown }) => row.data,
}));
const query: TalentPageQuery = { query: '', location: '', category: [], company: '', sort: 'relevance', page: 1, ids: null };
const empty = (total = 0): TalentPage => ({ results: [], total, page: 1, pageSize: 25 });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }

beforeEach(() => { clearTalentDirectoryCache(); mock.rpc.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T00:00:00Z')); });
afterEach(() => { clearTalentDirectoryCache(); vi.useRealTimers(); });

it('deduplicates concurrent page requests and reuses a recent public response', async () => {
  const pending = deferred<TalentPage>(); mock.rpc.mockReturnValue(pending.promise);
  const first = loadTalentPage(query); const second = loadTalentPage(query);
  expect(mock.rpc).toHaveBeenCalledOnce();
  expect(mock.rpc).toHaveBeenCalledWith('search_talent_directory', { p_query: '', p_location: '', p_categories: [], p_company: '', p_sort: 'relevance', p_page: 1, p_ids: null });
  pending.resolve(empty(8025));
  await expect(first).resolves.toEqual(empty(8025)); await expect(second).resolves.toEqual(empty(8025));
  await expect(loadTalentPage(query)).resolves.toEqual(empty(8025));
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
  await expect(loadTalentPage(query)).resolves.toEqual(empty(3));
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

it('restores recent public results from browser storage without another request', async () => {
  mock.rpc.mockResolvedValue(empty(8025));
  await loadTalentPage(query);
  vi.resetModules();
  const restored = await import('../../src/features/talent/directoryData');
  try {
    expect(restored.cachedTalentPage(query)).toEqual(empty(8025));
    await expect(restored.loadTalentPage(query)).resolves.toEqual(empty(8025));
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
      await expect(restored.loadTalentPage(query)).resolves.toEqual(empty(2));
      expect(mock.rpc).toHaveBeenCalledOnce();
    } finally { restored.clearTalentDirectoryCache(); }
  }
});
