import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TalentMyRequests, TalentProfileActions, TalentReviewQueue } from '../../src/features/talent/TalentRequests';
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

it('requires sign-in before fetching request history', async () => {
  mock.getUser.mockResolvedValue({ data: { user: null } });
  render(<MemoryRouter><TalentMyRequests/></MemoryRouter>);
  await screen.findByRole('link', { name: 'Sign in to continue' });
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('shows removal decisions without linking to an unpublished profile', async () => {
  mock.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mock.rpc.mockResolvedValue([{ ...privateRequest, status: 'approved', kind: 'removal', published: false, review_note: 'Your removal was approved.' }]);
  render(<MemoryRouter><TalentMyRequests/></MemoryRouter>);
  await screen.findByText('Your removal was approved.');
  expect(screen.queryByRole('link', { name: 'View profile' })).not.toBeInTheDocument();
  expect(mock.rpc).toHaveBeenCalledWith('talent_my_requests');
});
it('links a published profile from request history and clears history on signout', async () => {
  mock.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } }).mockResolvedValue({ data: { user: null } });
  mock.rpc.mockResolvedValue([{ ...privateRequest, published: true, review_note: 'Private decision note' }]);
  render(<MemoryRouter><TalentMyRequests/></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'View profile' })).toHaveAttribute('href', '#profile/p1');
  act(() => mock.authChange());
  expect(screen.queryByText('Private decision note')).not.toBeInTheDocument();
  await screen.findByRole('link', { name: 'Sign in to continue' });
});
it('discards late request history after switching accounts', async () => {
  const late = deferred<unknown>();
  mock.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } }).mockResolvedValue({ data: { user: { id: 'u2' } } });
  mock.rpc.mockReturnValueOnce(late.promise).mockResolvedValue([]);
  render(<MemoryRouter><TalentMyRequests/></MemoryRouter>);
  await waitFor(() => expect(mock.rpc).toHaveBeenCalled());
  act(() => mock.authChange());
  await act(async () => { late.resolve([{ ...privateRequest, review_note: 'Old account private note' }]); });
  await screen.findByText('You have not submitted any requests.');
  expect(screen.queryByText('Old account private note')).not.toBeInTheDocument();
});

it('allows an authenticated admin to edit through the audited admin RPC', async () => {
  mock.getUser.mockResolvedValue({ data: { user: { id: 'admin', email_confirmed_at: '2026-01-01' } } });
  mock.rpc.mockResolvedValue({ owner: false, admin: true, requests: [] });
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<MemoryRouter><TalentProfileActions person={person} onChange={changed}/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile as admin' }));
  fireEvent.change(screen.getByLabelText('Current title'), { target: { value: 'Updated title' } });
  fireEvent.change(screen.getByLabelText('Reason for this edit'), { target: { value: 'Verified against owner supplied details.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('talent_admin_update_profile', expect.objectContaining({ profile_id: 'p1', expected_revision: 1, note: 'Verified against owner supplied details.', patch: expect.objectContaining({ title: 'Updated title' }) })));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
});
it('does not expose direct editing to a non-owner member', async () => {
  mock.getUser.mockResolvedValue({ data: { user: { id: 'member', email_confirmed_at: '2026-01-01' } } });
  mock.rpc.mockResolvedValue({ owner: false, admin: false, requests: [] });
  render(<MemoryRouter><TalentProfileActions person={person} onChange={vi.fn()}/></MemoryRouter>);
  await screen.findByRole('button', { name: 'Claim this profile' });
  expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit profile as admin' })).not.toBeInTheDocument();
});
it('requires an explicit signed declaration and submits its version with claim evidence', async () => {
  mock.getUser.mockResolvedValue({ data: { user: { id: 'member', email_confirmed_at: '2026-01-01' } } });
  mock.rpc.mockResolvedValue({ owner: false, admin: false, requests: [] });
  render(<MemoryRouter><TalentProfileActions person={person} onChange={vi.fn().mockResolvedValue(undefined)}/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Claim this profile' }));
  const signature = screen.getByLabelText('Your full name');
  const acceptance = screen.getByRole('checkbox', { name: /I have read and agree/ });
  expect(signature).toBeRequired(); expect(acceptance).toBeRequired(); expect(acceptance).not.toBeChecked();
  fireEvent.change(signature, { target: { value: 'Sample Member' } });
  fireEvent.click(acceptance);
  fireEvent.change(screen.getByLabelText(/Explain how we can confirm/), { target: { value: 'Sample evidence from my professional profile.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign declaration and submit claim' }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('talent_submit_request', expect.objectContaining({ signed_name: 'Sample Member', declaration_version: '2026-10-13-v1', declaration_accepted: true, kind: 'claim' })));
});
it('shows pending claims without granting editing access', async () => {
  mock.getUser.mockResolvedValue({ data: { user: { id: 'member', email_confirmed_at: '2026-01-01' } } });
  mock.rpc.mockResolvedValue({ owner: false, admin: false, requests: [privateRequest] });
  render(<MemoryRouter><TalentProfileActions person={person} onChange={vi.fn()}/></MemoryRouter>);
  await screen.findByText(/Your claim is awaiting manual review/);
  expect(screen.queryByRole('button', { name: 'Claim this profile' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
});
