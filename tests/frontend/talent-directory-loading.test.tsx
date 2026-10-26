import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { TalentDirectory } from '../../src/features/talent/directory';
import type { DirectoryPerson } from '../../src/features/talent/directorySearch';
import type { TalentPage, TalentPageQuery } from '../../src/features/talent/directoryData';

const mock = vi.hoisted(() => ({ cachedPage: vi.fn(), cachedFacets: vi.fn(), loadPage: vi.fn(), loadFacets: vi.fn(), loadProfile: vi.fn(), loadShortlist: vi.fn(), clear: vi.fn(), bulk: vi.fn(), profileCommits: [] as { missing: boolean; loading: boolean }[] }));
vi.mock('../../src/features/talent/directoryData', () => ({ cachedTalentPage: mock.cachedPage, cachedTalentFacets: mock.cachedFacets, clearTalentDirectoryCache: mock.clear, loadTalentPage: mock.loadPage, loadTalentFacets: mock.loadFacets, loadTalentProfile: mock.loadProfile, loadShortlistedProfiles: mock.loadShortlist, talentPageKey: (query: unknown) => JSON.stringify(query) }));
vi.mock('../../src/features/talent/liveTalent', () => ({ loadTalent: mock.bulk }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ isAdmin: false }) }));
vi.mock('../../src/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('../../src/features/talent/TalentMemberNavigation', () => ({ TalentMemberNavigation: () => <nav>Talent navigation</nav>, useTalentMember: () => ({ user: null, loading: false, profile: null, profileError: '' }) }));
vi.mock('../../src/features/talent/marketUnread', () => ({ useMarketplaceUnread: () => 0 }));
vi.mock('../../src/features/talent/TalentPhoto', () => ({ TalentAvatar: () => null, TalentPhotoDemo: () => null }));
vi.mock('../../src/features/talent/TalentCommunity', async () => {
  const { useLayoutEffect } = await import('react');
  return { TalentCommunity: () => {
    useLayoutEffect(() => { mock.profileCommits.push({ missing: [...document.querySelectorAll('h1')].some(heading => heading.textContent === 'Profile not found'), loading: document.body.textContent?.includes('Loading profile…') ?? false }); });
    return null;
  }, TalentCommunityLink: () => null };
});
vi.mock('../../src/features/talent/TalentRequests', () => ({ TalentProfileActions: () => null, TalentMyRequests: () => null, TalentReviewQueue: () => null, TalentEditDemo: () => null, TalentClaimDemo: () => null }));
vi.mock('../../src/features/talent/Marketplace', () => ({ TalentMarketplace: () => <h1>Work projects</h1>, TalentChatRequest: () => null }));

const person = (name: string): DirectoryPerson => ({ id: name.toLowerCase(), name, title: 'Synthetic engineer', headline: '', company: '', location: 'Bengaluru', previousCompanies: [], yearsExperience: null, skills: [], physicalAiAreas: [], summary: '', checkedAt: '', linkedinUrl: '', claimed: false });
const page = (name: string, pageNumber = 1, total = 1): TalentPage => ({ results: [{ person: person(name), matches: [] }], total, page: pageNumber, pageSize: 25 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function open() { return render(<MemoryRouter><TalentDirectory/></MemoryRouter>); }
function search(value: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Search by name, LinkedIn profile, role, skill or company' }), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Search' })); }
function navigate(hash: string) { act(() => { window.history.replaceState(null, '', `/talent-network/${hash}`); window.dispatchEvent(new HashChangeEvent('hashchange')); }); }

beforeEach(() => {
  window.history.replaceState(null, '', '/talent-network/#talent');
  mock.loadPage.mockReset(); mock.loadFacets.mockReset(); mock.loadProfile.mockReset(); mock.bulk.mockReset(); mock.clear.mockReset();
  mock.cachedPage.mockReset(); mock.cachedFacets.mockReset();
  mock.profileCommits.length = 0;
  mock.loadShortlist.mockReset().mockResolvedValue([]);
  mock.loadFacets.mockResolvedValue({ total: 8025, locations: ['Bengaluru'], categories: ['Embedded'], companies: [], specialties: { Embedded: 2807 } });
});

