import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TalentMemberNavigation, useTalentMember } from '../../src/features/talent/TalentMemberNavigation';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), account: { user: null as null | { id: string; email_confirmed_at: string }, loading: false, error: '', epoch: 0 } }));
vi.mock('../../src/features/talent/liveTalent', () => ({ talentRpc: mock.rpc }));
vi.mock('../../src/features/talent/talentAccount', () => ({ useSubmissionAccount: () => mock.account }));
beforeEach(() => { mock.rpc.mockReset(); mock.account.user = null; });
it('shows only the two public destinations while signed out, even with stale admin state', () => {
  render(<TalentMemberNavigation route="talent" signedIn={false} isAdmin unread={5} profileLabel="Add my profile"/>);
  expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Find talent', 'Find work']);
});
it('gives members a prominent profile button without a requests tab', () => {
  render(<TalentMemberNavigation route="work" signedIn isAdmin={false} unread={2} profileLabel="Add my profile"/>);
  expect(screen.getByRole('link', { name: 'Add my profile' })).toHaveClass('button', 'primary');
  expect(screen.getByRole('link', { name: 'Add my profile' })).toHaveAttribute('href', '#add-profile');
  expect(screen.getByRole('link', { name: 'Messages (2)' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'My requests' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Review profiles' })).not.toBeInTheDocument();
});
function State() { const member = useTalentMember('talent'); return <p>{member.profile?.ownerId || (member.profile?.started ? 'Setup' : 'No owner')}{member.profileError}</p>; }
it('checks current ownership instead of trusting a historical claim approval', async () => {
  mock.account.user = { id: 'u1', email_confirmed_at: 'confirmed' };
  mock.rpc.mockImplementation(async name => name === 'talent_my_requests' ? [{ kind: 'claim', status: 'approved', profile_id: 'former' }] : name === 'talent_my_submissions' ? [{ status: 'approved', profile_id: 'current' }] : null);
  render(<State/>);
  await screen.findByText('Setup');
  expect(mock.rpc).toHaveBeenCalledWith('talent_my_profile');
});
it('discards ownership responses from a previous account', async () => {
  mock.account.user = { id: 'u1', email_confirmed_at: 'confirmed' };
  let resolve!: (status: { id: string }) => void;
  mock.rpc.mockImplementation(async name => name === 'talent_my_requests' ? [{ kind: 'claim', status: 'approved', profile_id: 'private-profile' }] : name === 'talent_my_submissions' ? [] : new Promise(done => { resolve = done; }));
  const view = render(<State/>);
  await waitFor(() => expect(resolve).toBeDefined());
  mock.account.user = null; view.rerender(<State/>);
  await act(async () => resolve({ id: 'private-profile' }));
  expect(screen.queryByText('private-profile')).not.toBeInTheDocument();
});
it('never reads private profile history for anonymous visitors', () => { render(<State/>); expect(mock.rpc).not.toHaveBeenCalled(); });

it('opens the editor directly from the same member profile action', () => {
  render(<TalentMemberNavigation route="talent" signedIn isAdmin={false} unread={0} profileLabel="Edit my profile"/>);
  expect(screen.getByRole('link', { name: 'Edit my profile' })).toHaveAttribute('href', '#edit-profile');
  expect(screen.queryByRole('link', { name: 'Add my profile' })).not.toBeInTheDocument();
});
