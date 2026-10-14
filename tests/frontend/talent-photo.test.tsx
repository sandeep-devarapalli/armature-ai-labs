import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { requestTalentPhoto, TalentAvatar, TalentPhotoDemo, TalentPhotoEditor, validateTalentPhoto } from '../../src/features/talent/TalentPhoto';
import type { DirectoryPerson } from '../../src/features/talent/directorySearch';
const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) }));
vi.mock('../../src/features/talent/liveTalent', () => ({ talentClient: () => ({ auth }) }));
const person: DirectoryPerson = { id: 'sample', name: 'Sample Engineer', title: '', company: '', location: '', headline: '', summary: '', previousCompanies: [], skills: [], physicalAiAreas: [], checkedAt: '', linkedinUrl: '', claimed: true, yearsExperience: null };
beforeEach(() => { auth.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic' } } }); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => vi.unstubAllGlobals());
it('requires opt-in before publishing and keeps selection and removal available', () => {
  render(<TalentPhotoDemo/>);
  expect(screen.getByRole('button', { name: 'Use my membership photo' })).toBeDisabled();
  expect(screen.getByLabelText('Upload different photo')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Remove photo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Use my membership photo' }));
  expect(screen.getByAltText('Sample public profile')).toBeVisible();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  expect(screen.queryByAltText('Sample public profile')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it('never fetches an imported avatar without an explicit photo version and falls back on image failure', () => {
  const { rerender } = render(<TalentAvatar person={person}/>);
  expect(document.querySelector('img')).toBeNull();
  rerender(<TalentAvatar person={{ ...person, photoVersion: 'version-one' }}/>);
  expect(document.querySelector('img')?.src).toContain('profile_id=sample&v=version-one');
  fireEvent.error(document.querySelector('img')!);
  expect(screen.getByText('SE')).toBeVisible();
});
it('rejects unsupported and oversized files before getting a session or sending', async () => {
  auth.getSession.mockClear();
  await expect(requestTalentPhoto('sample', 'upload', new File(['<svg/>'], 'picture.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPEG or PNG');
  const large = new File(['x'], 'photo.png', { type: 'image/png' }); Object.defineProperty(large, 'size', { value: 5 * 1024 * 1024 + 1 });
  expect(() => validateTalentPhoto(large)).toThrow('5 MiB');
  expect(auth.getSession).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('sends separate public consent and removes without requesting membership deletion', async () => {
  vi.mocked(fetch).mockImplementation(async () => new Response('{}'));
  await requestTalentPhoto('sample', 'membership');
  const options = vi.mocked(fetch).mock.calls[0][1]!;
  expect(JSON.parse(String(options.body))).toEqual({ use_membership_photo: true, consent_version: '2026-10-13-public-photo-v1' });
  await requestTalentPhoto('sample', 'remove');
  expect(vi.mocked(fetch).mock.calls[1][0]).toContain('/talent-profile-photo?profile_id=sample');
  expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBe('DELETE');
});
it('does not send without authentication', async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  await expect(requestTalentPhoto('sample', 'remove')).rejects.toThrow('Sign in'); expect(fetch).not.toHaveBeenCalled();
});
it('preserves the current photo and does not refresh the profile after a failed mutation', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Try again later.' }), { status: 503 }));
  const changed = vi.fn(); render(<TalentPhotoEditor person={{ ...person, photoVersion: 'existing' }} onChange={changed}/>);
  await waitFor(() => expect(screen.getByText('No membership photo available')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again later.'));
  expect(document.querySelector('.talent-avatar img')?.getAttribute('src')).toContain('v=existing'); expect(changed).not.toHaveBeenCalled();
});

it('does not show a photo for an unclaimed profile even if a version was supplied', () => {
  render(<TalentAvatar person={{ ...person, claimed: false, photoVersion: 'not-authorized' }}/>);
  expect(document.querySelector('img')).toBeNull(); expect(screen.getByText('SE')).toBeVisible();
});
it('stages an upload for preview and waits for new consent and Save photo', async () => {
  const originalCreate = URL.createObjectURL; const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => 'blob:staged'); URL.revokeObjectURL = vi.fn();
  render(<TalentPhotoDemo/>);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Upload different photo'), { target: { files: [new File(['png'], 'selected.png', { type: 'image/png' })] } });
  expect(screen.getByAltText('Selected photo preview')).toBeVisible();
  expect(screen.queryByAltText('Sample public profile')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Save photo' })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  expect(screen.getByAltText('Sample public profile')).toBeVisible();
  await waitFor(() => expect(screen.queryByAltText('Selected photo preview')).not.toBeInTheDocument());
  expect(fetch).not.toHaveBeenCalled(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
});
