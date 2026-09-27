import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BookingInventoryAdmin } from '../../src/components/BookingInventoryAdmin';
const mock = vi.hoisted(() => ({ role: 'admin', rpc: vi.fn(), from: vi.fn() }));
vi.mock('../../src/context/AccountContext', () => ({ useAccount: () => ({ account: { role: mock.role } }) }));
vi.mock('../../src/lib/supabase', () => ({ supabase: mock }));
beforeEach(() => {
  mock.role = 'admin'; mock.rpc.mockReset(); mock.from.mockReset();
  mock.from.mockReturnValue({ select: () => ({ order: async () => ({ data: [{ id: 'chair-1', name: 'S01', active: true, reservable: true, capacity: 1 }], error: null }) }) });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
it('requires a confirmed, reasoned server operation and reports retained reservations', async () => {
  mock.rpc.mockResolvedValue({ error: null });
  render(<BookingInventoryAdmin />);
  await screen.findByRole('option', { name: /S01/ });
  fireEvent.change(screen.getByLabelText('Availability resource'), { target: { value: 'chair-1' } });
  fireEvent.change(screen.getByLabelText('Availability change reason'), { target: { value: 'Chair repair' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save resource availability' }));
  await screen.findByText('S01: new bookings disabled. Existing reservations retained.');
  expect(mock.rpc).toHaveBeenCalledWith('set_booking_resource_enabled', { p_resource_id: 'chair-1', p_enabled: false, p_reason: 'Chair repair' });
});
it('does not mutate when confirmation is declined', async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  render(<BookingInventoryAdmin />);
  await screen.findByRole('option', { name: /S01/ });
  fireEvent.change(screen.getByLabelText('Availability resource'), { target: { value: 'chair-1' } });
  fireEvent.change(screen.getByLabelText('Availability change reason'), { target: { value: 'Chair repair' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save resource availability' }));
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('does not expose inventory controls or query resources for membership-review staff', () => {
  mock.role = 'membership_reviewer';
  render(<BookingInventoryAdmin />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(mock.from).not.toHaveBeenCalled();
});
