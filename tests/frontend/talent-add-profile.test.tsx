import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { TalentAddProfile, TalentSubmissionHistory, profileDeclarationVersion } from '../../src/features/talent/TalentAddProfile';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), change: (_event?: string, _session?: { user: { id: string; email_confirmed_at?: string } } | null) => {} }));
vi.mock('../../src/features/talent/liveTalent', () => ({ talentRpc: mock.rpc, talentClient: () => ({ auth: { getUser: mock.getUser, onAuthStateChange: (callback: typeof mock.change) => { mock.change = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } }) }));
const data = { name: 'Synthetic Person', title: 'Embedded engineer', company: '', location: 'Bengaluru', headline: '', summary: '', linkedinUrl: 'https://www.linkedin.com/in/synthetic-person', skills: [], physicalAiAreas: [], previousCompanies: [], yearsExperience: null, education: '', experience: '', availability: 'unknown' };
const row = { id: 's1', revision: 1, status: 'draft', data, evidence: 'My own public portfolio documents my engineering work.', created_at: '2026-10-14' };
beforeEach(() => { mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email_confirmed_at: '2026-01-01' } } }); mock.rpc.mockReset().mockImplementation(async (name, args) => { if (name === 'talent_my_submissions') return []; if (name === 'talent_check_submission_identity') return { status: 'available', linkedin_url: data.linkedinUrl }; if (name === 'talent_save_submission') return { ...row, revision: (args.expected_revision || 0) + 1, data: args.profile_data, evidence: args.private_evidence }; if (name === 'talent_submit_profile') return { ...row, status: 'pending' }; return []; }); });
function open() { render(<MemoryRouter><TalentAddProfile/></MemoryRouter>); }
async function identity() {
  const next = await screen.findByRole('button', { name: 'Continue' });
  await waitFor(() => expect(next).toBeEnabled());
  fireEvent.click(next);
  fireEvent.change(screen.getByLabelText('Your personal LinkedIn URL'), { target: { value: data.linkedinUrl } });
  const check = await screen.findByRole('button', { name: 'Check LinkedIn profile' });
  await waitFor(() => expect(check).toBeEnabled());
  fireEvent.click(check);
}
it('requires membership and never queries private drafts while signed out', async () => { mock.getUser.mockResolvedValue({ data: { user: null } }); open(); await screen.findByRole('link', { name: 'Sign in / join as a basic member' }); expect(mock.rpc).not.toHaveBeenCalled(); });
it('requires confirmed email before collecting details', async () => { mock.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } }); open(); await screen.findByText(/Confirm your account email/); expect(mock.rpc).not.toHaveBeenCalled(); });
it('routes an existing identity to its profile without saving another person', async () => { mock.rpc.mockImplementation(async name => name === 'talent_my_submissions' ? [] : { status: 'existing', profile_id: 'p1', linkedin_url: data.linkedinUrl }); open(); await identity(); expect(await screen.findByRole('link', { name: 'Open existing profile' })).toHaveAttribute('href', '#profile/p1'); expect(mock.rpc.mock.calls.some(([name]) => name === 'talent_save_submission')).toBe(false); });
it('saves the private draft and requires a matching signature for submission', async () => {
  open(); await identity(); await screen.findByLabelText('Full name');
  for (const [label, value] of [['Full name', data.name], ['Current title', data.title], ['City / location', data.location], ['Private identity and capability evidence', row.evidence]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and preview' })); await screen.findByLabelText('Type your full name');
  expect(mock.rpc).toHaveBeenCalledWith('talent_save_submission', expect.objectContaining({ private_evidence: row.evidence, profile_data: expect.objectContaining({ name: data.name }) }));
  fireEvent.change(screen.getByLabelText('Type your full name'), { target: { value: 'Another Person' } }); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Sign and submit for review' })); await screen.findByText('Your typed signature must match your full name.');
  expect(mock.rpc.mock.calls.some(([name]) => name === 'talent_submit_profile')).toBe(false);
  fireEvent.change(screen.getByLabelText('Type your full name'), { target: { value: data.name } }); fireEvent.click(screen.getByRole('button', { name: 'Sign and submit for review' })); await screen.findByText('Awaiting manual review');
  expect(mock.rpc).toHaveBeenCalledWith('talent_submit_profile', expect.objectContaining({ declaration_version: profileDeclarationVersion, declaration_accepted: true, expected_revision: 2 }));
});
it('keeps unsaved details and exposes retry after a persistence failure', async () => { open(); await identity(); await screen.findByLabelText('Full name'); fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Unsaved name' } }); mock.rpc.mockRejectedValue(new Error('Connection unavailable')); fireEvent.click(screen.getByRole('button', { name: 'Save private draft' })); await screen.findByText('Connection unavailable'); expect(screen.getByLabelText('Full name')).toHaveValue('Unsaved name'); expect(screen.queryByText(/Private draft saved/)).not.toBeInTheDocument(); });
it('resumes a changes-requested draft and rechecks the identity before editing', async () => { mock.rpc.mockResolvedValue([{ ...row, status: 'changes_requested' }]); open(); fireEvent.click(await screen.findByRole('button', { name: 'Resume' })); expect(screen.getByLabelText('Your personal LinkedIn URL')).toHaveValue(data.linkedinUrl); expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument(); });
it('clears private details immediately when accounts change', async () => { mock.rpc.mockResolvedValue([row]); open(); fireEvent.click(await screen.findByRole('button', { name: 'Resume' })); mock.getUser.mockResolvedValue({ data: { user: null } }); act(() => mock.change()); expect(screen.queryByDisplayValue(data.linkedinUrl)).not.toBeInTheDocument(); await screen.findByRole('link', { name: 'Sign in / join as a basic member' }); });
it('review approval requires explicit independent review confirmation', async () => { mock.rpc.mockResolvedValue([{ ...row, status: 'pending', declaration: { text: 'Declaration', signed_name: data.name } }]); render(<MemoryRouter><TalentSubmissionHistory review/></MemoryRouter>); await screen.findByText('Private evidence'); fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'approved' } }); expect(screen.getByRole('button', { name: 'Save review decision' })).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox')); expect(screen.getByRole('button', { name: 'Save review decision' })).toBeEnabled(); });

it('preserves unsaved fields through token refresh and same-user sign-in', async () => {
  open(); await identity(); await screen.findByLabelText('Full name');
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Unsaved name' } });
  const session = { user: { id: 'u1', email_confirmed_at: '2026-01-01' } };
  act(() => mock.change('TOKEN_REFRESHED', session));
  act(() => mock.change('SIGNED_IN', session));
  expect(screen.getByLabelText('Full name')).toHaveValue('Unsaved name');
  expect(mock.rpc.mock.calls.filter(([name]) => name === 'talent_my_submissions')).toHaveLength(1);
});

it('waits for initial private drafts before checking a LinkedIn identity', async () => {
  let resolveDrafts!: (rows: unknown[]) => void;
  mock.rpc.mockImplementationOnce(() => new Promise(resolve => { resolveDrafts = resolve; }));
  open();
  const next = await screen.findByRole('button', { name: 'Continue' });
  expect(next).toBeDisabled();
  expect(mock.rpc).not.toHaveBeenCalledWith('talent_check_submission_identity', expect.anything());
  await act(async () => { resolveDrafts([]); });
  await identity();
  await screen.findByLabelText('Full name');
  expect(mock.rpc).toHaveBeenCalledWith('talent_check_submission_identity', { linkedin_url: data.linkedinUrl });
});
