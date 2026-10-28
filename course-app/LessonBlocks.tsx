import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
const InteractiveDiagram = lazy(() => import('./interactive/InteractiveDiagram'));
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { Block, Question } from './types';

// Unicode subscript and superscript characters (₁, ₄, ², ⁻¹ and so on) are drawn tiny or from a fallback font
// in Space Mono, so runs of them are turned into real <sub>/<sup> elements with ordinary characters.
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '−', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v', 'ⱼ': 'j' };
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '−', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i' };
const SCRIPT_RUN = new RegExp(`([${Object.keys(SUB).join('')}]+)|([${Object.keys(SUP).join('')}]+)`, 'g');
const scriptText = (text: string) => text.replace(SCRIPT_RUN, (_m, sub?: string, sup?: string) => sub ? `<sub>${[...sub].map(ch => SUB[ch]).join('')}</sub>` : `<sup>${[...(sup || '')].map(ch => SUP[ch]).join('')}</sup>`);
const readableScripts = (html: string) => html.split(/(<[^>]*>)/).map(part => part.startsWith('<') ? part : scriptText(part)).join('');
// Inside SVG drawings the same characters become smaller raised or lowered text spans.
const svgScriptText = (text: string) => text.replace(SCRIPT_RUN, (_m, sub?: string, sup?: string) => sub ? `<tspan baseline-shift="sub" font-size="80%">${[...sub].map(ch => SUB[ch]).join('')}</tspan>` : `<tspan baseline-shift="super" font-size="80%">${[...(sup || '')].map(ch => SUP[ch]).join('')}</tspan>`);
const readableSvgScripts = (svg: string) => svg.split(/(<[^>]*>)/).map(part => part.startsWith('<') ? part : svgScriptText(part)).join('');
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function ScriptText({ text = '' }: { text?: string }) {
  return <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(scriptText(escapeHtml(text))) }} />;
}

export function Rich({ html = '', className = '' }: { html?: string; className?: string }) {
  return <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readableScripts(html), {
    USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'video', 'audio', 'iframe', 'style', 'form', 'input'], FORBID_ATTR: ['style'],
  }) }} />;
}

function Diagram({ block }: { block: Block }) {
  const { name, svgCode, caption } = block.content;
  const [expanded, setExpanded] = useState(false);
  return <figure className={`diagram ${expanded ? 'diagram-expanded' : ''}`}>
    <button className="diagram-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'Fit diagram' : 'Enlarge diagram'}</button>
    <div className="diagram-viewport">
      {svgCode ? <div className="diagram-art" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readableSvgScripts(svgCode), {
        USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['image', 'foreignObject', 'script', 'style'],
      }) }} /> : <p className="notice">This source diagram is unavailable. Reference: {name || 'unnamed'}.</p>}
    </div>
    {caption ? <figcaption><ScriptText text={caption} /></figcaption> : null}
  </figure>;
}

class InteractiveBoundary extends Component<{ block: Block; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <><Diagram block={this.props.block} /><p>{this.props.block.content.description}</p><p className="meta">Interactive view is unavailable; the static explanation remains available.</p></> : this.props.children; }
}

function PracticeQuestion({ question, index }: { question: Question; index: number }) {
  const [choice, setChoice] = useState('');
  const [checked, setChecked] = useState(false);
  const correct = question.options.find(option => option.id === choice)?.isCorrect;
  return <fieldset className="question">
    <legend><span className="eyebrow">Question {index + 1}</span><Rich html={question.question} /></legend>
    {question.options.map(option => <label className={`answer ${checked && option.isCorrect ? 'correct-answer' : ''}`} key={option.id}>
      <input type="radio" name={question.id} checked={choice === option.id} onChange={() => { setChoice(option.id); setChecked(false); }} />
      <Rich html={option.text} />
    </label>)}
    <button className="primary small" disabled={!choice} onClick={() => setChecked(true)}>Check answer</button>
    {checked ? <div className={`feedback ${correct ? 'success' : ''}`} role="status"><strong>{correct ? 'Correct.' : 'Not quite. Review the explanation.'}</strong><Rich html={question.explanation} /></div> : null}
  </fieldset>;
}

