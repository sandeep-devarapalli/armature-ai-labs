import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdminAccessPage, PassSelectionPage } from '../../src/pages/BookingPolicyPages';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), role: 'member', userId: '' }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('../../src/context/AccountContext', () => ({ useAccount: () => ({ account: { role: mocks.role, user_id: mocks.userId }, loading: false }) }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ state: { resources: [{ id: 'desk-1', name: 'Lab desk' }], profiles: [] } }) }));
const products = [{ id: 'day-1', code: 'workspace-day', name: 'Day pass', kind: 'workspace', unit: 'day', price_paise: null, enabled: false }];
beforeEach(() => {
  mocks.rpc.mockReset(); mocks.from.mockReset(); mocks.role = 'member'; mocks.userId = '';
  mocks.from.mockImplementation((table) => {
    const result = { data: table === 'booking_products' ? products : table === 'resource_booking_policies' ? [{ resource_id: 'desk-1', kind: 'workspace' }] : [], error: null };
    const query = { select: () => query, order: () => query, limit: () => query, eq: () => query, is: () => query, then: (fn: (value: unknown) => unknown) => Promise.resolve(result).then(fn) }; return query;
  });
});
it('shows server-calculated dates, closure reason and unconfigured price without payment controls', async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: { starts_on: '2026-10-01', ends_on: '2026-10-02', dates: ['2026-10-01', '2026-10-02'], closed_dates: [{ date: '2026-10-02', reason: 'Mandatory holiday' }], configured: false, total_paise: null } });
  render(<PassSelectionPage />);
  await screen.findByRole('option', { name: 'Day pass · Price not configured' });
  fireEvent.change(screen.getByLabelText('Access product'), { target: { value: 'day-1' } });
  fireEvent.change(screen.getByLabelText('Pass resource'), { target: { value: 'desk-1' } });
  for (const value of ['2026-10-01', '2026-10-02']) { fireEvent.change(screen.getByLabelText('Day-pass date'), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Add date' })); }
  fireEvent.click(screen.getByRole('button', { name: 'Check dates and price' }));
  await screen.findByText('Price not configured. Paid activation remains unavailable.');
  expect(screen.getByText(/2 October 2026: Mandatory holiday/)).toBeVisible();
  expect(mocks.rpc).toHaveBeenCalledWith('quote_access_pass', { p_product_id: 'day-1', p_dates: ['2026-10-01', '2026-10-02'], p_discount_percent: 0, p_resource_id: 'desk-1' });
  expect(screen.queryByRole('button', { name: /pay|purchase/i })).not.toBeInTheDocument();
});
it('rejects day-pass selections spanning calendar months before requesting a quote', async () => {
  render(<PassSelectionPage />); await screen.findByRole('option', { name: /Day pass/ });
  fireEvent.change(screen.getByLabelText('Access product'), { target: { value: 'day-1' } });
  for (const value of ['2026-10-31', '2026-11-01']) { fireEvent.change(screen.getByLabelText('Day-pass date'), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Add date' })); }
  expect(screen.getByRole('alert')).toHaveTextContent('same calendar month'); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('does not load lab administration records for Staff', async () => {
  mocks.role = 'membership_reviewer'; render(<AdminAccessPage />);
  expect(screen.getByRole('heading', { name: 'Lab admin access required' })).toBeVisible();
  await waitFor(() => expect(mocks.from).not.toHaveBeenCalled());
});

it('stores week renewal preference without charging or renewing a day pass', async () => {
  mocks.userId = 'user-1';
  mocks.from.mockImplementation((table) => {
    const data = table === 'booking_products' ? [...products, { ...products[0], id: 'week-1', name: 'Week pass', unit: 'week' }] : table === 'paid_access_entitlements' ? [{ id: 'grant-week', product_id: 'week-1', resource_id: 'desk-1', starts_at: '2026-10-01T03:30:00Z', ends_at: '2026-10-07T11:30:00Z' }, { id: 'grant-week-2', product_id: 'week-1', resource_id: 'desk-1', starts_at: '2026-10-02T03:30:00Z', ends_at: '2026-10-02T11:30:00Z' }, { id: 'grant-day', product_id: 'day-1', resource_id: 'desk-1', starts_at: '2026-10-01T03:30:00Z', ends_at: '2026-10-01T11:30:00Z' }] : [];
    const query = { select: () => query, order: () => query, limit: () => query, eq: () => query, is: () => query, then: (fn: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(fn) }; return query;
  });
  mocks.rpc.mockResolvedValue({ error: null });
  render(<PassSelectionPage />);
  fireEvent.click(await screen.findByRole('checkbox', { name: /Renew Week pass/ }));
  await screen.findByText('Renewal preference saved; automatic billing remains unavailable.');
  expect(mocks.rpc).toHaveBeenCalledWith('set_access_renewal', { p_entitlement_id: 'grant-week-2', p_enabled: true });
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.queryByRole('checkbox', { name: /Day pass/ })).not.toBeInTheDocument();
});