it('shows usable search controls and loading placeholders before profile requests finish', async () => {
  const pending = deferred<TalentPage>(); mock.loadPage.mockReturnValue(pending.promise);
  open();
  expect(screen.getByRole('textbox', { name: 'Search by name, LinkedIn profile, role, skill or company' })).toBeEnabled();
  expect(screen.getByText('Loading talent profiles…')).toBeInTheDocument();
  expect(screen.queryByText('No matching profiles')).not.toBeInTheDocument();
  expect(mock.bulk).not.toHaveBeenCalled();
  await act(async () => pending.resolve(page('Synthetic Ada')));
  expect(await screen.findByRole('heading', { name: 'Synthetic Ada' })).toBeInTheDocument();
});

it('keeps existing results while updating and ignores an older search response', async () => {
  const old = deferred<TalentPage>(); const latest = deferred<TalentPage>();
  mock.loadPage.mockImplementation((query: TalentPageQuery) => query.query === 'old' ? old.promise : query.query === 'latest' ? latest.promise : Promise.resolve(page('Initial result')));
  open(); await screen.findByRole('heading', { name: 'Initial result' });
  search('old');
  expect(screen.getByRole('heading', { name: 'Initial result' })).toBeInTheDocument();
  search('latest');
  await act(async () => latest.resolve(page('Latest result')));
  await screen.findByRole('heading', { name: 'Latest result' });
  await act(async () => old.resolve(page('Obsolete result')));
  expect(screen.queryByRole('heading', { name: 'Obsolete result' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Latest result' })).toBeInTheDocument();
});

it('preserves the active query and page when opening a profile and returning', async () => {
  mock.loadPage.mockImplementation((query: TalentPageQuery) => Promise.resolve(page(query.query ? 'Filtered person' : 'Initial person', query.page, 75)));
  mock.loadProfile.mockResolvedValue(person('Filtered person'));
  open(); await screen.findByRole('heading', { name: 'Initial person' });
  search('firmware'); await screen.findByRole('heading', { name: 'Filtered person' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 of 3');
  fireEvent.click(screen.getByRole('link', { name: 'View profile' })); navigate('#profile/filtered%20person');
  expect(await screen.findByRole('heading', { name: 'Filtered person', level: 1 })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Back to results' })); navigate('#talent');
  expect(screen.getByRole('textbox', { name: 'Search by name, LinkedIn profile, role, skill or company' })).toHaveValue('firmware');
  await screen.findByText('Page 2 of 3');
  expect(mock.loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'firmware', page: 2 }), expect.any(Boolean));
  expect(mock.loadProfile).toHaveBeenCalledWith('filtered person');
});

it('does not fetch the talent directory when entering the work view', async () => {
  window.history.replaceState(null, '', '/talent-network/#work');
  open();
  await screen.findByRole('heading', { name: 'Work projects' });
  expect(mock.loadPage).not.toHaveBeenCalled(); expect(mock.loadFacets).not.toHaveBeenCalled(); expect(mock.bulk).not.toHaveBeenCalled();
});

it('removes a shortlisted profile after the server reports it unlisted on focus', async () => {
  mock.loadPage.mockResolvedValue(page('Synthetic Ada'));
  mock.loadShortlist.mockResolvedValueOnce([person('Synthetic Ada')]).mockResolvedValue([]);
  open(); await screen.findByRole('heading', { name: 'Synthetic Ada' });
  fireEvent.click(screen.getByRole('button', { name: 'Add to shortlist' }));
  const shortlist = within(screen.getByRole('complementary', { name: 'Your shortlist' }));
  expect(shortlist.getByText('Synthetic Ada')).toBeInTheDocument();
  await waitFor(() => expect(mock.loadShortlist).toHaveBeenCalledWith(['synthetic ada']));
  await act(async () => {});
  const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  try {
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(shortlist.queryByText('Synthetic Ada')).not.toBeInTheDocument());
    expect(shortlist.getByRole('heading', { name: 'Your shortlist · 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shortlist (0)' })).toBeInTheDocument();
    expect(mock.loadShortlist).toHaveBeenCalledTimes(2);
  } finally { visible.mockRestore(); }
});

it('hydrates the loading shell before restoring browser-cached results and revalidating', async () => {
  mock.cachedPage.mockReturnValue(page('Cached person'));
  const fresh = deferred<TalentPage>(); mock.loadPage.mockReturnValue(fresh.promise);
  const tree = <MemoryRouter><TalentDirectory/></MemoryRouter>;
  const html = renderToString(tree);
  expect(html).toContain('Loading talent profiles');
  expect(html).not.toContain('Cached person');
  expect(mock.cachedPage).not.toHaveBeenCalled(); expect(mock.cachedFacets).not.toHaveBeenCalled();
  const container = document.createElement('div'); container.innerHTML = html; document.body.append(container);
  const recoverable = vi.fn(); let root!: Root;
  try {
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: recoverable }); });
    expect(await screen.findByRole('heading', { name: 'Cached person' })).toBeInTheDocument();
    expect(mock.loadPage).toHaveBeenCalledWith(expect.anything(), true);
    expect(recoverable).not.toHaveBeenCalled();
    await act(async () => fresh.resolve(page('Fresh person')));
    expect(await screen.findByRole('heading', { name: 'Fresh person' })).toBeInTheDocument();
    expect(recoverable).not.toHaveBeenCalled();
  } finally { if (root) await act(async () => root.unmount()); container.remove(); }
});

