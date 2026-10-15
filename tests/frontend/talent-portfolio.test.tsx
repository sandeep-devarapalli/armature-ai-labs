import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { TalentProfileActions } from '../../src/features/talent/TalentRequests';
import { safePortfolioUrl, TalentPortfolio } from '../../src/features/talent/TalentPortfolio';
import type { DirectoryPerson } from '../../src/features/talent/directorySearch';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/talent/liveTalent', () => ({ talentRpc: rpc, talentClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner', email_confirmed_at: '2026-01-01' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } }) }));
const person: DirectoryPerson = { id: 'p1', name: 'Sample', title: '', headline: '', company: '', location: '', previousCompanies: [], skills: ['Embedded'], physicalAiAreas: [], summary: '', checkedAt: '', linkedinUrl: '', yearsExperience: null, claimed: true, revision: 2 };
it('saves a personal contribution with existing skills and availability through the owner RPC', async () => {
  rpc.mockReset().mockResolvedValue({ owner: true, admin: false, requests: [] });
  render(<MemoryRouter><TalentProfileActions person={person} onChange={vi.fn().mockResolvedValue(undefined)}/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));
  fireEvent.change(screen.getByLabelText('Project title'), { target: { value: 'Sensor board' } });
  fireEvent.change(screen.getByLabelText('Project summary'), { target: { value: 'Open sensor acquisition board' } });
  fireEvent.change(screen.getByLabelText('Your individual contribution'), { target: { value: 'I wrote the SPI driver and tested sample timing.' } });
  fireEvent.change(screen.getByLabelText(/Skills used/), { target: { value: 'C++\nSPI' } });
  fireEvent.change(screen.getByLabelText(/Public evidence link/), { target: { value: 'https://example.org/board' } });
  fireEvent.change(screen.getByLabelText('Availability'), { target: { value: 'available' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await screen.findByText('Profile updated.');
  expect(rpc).toHaveBeenCalledWith('talent_update_profile', expect.objectContaining({ expected_revision: 2, patch: expect.objectContaining({ skills: ['Embedded'], availability: 'available', portfolioProjects: [{ title: 'Sensor board', summary: 'Open sensor acquisition board', contribution: 'I wrote the SPI driver and tested sample timing.', skills: ['C++','SPI'], evidenceUrl: 'https://example.org/board' }] }) }));
});
it('renders contributed evidence as unverified and does not turn unsafe URLs into links', () => {
  const p = { title: 'Sensor board', summary: 'Sample project', contribution: 'Firmware driver', skills: ['C++'], evidenceUrl: 'javascript:alert(1)' };
  render(<TalentPortfolio projects={[p]}/>);
  expect(screen.getByText(/not independently verified/)).toBeInTheDocument();
  expect(screen.getByText('Firmware driver')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(safePortfolioUrl('https://user:password@example.org/project')).toBeUndefined();
  expect(safePortfolioUrl('https://example.org/project')).toBe('https://example.org/project');
});
it('keeps a missing portfolio explicit', () => {
  render(<TalentPortfolio/>);
  expect(screen.getByText(/Not provided/)).toBeInTheDocument();
});
it('removes only the selected project while editing', async () => {
  rpc.mockReset().mockResolvedValue({ owner: true, admin: false, requests: [] });
  render(<MemoryRouter><TalentProfileActions person={{ ...person, portfolioProjects: [{ title: 'Keep me', summary: 'Summary', contribution: 'Contribution', skills: [], evidenceUrl: '' }] }} onChange={vi.fn().mockResolvedValue(undefined)}/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove project 2' }));
  expect(within(screen.getByRole('group', { name: 'Project 1' })).getByLabelText('Project title')).toHaveValue('Keep me');
  expect(screen.queryByRole('group', { name: 'Project 2' })).not.toBeInTheDocument();
});
