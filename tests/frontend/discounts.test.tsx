import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ role: 'admin' as string | null, user: 'admin', rpc: vi.fn() }));
vi.mock('../../src/context/AccountContext', () => ({ useAccount: () => ({ account: mock.role ? { user_id: mock.user, role: mock.role } : null, loading: false }) }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc: mock.rpc } }));
import { AdminDiscountsPage } from '../../src/pages/AdminDiscountsPage';
import { DiscountOffers } from '../../src/components/DiscountOffers';
const offer = { id: 'offer', revision: 2, name: 'October offer', description: 'Test promotion', audience: 'public', member_id: null, code: null, value_kind: 'percent', value: 10, categories: ['coworking'], starts_at: '2030-10-01T03:30:00Z', ends_at: '2030-10-08T03:30:00Z', state: 'paused', personal_use: 'once', total_limit: null, per_member_limit: null, stack_with_launch: false };
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); mock.role = 'admin'; mock.user = 'admin'; mock.rpc.mockReset(); mock.rpc.mockImplementation(async (name, args) => ({ data: name === 'admin_discount_offers' ? [offer] : name === 'list_basic_members' ? { items: [{ user_id: 'person', name: 'Synthetic Member', email: 'member@example.test' }] } : name === 'save_discount_offer' ? { ...args.p_offer, id: 'offer', revision: 3 } : [], error: null })); });
it.each([null, 'member', 'membership_reviewer'])('blocks %s before reading discounts', role => { mock.role = role; render(<AdminDiscountsPage />); expect(screen.getByText('Admin access required')).toBeVisible(); expect(mock.rpc).not.toHaveBeenCalled(); });
it.each(['once', 'repeat_until_expiry'])('previews then saves personal %s offers with IST dates and revision', async usage => {
 render(<AdminDiscountsPage />); fireEvent.click(await screen.findByRole('button', { name: 'Edit October offer' }));
 fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'personal' } });
 expect(screen.getByLabelText('Personal offer usage')).toHaveValue('once');
 fireEvent.change(screen.getByLabelText('Find member by name or email'), { target: { value: 'member' } });
 await screen.findByRole('option', { name: /Synthetic Member/ });
 fireEvent.change(screen.getByLabelText('Selected member'), { target: { value: 'person' } });
 fireEvent.change(screen.getByLabelText('Personal offer usage'), { target: { value: usage } });
 fireEvent.change(screen.getByLabelText('Starts · IST'), { target: { value: '2030-10-01T10:00' } });
 fireEvent.click(screen.getByRole('button', { name: 'Review discount' }));
 expect(screen.getByRole('region', { name: 'Review discount' })).toBeVisible();
 expect(mock.rpc.mock.calls.some(call => call[0] === 'save_discount_offer')).toBe(false);
 fireEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
 await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('save_discount_offer', expect.objectContaining({ p_id: 'offer', p_expected_revision: 2, p_offer: expect.objectContaining({ member_id: 'person', personal_use: usage, starts_at: '2030-10-01T04:30:00.000Z' }) })));
});
it('shows stale update error without claiming save success', async () => {
 const original = mock.rpc.getMockImplementation()!; mock.rpc.mockImplementation((name, args) => name === 'save_discount_offer' ? Promise.resolve({ error: { message: 'Offer changed. Reload before editing.' } }) : original(name, args));
 render(<AdminDiscountsPage />); fireEvent.click(await screen.findByRole('button', { name: 'Edit October offer' })); fireEvent.click(screen.getByRole('button', { name: 'Review discount' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('Offer changed'); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('never shows cached personal offers after account switching', async () => {
 mock.rpc.mockImplementation(async name => ({ data: name === 'my_discount_offers' ? [{ ...offer, name: 'Private reward', audience: 'personal' }] : [], error: null }));
 const view = render(<DiscountOffers categories={['coworking']} />); await screen.findByText('Private reward');
 mock.user = 'different'; mock.rpc.mockImplementation(() => new Promise(() => {})); view.rerender(<DiscountOffers categories={['coworking']} />);
 expect(screen.queryByText('Private reward')).not.toBeInTheDocument();
});
it('anonymous visitors request only public offers', async () => {
 mock.role = null; mock.rpc.mockResolvedValue({ data: [offer], error: null }); render(<DiscountOffers categories={['coworking']} />); await screen.findByText('October offer'); expect(mock.rpc).toHaveBeenCalledTimes(1); expect(mock.rpc).toHaveBeenCalledWith('public_discount_offers', undefined, { get: true });
});
it('labels safe public projections as general and displays the purchase window', async () => {
 mock.role = null;
 const { audience: _audience, ...safe } = offer;
 mock.rpc.mockResolvedValue({ data: [safe], error: null });
 render(<DiscountOffers categories={['coworking']} />);
 await screen.findByText('October offer');
 expect(screen.getByText(/General promotion/)).toBeVisible();
 expect(screen.queryByText(/Your private offer/)).not.toBeInTheDocument();
 expect(screen.getByText(/Eligible purchases from/)).toHaveTextContent('2030');
});
it('requests a server quote for the assigned member without payment or redemption', async () => {
 const original = mock.rpc.getMockImplementation()!;
 mock.rpc.mockImplementation((name, args) => {
  if (name === 'admin_discount_offers') return Promise.resolve({ data: [{ ...offer, audience: 'personal', member_id: 'person' }], error: null });
  if (name === 'admin_discount_member') return Promise.resolve({ data: { name: 'Synthetic Member', email: 'member@example.test' }, error: null });
  if (name === 'admin_discount_quote_products') return Promise.resolve({ data: [{ id: 'day', name: 'Day pass', kind: 'workspace', enabled: true }], error: null });
  if (name === 'admin_preview_discount_access') return Promise.resolve({ data: { base_paise: 50000, launch_discount_paise: 15000, offer_discount_paise: 3500, offer_name: 'Personal award', payable_paise: 31500, expires_at: '2030-10-01T04:00:00Z' }, error: null });
  return original(name, args);
 });
 render(<AdminDiscountsPage />); fireEvent.click(await screen.findByRole('button', { name: 'Edit October offer' }));
 await screen.findByRole('option', { name: 'Day pass' });
 fireEvent.change(screen.getByLabelText('Service dates · YYYY-MM-DD, comma separated'), { target: { value: '2030-10-01' } });
 fireEvent.click(screen.getByRole('button', { name: 'Calculate server quote' }));
 await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('admin_preview_discount_access', { p_member_id: 'person', p_product_id: 'day', p_dates: ['2030-10-01'], p_resource_id: null, p_seats: 1, p_code: null }));
 expect(await screen.findByText('Total before tax: ₹315.00')).toBeVisible();
 expect(mock.rpc.mock.calls.some(([name]) => /redeem|consume|payment|checkout/.test(name))).toBe(false);
});
