import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TalentPagination } from '../../src/features/talent/TalentPagination';

afterEach(() => vi.restoreAllMocks());
const props = { page: 1, pages: 11, pageSize: 10, total: 103, loading: false, onChange: vi.fn() };
const numbers = () => within(screen.getByRole('group', { name: 'Choose a results page' })).getAllByRole('button');

it('shows up to five separate page buttons and advances through the sliding window', () => {
  const onChange = vi.fn();
  const view = render(<TalentPagination {...props} onChange={onChange}/>);
  expect(numbers().map(button => button.textContent)).toEqual(['1', '2', '3', '4', '5']);
  expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Page 5' })); expect(onChange).toHaveBeenLastCalledWith(5);
  view.rerender(<TalentPagination {...props} page={6} onChange={onChange}/>);
  expect(numbers().map(button => button.textContent)).toEqual(['4', '5', '6', '7', '8']);
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); expect(onChange).toHaveBeenLastCalledWith(7);
  view.rerender(<TalentPagination {...props} page={11} onChange={onChange}/>);
  expect(numbers().map(button => button.textContent)).toEqual(['7', '8', '9', '10', '11']);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

it('handles small result sets, busy results and empty results', () => {
  const view = render(<TalentPagination {...props} pages={3} total={23}/>);
  expect(numbers()).toHaveLength(3);
  view.rerender(<TalentPagination {...props} loading/>);
  expect(screen.getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true);
  view.rerender(<TalentPagination {...props} total={0}/>);
  expect(screen.queryByRole('navigation', { name: 'Results pages' })).not.toBeInTheDocument();
});

it('uses four numbers on narrow screens and updates when the viewport changes', () => {
  let change = () => {};
  const media = { matches: true, addEventListener: vi.fn((_event, callback) => { change = callback; }), removeEventListener: vi.fn() };
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  const view = render(<TalentPagination {...props}/>);
  expect(numbers()).toHaveLength(4);
  act(() => { media.matches = false; change(); });
  expect(numbers()).toHaveLength(5);
  view.unmount(); expect(media.removeEventListener).toHaveBeenCalledWith('change', change);
});
