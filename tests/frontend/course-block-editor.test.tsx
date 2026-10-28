import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CourseBlockEditor } from '../../course-app/CourseBlockEditor';
import { ContentBlock } from '../../course-app/LessonBlocks';
import type { Block } from '../../course-app/types';

async function expand(label: string) {
  const details = screen.getByText(label).closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await waitFor(() => expect(within(details).getByText('Learner preview')).toBeInTheDocument());
  return details;
}

it('preserves block IDs, order, source metadata and untouched values while editing explanation HTML', async () => {
  const blocks: Block[] = [
    { id: 'source-1', type: 'text', content: { html: '<p>Original</p>', title: 'Retained source title' } },
    { id: 'source-2', type: 'math', content: { latex: 'x^2' } },
  ];
  const onChange = vi.fn(); render(<CourseBlockEditor blocks={blocks} onChange={onChange} />);
  expect(onChange).not.toHaveBeenCalled();
  await expand('1. Text');
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Explanation (HTML)'), { target: { value: '<p>Corrected</p>' } });
  const next = onChange.mock.calls[0][0] as Block[];
  expect(next).toEqual([{ ...blocks[0], content: { ...blocks[0].content, html: '<p>Corrected</p>' } }, blocks[1]]);
  expect(next[1]).toBe(blocks[1]);
  expect(blocks[0].content.html).toBe('<p>Original</p>');
});

it('edits quiz options and the answer key without replacing question or option IDs', async () => {
  const blocks: Block[] = [{ id: 'quiz', type: 'quiz', content: { questions: [{ id: 'question-1', question: 'Which?', explanation: 'Because.', options: [
    { id: 'a', text: 'One', isCorrect: true }, { id: 'b', text: 'Two', isCorrect: false },
  ] }] } }];
  const onChange = vi.fn();
  function Editor() { const [value, setValue] = useState(blocks); return <CourseBlockEditor blocks={value} onChange={next => { setValue(next); onChange(next); }} />; }
  render(<Editor />); await expand('1. Practice quiz');
  fireEvent.change(screen.getByLabelText('Question 1, option 2 (HTML)'), { target: { value: 'Second' } });
  fireEvent.click(screen.getByLabelText('Question 1: option 2 is correct'));
  expect(onChange.mock.calls.at(-1)?.[0][0].content.questions[0]).toEqual({
    ...blocks[0].content.questions![0], options: [{ id: 'a', text: 'One', isCorrect: false }, { id: 'b', text: 'Second', isCorrect: true }],
  });
  expect(blocks[0].content.questions![0].options[1].text).toBe('Two');
});

it('keeps raw SVG in the editor while the learner preview removes executable markup', async () => {
  const svg = '<svg viewBox="0 0 100 40" onload="alert(1)"><script>alert(1)</script><text x="5" y="20">Safe diagram</text></svg>';
  const blocks: Block[] = [{ id: 'diagram', type: 'illustration', content: { svgCode: svg, name: 'source-diagram', caption: 'Original caption' } }];
  const onChange = vi.fn(); render(<CourseBlockEditor blocks={blocks} onChange={onChange} />);
  await expand('1. Diagram');
  expect(screen.getByLabelText('Diagram (SVG)')).toHaveValue(svg);
  const preview = screen.getByRole('region', { name: 'Block 1 preview' });
  expect(preview).toHaveTextContent('Safe diagram');
  expect(preview.querySelector('script')).toBeNull();
  expect(preview.querySelector('svg')).not.toHaveAttribute('onload');
  fireEvent.change(screen.getByLabelText('Diagram caption'), { target: { value: 'Revised caption' } });
  expect(onChange.mock.calls[0][0][0].content).toEqual({ ...blocks[0].content, caption: 'Revised caption' });
});

it('edits individual list and table cells without changing surrounding structure', async () => {
  const blocks: Block[] = [
    { id: 'list', type: 'list', content: { style: 'ordered', items: ['First', 'Second'] } },
    { id: 'table', type: 'table', content: { headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']] } },
  ];
  const onChange = vi.fn(); render(<CourseBlockEditor blocks={blocks} onChange={onChange} />);
  await expand('1. List'); await expand('2. Table');
  fireEvent.change(screen.getByLabelText('Item 2 (HTML)'), { target: { value: 'Revised' } });
  expect(onChange.mock.calls.at(-1)?.[0][0].content.items).toEqual(['First', 'Revised']);
  fireEvent.change(screen.getByLabelText('Row 2, column 1 (HTML)'), { target: { value: '30' } });
  expect(onChange.mock.calls.at(-1)?.[0][1].content).toEqual({ headers: ['A', 'B'], rows: [['1', '2'], ['30', '4']] });
  expect(blocks[1].content.rows![1][0]).toBe('3');
});

it('renders empty content safely for every supported block type and disables editing while saving', async () => {
  const types = ['heading', 'text', 'module_intro', 'definition', 'callout', 'list', 'table', 'code', 'math', 'blockquote', 'illustration', 'micro_exercise', 'quiz'];
  const blocks = types.map(type => ({ id: type, type, content: {} }));
  const onChange = vi.fn(); const { container } = render(<CourseBlockEditor blocks={blocks} onChange={onChange} disabled />);
  for (const details of container.querySelectorAll('details')) { details.open = true; fireEvent(details, new Event('toggle')); }
  await waitFor(() => expect(screen.getAllByText('Learner preview')).toHaveLength(13));
  expect(screen.getByLabelText('Explanation (HTML)')).toBeDisabled();
  expect(screen.getByLabelText('Diagram (SVG)')).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});

it('keeps worked exercise hints behind an explicit control and preserves learner notes', () => {
  render(<ContentBlock block={{ id: 'exercise', type: 'micro_exercise', content: { promptHtml: '<p>Explain the parts.</p>', placeholder: 'CPU: Checks the sensor.\nFlash: Stores firmware.' } }} />);
  expect(screen.getByLabelText('Your working')).toHaveAttribute('placeholder', 'Write your reasoning…');
  expect(screen.queryByText(/CPU: Checks the sensor/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Your working'), { target: { value: 'My attempt' } });
  fireEvent.click(screen.getByText('Show hint/example'));
  expect(screen.getByText(/CPU: Checks the sensor/)).toBeVisible();
  expect(screen.getByLabelText('Your working')).toHaveValue('My attempt');
  fireEvent.click(screen.getByText('Hide hint/example'));
  expect(screen.queryByText(/CPU: Checks the sensor/)).not.toBeInTheDocument();
});
