import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TalentLoadingPlaceholder } from '../../src/features/talent/TalentLoadingPlaceholder';

let hidden = false;
const observers: ControlledIntersectionObserver[] = [];
class ControlledIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) { observers.push(this); }
  report(isIntersecting: boolean) {
    this.callback([{ isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  hidden = false;
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => hidden ? 'hidden' : 'visible');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps decorative rows out of the accessibility tree while leaving the pause control usable', () => {
  const { container } = render(<TalentLoadingPlaceholder/>);
  const decoration = container.querySelector('.talent-skeletons');
  expect(decoration).toHaveAttribute('aria-hidden', 'true');
  expect(decoration?.querySelectorAll('.talent-skeleton')).toHaveLength(3);
  const pause = screen.getByRole('button', { name: 'Pause animation' });
  expect(pause).toBeEnabled();
  expect(pause.closest('[aria-hidden="true"]')).toBeNull();
});

it('lets the visitor pause and resume the loading motion without changing the loading content', () => {
  const { container } = render(<TalentLoadingPlaceholder/>);
  const loading = container.querySelector('.talent-loading');
  fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }));
  expect(loading).toHaveAttribute('data-motion-paused', 'true');
  expect(container.querySelectorAll('.talent-skeleton')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Resume animation' }));
  expect(loading).toHaveAttribute('data-motion-paused', 'false');
});

it('combines tab visibility and intersection so becoming visible cannot resume an offscreen placeholder', () => {
  hidden = true;
  const { container } = render(<TalentLoadingPlaceholder/>);
  const loading = container.querySelector('.talent-loading');
  expect(loading).toHaveAttribute('data-motion-hidden', 'true');
  act(() => observers[0].report(false));
  hidden = false;
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(loading).toHaveAttribute('data-motion-hidden', 'true');
  act(() => observers[0].report(true));
  expect(loading).toHaveAttribute('data-motion-hidden', 'false');
  hidden = true;
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  act(() => observers[0].report(true));
  expect(loading).toHaveAttribute('data-motion-hidden', 'true');
});

it('disconnects its observer and removes its visibility subscription when results replace it', () => {
  const added = vi.spyOn(document, 'addEventListener');
  const removed = vi.spyOn(document, 'removeEventListener');
  const view = render(<TalentLoadingPlaceholder/>);
  const listener = added.mock.calls.find(([event]) => event === 'visibilitychange')?.[1];
  expect(listener).toBeDefined();
  expect(observers[0].observe).toHaveBeenCalled();
  view.unmount();
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  expect(removed.mock.calls.some(([event, callback]) => event === 'visibilitychange' && callback === listener)).toBe(true);
});
