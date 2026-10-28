import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ContentBlock, isPracticeBlock, practiceLead, practiceLabel, PracticeJump, scrollToPractice } from './LessonBlocks';
import type { Block } from './types';
import type { CourseApi, LessonSummary, Progress } from './member-api';
import { LabForm } from './LabForm';

export function MemberLesson({ api, lesson, blocks, initialProgress, canSave, onSaved, onDenied, onEnroll, enrolling = false, lessonCount, lab, navigation }: {
  api: CourseApi; lesson: LessonSummary; blocks: Block[]; initialProgress?: Progress; canSave: boolean;
  lab?: { versionId: string; moduleId: string; userId: string };
  onEnroll?: () => void; enrolling?: boolean; lessonCount?: number;
  navigation?: ReactNode;
  onSaved: (progress: Progress) => void; onDenied: () => void;
}) {
  const [pane, setPane] = useState<'read' | 'practice'>('read');
  const [status, setStatus] = useState(canSave ? 'Saving position…' : onEnroll ? '' : 'Sample reading is not recorded as course progress.');
  const [read, setRead] = useState(Boolean(initialProgress?.readAt));
  const [saving, setSaving] = useState(false);
  const article = useRef<HTMLElement>(null);
  const lastBlock = useRef(initialProgress?.lastBlock ?? 0);
  const saveRef = useRef<(block: number, completed?: boolean) => void>(() => {});
  const callbacks = useRef({ onSaved, onDenied });
  callbacks.current = { onSaved, onDenied };

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let queue = Promise.resolve();
    let pending = 0;
    const abort = new AbortController();
    const save = (block: number, completed = false) => {
      if (!canSave || !active) return;
      ++pending; setStatus('Saving position…'); setSaving(true);
      queue = queue.then(async () => {
        if (!active) return;
        try {
          const result = await api.save(lesson.id, block, completed, abort.signal);
          if (!active) return;
          setRead(Boolean(result.read_at)); setStatus(pending > 1 ? 'Saving position…' : 'Reading position saved.');
          callbacks.current.onSaved({ lessonId: result.lesson_id, lastBlock: result.last_block, readAt: result.read_at, updatedAt: result.updated_at });
        } catch (error) {
          if (!active) return;
          setStatus('Position not saved. Use Save position to retry.');
          if ((error as { code?: string }).code === '42501' || (error as { code?: string }).code === 'PGRST301') callbacks.current.onDenied();
        } finally { --pending; if (active) setSaving(pending > 0); }
      });
    };
    saveRef.current = save;
    const target = article.current?.querySelector<HTMLElement>(`[data-block-index="${lastBlock.current}"]`);
    if (lastBlock.current > 0) target?.scrollIntoView({ block: 'start' });
    save(lastBlock.current);
    const onScroll = () => {
      if (!active || !canSave || !article.current || getComputedStyle(article.current).display === 'none') return;
      const nodes = [...article.current.querySelectorAll<HTMLElement>('[data-block-index]')];
      const visible = nodes.find(node => node.getBoundingClientRect().bottom > 140);
      if (!visible) return;
      const block = Number(visible.dataset.blockIndex);
      if (block === lastBlock.current) return;
      lastBlock.current = block;
      setStatus('Saving position…');
      clearTimeout(timer);
      timer = setTimeout(() => save(block), 1000);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { active = false; clearTimeout(timer); abort.abort(); window.removeEventListener('scroll', onScroll); saveRef.current = () => {}; };
  }, [api, lesson.id, canSave]);

  const practice = blocks.filter(isPracticeBlock);
  const openPractice = (id: string) => { setPane('practice'); scrollToPractice(id); };
  return <div className="reader-area">
    <div className="mobile-tabs" role="tablist" aria-label="Lesson view">{(['read', 'practice'] as const).map(value => <button role="tab" key={value} aria-selected={pane === value} onClick={() => setPane(value)}>{value === 'read' ? 'Read' : 'Practice'}</button>)}</div>
    <article ref={article} className={`lesson ${pane === 'read' ? 'mobile-active' : ''}`}>
      {lesson.isSample && !canSave ? <p className="notice">Sample lesson</p> : null}
      <h1 tabIndex={-1}>{lesson.title}</h1>
      {blocks.map((block, index) => isPracticeBlock(block) ? null : <div className="lesson-block" data-block-index={index} key={`${block.id}-${index}`}>{practiceLead(blocks, index) ? <PracticeJump label={practiceLabel(block)} onOpen={() => openPractice(blocks[index + 1].id)} /> : <ContentBlock block={block} />}</div>)}
      <div className="reading-status">
        {canSave ? <><button disabled={saving} onClick={() => saveRef.current(lastBlock.current)}>Save position</button><button disabled={read || saving} onClick={() => saveRef.current(lastBlock.current, true)}>{read ? 'Marked as read' : 'Mark as read'}</button></> : null}
        {!canSave && onEnroll ? <p className="sample-enroll"><span>Enroll to save your progress and unlock all {lessonCount ?? 'the'} lessons.</span><button className="primary" disabled={enrolling} onClick={onEnroll}>{enrolling ? 'Enrolling…' : 'Enroll in course'}</button></p> : null}<span className="meta" role="status">{status}</span>
        <p className="meta">Reading progress does not complete practical labs or award a certificate.</p>
      </div>
      {navigation}
    </article>
    <aside className={`practice-pane ${pane === 'practice' ? 'mobile-active' : ''}`}><h2 className="practice-heading">Practice</h2><div className={`pane-content ${pane === 'practice' ? 'mobile-active' : ''}`}>
      {lab ? <LabForm api={api} versionId={lab.versionId} moduleId={lab.moduleId} userId={lab.userId} /> : null}
      {practice.length ? practice.map((block, index) => <div id={`practice-${block.id}`} key={`${block.id}-${index}`}><ContentBlock block={block} /></div>) : lab ? null : <p className="empty-state">There is no practice activity in this lesson.</p>}
    </div></aside>
  </div>;
}