function Exercise({ block }: { block: Block }) {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const hint = block.content.placeholder?.trim();
  const hasHint = !!hint && !/^write your (?:answer|explanation|reasoning)/i.test(hint);
  return <section className="exercise"><h3>{block.content.title || 'Micro-exercise'}</h3><Rich html={block.content.promptHtml} />
    <label>Your working<textarea value={answer} onChange={event => setAnswer(event.target.value)} placeholder={hasHint ? 'Write your reasoning…' : hint || 'Write your reasoning…'} /></label>
    {hasHint ? <><button className="small" aria-expanded={showHint} onClick={() => setShowHint(!showHint)}>{showHint ? 'Hide hint/example' : 'Show hint/example'}</button>{showHint ? <div className="exercise-hint">{hint}</div> : null}</> : null}
    <p className="meta">Practice notes stay in this lesson view only. They are not submitted or assessed.</p>
  </section>;
}

export function ContentBlock({ block }: { block: Block }) {
  const c = block.content;
  switch (block.type) {
    case 'heading': return <div className="source-heading" role="heading" aria-level={Math.min(6, Math.max(2, c.level || 3))}>{c.html ? <Rich html={c.html} /> : <ScriptText text={c.text} />}</div>;
    case 'text': return <Rich html={c.html} />;
    case 'module_intro': return <div className="module-intro"><span className="eyebrow">Module objective</span><Rich html={c.moduleObjective} /></div>;
    case 'definition': return <dl className="definition"><dt><ScriptText text={c.term} /></dt><dd><Rich html={c.definitionHtml} /></dd></dl>;
    case 'callout': return <aside className={`callout ${c.variant || ''}`}><strong>{c.title}</strong><Rich html={c.bodyHtml} /></aside>;
    case 'list': {
      const List = c.style === 'ordered' ? 'ol' : 'ul';
      return <List>{c.items?.map((item, index) => <li key={index}><Rich html={item} /></li>)}</List>;
    }
    case 'table': return <div className="table-scroll" tabIndex={0} role="region" aria-label="Lesson table"><table>
      <thead><tr>{c.headers?.map((header, i) => <th key={i} scope="col"><Rich html={header} /></th>)}</tr></thead>
      <tbody>{c.rows?.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}><Rich html={cell} /></td>)}</tr>)}</tbody>
    </table></div>;
    case 'code': return <figure className="code"><figcaption>{c.filename || c.language || 'Code'}{c.isConceptual ? ' · Conceptual example' : ''}</figcaption><pre tabIndex={0}><code>{c.code}</code></pre></figure>;
    case 'math': return <figure className="formula"><div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(katex.renderToString(c.latex || '', { displayMode: true, throwOnError: false, trust: false }), { ADD_TAGS: ['semantics', 'annotation'] }) }} />{c.caption ? <figcaption>{c.caption}</figcaption> : null}</figure>;
    case 'blockquote': return <blockquote><Rich html={c.html || c.text} /></blockquote>;
    case 'illustration': return <Diagram block={block} />;
    case 'interactive_diagram': return <InteractiveBoundary key={block.id} block={block}><Suspense fallback={<Diagram block={block} />}><InteractiveDiagram key={block.id} block={block} /></Suspense></InteractiveBoundary>;
    case 'micro_exercise': return <Exercise block={block} />;
    case 'quiz': return <section className="quiz"><h3>Check your understanding</h3><p className="meta">Practice only · does not award certification</p>{c.questions?.map((q, i) => <PracticeQuestion key={`${q.id}-${i}`} question={q} index={i} />)}</section>;
    default: return <div className="notice">Unsupported source content: {block.type}.<pre>{JSON.stringify(c, null, 2)}</pre></div>;
  }
}


// Quiz and micro-exercise blocks are shown in the Practice pane. A heading written directly before one
// (for example "Quiz") would otherwise sit alone in the reading column, so it becomes a link to the pane.
export const isPracticeBlock = (block: Block) => block.type === 'quiz' || block.type === 'micro_exercise';
export const practiceLead = (blocks: Block[], index: number) => blocks[index]?.type === 'heading' && !!blocks[index + 1] && isPracticeBlock(blocks[index + 1]);
export const practiceLabel = (block: Block) => (block.content.text || (block.content.html || '').replace(/<[^>]+>/g, '')).trim() || 'Practice';
export const scrollToPractice = (id: string) => requestAnimationFrame(() => document.getElementById(`practice-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
export function PracticeJump({ label, onOpen }: { label: string; onOpen: () => void }) {
  return <p className="practice-jump"><button type="button" onClick={onOpen}>{label}: answer it in the Practice panel <span aria-hidden="true">→</span></button></p>;
}
