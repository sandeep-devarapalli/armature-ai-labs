import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TalentSkills } from '../../src/features/talent/TalentSkills';

const observers: ControlledResizeObserver[] = [];
class ControlledResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: ResizeObserverCallback) { observers.push(this); }
  report() { this.callback([], this as unknown as ResizeObserver); }
}
const items = ['Embedded', 'Robot Hardware & Actuation', 'Manipulation', 'Simulation', 'Motion Planning', 'Tactile Sensing'];
let reduced = false;
beforeEach(() => {
  observers.length = 0; reduced = false;
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function dimensions() {
  const row = screen.getByRole('region', { name: 'All skills for Synthetic engineer' });
  const rail = row.parentElement!;
  let width = 500, contents = 900, left = 0;
  Object.defineProperty(rail, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(row, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(row, 'scrollWidth', { configurable: true, get: () => contents });
  Object.defineProperty(row, 'scrollLeft', { configurable: true, get: () => left });
  const scrollBy = vi.fn(); Object.defineProperty(row, 'scrollBy', { configurable: true, value: scrollBy });
  act(() => observers.at(-1)!.report());
  return { row, scrollBy, resize: (value: number) => { width = value; act(() => observers.at(-1)!.report()); }, scroll: (value: number) => { left = value; fireEvent.scroll(row); }, contents: (value: number) => { contents = value; act(() => observers.at(-1)!.report()); } };
}

it('exposes every complete skill in a labelled keyboard-focusable region', () => {
  render(<TalentSkills items={items} name="Synthetic engineer"/>);
  const row = screen.getByRole('region', { name: 'All skills for Synthetic engineer' });
  expect(row).toHaveAttribute('tabindex', '0');
  expect([...row.children].map(child => child.textContent)).toEqual(items);
  expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('updates the directional controls at scroll boundaries and removes them when the skills fit', () => {
  render(<TalentSkills items={items} name="Synthetic engineer"/>);
  const controls = dimensions();
  const previous = screen.getByRole('button', { name: 'Scroll skills left for Synthetic engineer' });
  const next = screen.getByRole('button', { name: 'Scroll skills right for Synthetic engineer' });
  expect(previous).toBeDisabled(); expect(next).toBeEnabled();
  expect(next).toHaveAttribute('aria-controls', controls.row.id);
  fireEvent.click(next); expect(controls.scrollBy).toHaveBeenLastCalledWith({ left: 375, behavior: 'smooth' });
  controls.scroll(400); expect(previous).toBeEnabled(); expect(next).toBeDisabled();
  fireEvent.click(previous); expect(controls.scrollBy).toHaveBeenLastCalledWith({ left: -375, behavior: 'smooth' });
  controls.resize(1000); expect(screen.queryByRole('button')).not.toBeInTheDocument();
  controls.resize(500); expect(screen.getByRole('button', { name: 'Scroll skills left for Synthetic engineer' })).toBeEnabled();
});

it('supports directional and boundary keys without intercepting normal vertical scrolling', () => {
  render(<TalentSkills items={items} name="Synthetic engineer"/>);
  const { row, scrollBy } = dimensions(); reduced = true;
  for (const [key, left] of [['ArrowRight', 100], ['ArrowLeft', -100], ['End', 900], ['Home', -900]] as const) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    fireEvent(row, event); expect(event.defaultPrevented).toBe(true);
    expect(scrollBy).toHaveBeenLastCalledWith({ left, behavior: 'instant' });
  }
  scrollBy.mockClear();
  const vertical = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  fireEvent(row, vertical); expect(vertical.defaultPrevented).toBe(false); expect(scrollBy).not.toHaveBeenCalled();
});

it('cleans up observers and rechecks replacement skills', () => {
  const view = render(<TalentSkills items={items} name="Synthetic engineer"/>);
  const controls = dimensions(); expect(observers[0].observe).toHaveBeenCalledTimes(2);
  view.rerender(<TalentSkills items={['Embedded']} name="Synthetic engineer"/>);
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  controls.contents(100); expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('region').textContent).toBe('Embedded');
  view.unmount(); expect(observers.at(-1)!.disconnect).toHaveBeenCalledOnce();
});

it('retains the existing empty-skills presentation', () => {
  render(<TalentSkills items={[]} name="Synthetic engineer"/>);
  expect(screen.getByText('Not provided')).toBeInTheDocument();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