it.each([
  ['#profile/synthetic-ada', 'Synthetic Ada'],
  ['#work', 'Work projects'],
])('hydrates a direct %s entry without loading the default directory', async (hash, heading) => {
  window.history.replaceState(null, '', `/talent-network/${hash}`);
  mock.loadProfile.mockResolvedValue(person('Synthetic Ada'));
  const tree = <MemoryRouter><TalentDirectory/></MemoryRouter>;
  const html = renderToString(tree);
  expect(html).toContain('Loading talent profiles');
  const container = document.createElement('div'); container.innerHTML = html; document.body.append(container);
  const recoverable = vi.fn(); let root!: Root;
  try {
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: recoverable }); });
    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
    expect(recoverable).not.toHaveBeenCalled();
    expect(mock.loadPage).not.toHaveBeenCalled(); expect(mock.loadFacets).not.toHaveBeenCalled(); expect(mock.bulk).not.toHaveBeenCalled();
    if (hash.startsWith('#profile/')) expect(mock.loadProfile).toHaveBeenCalledWith('synthetic-ada');
    else expect(mock.loadProfile).not.toHaveBeenCalled();
  } finally { if (root) await act(async () => root.unmount()); container.remove(); }
});

it('keeps a direct profile pending until the server confirms it is missing', async () => {
  window.history.replaceState(null, '', '/talent-network/#profile/missing-person');
  const pending = deferred<DirectoryPerson | null>(); mock.loadProfile.mockReturnValue(pending.promise);
  open();
  expect(await screen.findByText('Loading profile…')).toBeInTheDocument();
  expect(mock.profileCommits.some(commit => commit.loading)).toBe(true);
  expect(mock.profileCommits.some(commit => commit.missing)).toBe(false);
  expect(screen.queryByRole('heading', { name: 'Profile not found' })).not.toBeInTheDocument();
  await act(async () => pending.resolve(null));
  expect(await screen.findByRole('heading', { name: 'Profile not found' })).toBeInTheDocument();
  expect(screen.queryByText('Loading profile…')).not.toBeInTheDocument();
});

it('keeps the next profile pending instead of showing the prior person or a missing state', async () => {
  window.history.replaceState(null, '', '/talent-network/#profile/first-person');
  const pending = deferred<DirectoryPerson | null>();
  mock.loadProfile.mockResolvedValueOnce(person('First person')).mockReturnValueOnce(pending.promise);
  open(); await screen.findByRole('heading', { name: 'First person', level: 1 });
  mock.profileCommits.length = 0;
  navigate('#profile/second-person');
  expect(await screen.findByText('Loading profile…')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'First person', level: 1 })).not.toBeInTheDocument();
  expect(mock.profileCommits.some(commit => commit.missing)).toBe(false);
  expect(mock.loadProfile).toHaveBeenLastCalledWith('second-person');
  await act(async () => pending.resolve(null));
  expect(await screen.findByRole('heading', { name: 'Profile not found' })).toBeInTheDocument();
});
