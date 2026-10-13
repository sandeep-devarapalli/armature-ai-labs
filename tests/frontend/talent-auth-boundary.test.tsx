import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TalentProfileActions, TalentReviewQueue } from '../../src/features/talent/TalentRequests';
import type { DirectoryPerson } from '../../src/features/talent/directorySearch';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), authChange: (() => {}) as () => void, unsubscribe: vi.fn() }));
vi.mock('../../src/features/talent/liveTalent', () => ({ talentRpc: mock.rpc, talentClient: () => ({ auth: { getUser: mock.getUser, onAuthStateChange: (callback: () => void) => { mock.authChange = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; } } }) }));
const person: DirectoryPerson = { id: 'p1', name: 'Test', headline: '', title: '', company: '', location: '', previousCompanies: [], skills: [], physicalAiAreas: [], yearsExperience: null, summary: '', checkedAt: '', linkedinUrl: '', claimed: false, revision: 1 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const privateRequest = { id: 'r1', profile_id: 'p1', profile_name: 'Private claimant', requester_id: 'u1', evidence: 'Private ownership evidence', kind: 'claim', status: 'pending', created_at: '2026-10-13T00:00:00Z' };
beforeEach(() => { mock.rpc.mockReset(); mock.getUser.mockReset(); mock.unsubscribe.mockReset(); });
it('clears review evidence immediately on account changes and ignores an older queue response', async () => {
  const late = deferred<unknown>(); mock.rpc.mockReturnValueOnce(late.promise).mockRejectedValue(new Error('Administrator required'));
  render(<MemoryRouter><TalentReviewQueue onChange={vi.fn()}/></MemoryRouter>);
  act(() => mock.authChange());
  await act(async () => { late.resolve([privateRequest]); });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Administrator required'));
  expect(screen.queryByText('Private ownership evidence')).not.toBeInTheDocument();
});
it('removes an already displayed private queue when signed out', async () => {
  mock.rpc.mockResolvedValueOnce([privateRequest]).mockRejectedValue(new Error('Sign in required'));
  render(<MemoryRouter><TalentReviewQueue onChange={vi.fn()}/></MemoryRouter>);
  await screen.findByText('Private ownership evidence');
  act(() => mock.authChange());
  expect(screen.queryByText('Private ownership evidence')).not.toBeInTheDocument();
  await screen.findByText('Sign in required');
});
it('does not restore owner access or private requests from a late response after signout', async () => {
  const late = deferred<unknown>(); mock.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email_confirmed_at: '2026-01-01' } } }).mockResolvedValue({ data: { user: null } }); mock.rpc.mockReturnValue(late.promise);
  render(<MemoryRouter><TalentProfileActions person={person} onChange={vi.fn()}/></MemoryRouter>);
  await waitFor(() => expect(mock.rpc).toHaveBeenCalled());
  act(() => mock.authChange());
  await act(async () => { late.resolve({ owner: true, admin: true, requests: [{ ...privateRequest, review_note: 'Secret note' }] }); });
  await screen.findByRole('link', { name: 'Sign in to continue' });
  expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Secret note/)).not.toBeInTheDocument();
});
it('unsubscribes and discards a review response after unmount', async () => {
  const late = deferred<unknown>(); mock.rpc.mockReturnValue(late.promise); const onChange = vi.fn();
  const view = render(<MemoryRouter><TalentReviewQueue onChange={onChange}/></MemoryRouter>);
  view.unmount(); await act(async () => { late.resolve([privateRequest]); });
  expect(mock.unsubscribe).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled();
});
