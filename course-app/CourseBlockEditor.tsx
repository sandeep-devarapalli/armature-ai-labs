import { useId, useState } from 'react';
import { ContentBlock } from './LessonBlocks';
import type { Block, Question } from './types';
import { scenes } from './interactive/registry.mjs';

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabled?: boolean;
}

const names: Record<string, string> = {
  heading: 'Heading', text: 'Text', module_intro: 'Module introduction', definition: 'Definition',
  callout: 'Callout', list: 'List', table: 'Table', code: 'Code', math: 'Mathematics',
  interactive_diagram: 'Interactive diagram', blockquote: 'Quotation', illustration: 'Diagram', micro_exercise: 'Micro-exercise', quiz: 'Practice quiz',
};

function BlockFields({ block, onChange }: { block: Block; onChange: (content: Block['content']) => void }) {
  const c = block.content;
  const radioName = useId();
  const update = (patch: Partial<Block['content']>) => onChange({ ...c, ...patch });
  const field = (key: keyof Block['content'], label: string, multiline = false) => {
    const value = typeof c[key] === 'string' ? c[key] as string : '';
    return <label key={key}>{label}{multiline
      ? <textarea value={value} rows={5} onChange={e => update({ [key]: e.target.value })} />
      : <input value={value} onChange={e => update({ [key]: e.target.value })} />}</label>;
  };
  const updateQuestion = (index: number, patch: Partial<Question>) => update({
    questions: c.questions?.map((question, i) => i === index ? { ...question, ...patch } : question),
  });
  switch (block.type) {
    case 'heading': return <>{field('text', 'Heading text')}{field('html', 'Heading (HTML)', true)}
      <label>Heading level<select value={c.level ?? 3} onChange={e => update({ level: Number(e.target.value) })}>
        {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{level}</option>)}
      </select></label></>;
    case 'text': return field('html', 'Explanation (HTML)', true);
    case 'module_intro': return <>{field('courseTitle', 'Course title')}{field('moduleObjective', 'Module objective (HTML)', true)}</>;
    case 'definition': return <>{field('term', 'Term')}{field('definitionHtml', 'Definition (HTML)', true)}</>;
    case 'callout': return <>{field('title', 'Callout title')}{field('bodyHtml', 'Callout body (HTML)', true)}{field('variant', 'Callout style')}</>;
    case 'list': return <><label>List style<select value={c.style ?? 'unordered'} onChange={e => update({ style: e.target.value })}>
      <option value="unordered">Bulleted</option><option value="ordered">Numbered</option>
    </select></label>{c.items?.map((item, index) => <label key={index}>Item {index + 1} (HTML)
      <textarea value={item} onChange={e => update({ items: c.items?.map((value, i) => i === index ? e.target.value : value) })} />
    </label>)}</>;
    case 'table': return <>{c.headers?.map((header, index) => <label key={`header-${index}`}>Column {index + 1} heading (HTML)
      <textarea value={header} onChange={e => update({ headers: c.headers?.map((value, i) => i === index ? e.target.value : value) })} />
    </label>)}{c.rows?.map((row, i) => <fieldset key={i}><legend>Row {i + 1}</legend>{row.map((cell, j) => <label key={j}>Row {i + 1}, column {j + 1} (HTML)
      <textarea value={cell} onChange={e => update({ rows: c.rows?.map((values, r) => r === i ? values.map((value, col) => col === j ? e.target.value : value) : values) })} />
    </label>)}</fieldset>)}</>;
    case 'code': return <>{field('language', 'Language')}{field('filename', 'Filename')}{field('code', 'Code', true)}
      <label><input type="checkbox" checked={c.isConceptual ?? false} onChange={e => update({ isConceptual: e.target.checked })} />Conceptual example</label></>;
    case 'math': return <>{field('latex', 'Formula (LaTeX)', true)}{field('caption', 'Formula caption')}</>;
    case 'blockquote': return <>{field('text', 'Quotation text', true)}{field('html', 'Quotation (HTML)', true)}</>;
    case 'illustration': return <>{c.name ? <p className="meta">Source diagram: {c.name}</p> : null}{field('svgCode', 'Diagram (SVG)', true)}{field('caption', 'Diagram caption')}</>;
    case 'interactive_diagram': return <><label>Registered scene<select value={c.sceneId ?? ''} onChange={e => update({ sceneId: e.target.value, parameters: { value: scenes[e.target.value].initial } })}>{Object.entries(scenes).map(([id, spec]) => <option key={id} value={id}>{spec.title}</option>)}</select></label><label>Starting value<input type="number" min={scenes[c.sceneId ?? '']?.min} max={scenes[c.sceneId ?? '']?.max} step={scenes[c.sceneId ?? '']?.step} value={c.parameters?.value ?? 0} onChange={e => update({ parameters: { value: Number(e.target.value) } })} /></label>{field('svgCode', 'Static fallback (SVG)', true)}{field('caption', 'Caption')}{field('description', 'Accessible explanation', true)}</>;
    case 'micro_exercise': return <>{field('title', 'Exercise title')}{field('promptHtml', 'Exercise prompt (HTML)', true)}{field('placeholder', 'Answer placeholder')}</>;
    case 'quiz': return <>{c.questions?.map((question, index) => <fieldset key={`${question.id}-${index}`}><legend>Question {index + 1}</legend>
      <label>Question {index + 1} (HTML)<textarea value={question.question ?? ''} onChange={e => updateQuestion(index, { question: e.target.value })} /></label>
      {(question.options ?? []).map((option, i) => <div key={`${option.id}-${i}`}>
        <label>Question {index + 1}, option {i + 1} (HTML)<textarea value={option.text ?? ''} onChange={e => updateQuestion(index, {
          options: question.options.map((value, n) => n === i ? { ...value, text: e.target.value } : value),
        })} /></label>
        <label><input type="radio" name={`${radioName}-${index}`} checked={option.isCorrect ?? false} onChange={() => updateQuestion(index, {
          options: question.options.map((value, n) => ({ ...value, isCorrect: n === i })),
        })} />Question {index + 1}: option {i + 1} is correct</label>
      </div>)}
      <label>Question {index + 1} explanation (HTML)<textarea value={question.explanation ?? ''} onChange={e => updateQuestion(index, { explanation: e.target.value })} /></label>
    </fieldset>)}</>;
    default: return <p>This block type is preserved but cannot be edited here.</p>;
  }
}

function BlockReview({ block, index, onChange, disabled }: { block: Block; index: number; onChange: (content: Block['content']) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const preview = block.type === 'quiz' ? { ...block, content: { ...block.content,
    questions: block.content.questions?.map(q => ({ ...q, options: q.options ?? [] })),
  } } : block;
  return <details className="course-block-review" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{index + 1}. {names[block.type] ?? block.type}</summary>
    {open ? <><fieldset disabled={disabled} className="course-block-fields"><legend>Edit {names[block.type]?.toLowerCase() ?? block.type}</legend>
      <BlockFields block={block} onChange={onChange} />
    </fieldset><section className="course-block-preview" aria-label={`Block ${index + 1} preview`}><h4>Learner preview</h4><ContentBlock block={preview} /></section></> : null}
  </details>;
}

export function CourseBlockEditor({ blocks, onChange, disabled = false }: Props) {
  return <div className="course-block-editor">{blocks.map((block, index) => <BlockReview key={`${block.id}-${index}`} block={block} index={index} disabled={disabled}
    onChange={content => onChange(blocks.map((value, i) => i === index ? { ...value, content } : value))} />)}</div>;
}
