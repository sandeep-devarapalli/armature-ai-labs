import { act, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AccountMenu } from '../../src/components/AccountMenu';
import type { AccountSummary } from '../../src/context/AccountContext';

const mock = vi.hoisted(() => ({ account: null as AccountSummary | null, signedIn: false, loading: true, error: '', refresh: vi.fn(), signOut: vi.fn() }));
vi.mock('../../src/lib/supabase', async importOriginal => ({ ...await importOriginal<object>(), supabase: null }));
vi.mock('../../src/context/AccountContext', async importOriginal => ({ ...await importOriginal<object>(), useAccount: () => mock }));

it('hydrates the loading header before showing an account restored ahead of the header', async () => {
  const tree = <MemoryRouter><AccountMenu/></MemoryRouter>;
  const html = renderToString(tree);
  expect(html).toContain('Loading account');
  mock.signedIn = true; mock.loading = false;
  mock.account = { user_id: 'synthetic-user', name: 'Synthetic member', email: 'synthetic@example.test', status: 'incomplete', application_status: null, role: 'member', revision: 1, owner_approval_available: false };
  const container = document.createElement('div'); container.innerHTML = html; document.body.append(container);
  const recoverable = vi.fn(); let root!: Root;
  try {
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: recoverable }); });
    await screen.findByLabelText('Account: Synthetic member');
    expect(recoverable).not.toHaveBeenCalled();
    mock.signedIn = false; mock.account = null;
    await act(async () => root.render(<MemoryRouter><AccountMenu/></MemoryRouter>));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Account: Synthetic member')).not.toBeInTheDocument();
  } finally { await act(async () => root?.unmount()); container.remove(); }
});
