import { fireEvent, render, screen } from '@testing-library/react';
import { ContentBlock } from '../../course-app/LessonBlocks';
import type { Block } from '../../course-app/types';

const figure: Block = { id: 'fig', type: 'illustration', content: { name: 'test_figure', caption: 'Who reads each part', svgCode: '<svg viewBox="0 0 480 280"><text x="10" y="20">Small label</text><script>alert(1)</script></svg>' } };

it('opens a full-screen view of a figure from the button and closes it with Escape, returning focus', () => {
  render(<ContentBlock block={figure} />);
  const opener = screen.getByRole('button', { name: 'Enlarge diagram' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Enlarged diagram' });
  expect(dialog).toHaveTextContent('Small label');
  expect(dialog).toHaveTextContent('Who reads each part');
  expect(dialog.innerHTML).not.toContain('<script');
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('');
  expect(opener).toHaveFocus();
});

it('opens when the figure itself is tapped, zooms, keeps focus inside and closes from the backdrop', () => {
  const { container } = render(<ContentBlock block={figure} />);
  fireEvent.click(container.querySelector('.diagram-art-open')!);
  const dialog = screen.getByRole('dialog');
  const zoom = screen.getByRole('button', { name: 'Zoom in' });
  fireEvent.click(zoom);
  expect(screen.getByRole('button', { name: 'Fit to screen' })).toHaveAttribute('aria-pressed', 'true');
  expect(dialog.querySelector('.diagram-viewer-stage')).toHaveClass('zoomed');
  const close = screen.getByRole('button', { name: 'Close' });
  close.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Fit to screen' })).toHaveFocus();
  fireEvent.click(dialog);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('offers no enlarge control when the figure is missing', () => {
  render(<ContentBlock block={{ id: 'missing', type: 'illustration', content: { name: 'absent' } }} />);
  expect(screen.queryByRole('button', { name: 'Enlarge diagram' })).not.toBeInTheDocument();
  expect(screen.getByText(/This source diagram is unavailable/)).toBeInTheDocument();
});
