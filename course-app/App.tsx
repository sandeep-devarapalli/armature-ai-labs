import { useEffect, useRef, useState } from 'react';
import { ContentBlock, isPracticeBlock, practiceLead, practiceLabel, PracticeJump, scrollToPractice } from './LessonBlocks';
import type { Block, Course, CourseContent, CourseModule } from './types';

declare const __COURSES_LOCAL_PREVIEW__: boolean;
type Theme = 'light' | 'dark' | 'sepia';
type Access = 'pending' | 'verified';
type Position = { module: number; lesson: number };
type Pane = 'read' | 'practice';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('armature-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'sepia') return saved;
  } catch { /* Theme remains usable without browser storage. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const lessonKey = (course: string, position: Position) => `${course}:${position.module}:${position.lesson}`;

function Curriculum({ module, index, position, courseId, complete, access, navigate }: {
  module: CourseModule; index: number; position: Position | null; courseId: string;
  complete: Set<string>; access: Access; navigate: (position: Position) => void;
}) {
    const allowed = (p: Position) => access === 'verified' || (p.module === 0 && p.lesson < (['pic-microcontrollers', 'manual-lathe', 'manual-milling'].includes(courseId) ? 2 : 1));
    return <details className="curriculum-module" open={position?.module === index || undefined}>
      <summary><span className="module-number">{String(index + 1).padStart(2, '0')}</span>{module.title}</summary>
      <ol>{module.subItems.map((lesson, i) => {
        const p = { module: index, lesson: i };
        const active = position?.module === index && position.lesson === i;
        return <li key={lesson}><button disabled={!allowed(p)} aria-current={active ? 'page' : undefined} onClick={() => navigate(p)}>
          <span className={`lesson-dot ${complete.has(lessonKey(courseId, p)) ? 'read' : ''}`} aria-hidden="true" />
          <span>{lesson}{!allowed(p) ? <small>Verification required</small> : null}</span>
        </button></li>;
      })}</ol>
    </details>;
  }

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [access, setAccess] = useState<Access>('verified');
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [content, setContent] = useState<CourseContent | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [pane, setPane] = useState<Pane>('read');
  const [contentsOpen, setContentsOpen] = useState(false);
  const [complete, setComplete] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const mainHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('armature-theme', theme); } catch { /* Optional preference storage. */ }
  }, [theme]);

  useEffect(() => {
    if (!__COURSES_LOCAL_PREVIEW__) return;
    const abort = new AbortController();
    fetch('/__courses/catalog', { signal: abort.signal, cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('The course catalog could not be loaded.');
      return response.json();
    }).then(setCourses).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    setContent(null); setError('');
    if (!course || !__COURSES_LOCAL_PREVIEW__) return;
    const abort = new AbortController();
    fetch(`/__courses/content/${encodeURIComponent(course.id)}`, { headers: { 'X-Course-Preview-Access': access }, signal: abort.signal, cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('The course content could not be loaded.');
      return response.json();
    }).then(setContent).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => abort.abort();
  }, [course, access]);

  useEffect(() => { mainHeading.current?.focus(); window.scrollTo(0, 0); }, [course, position]);
  const modules = content?.modules || [];
  const currentModule = position ? modules[position.module] : null;
  const title = position ? currentModule?.subItems[position.lesson] : null;
  const blocks = title ? currentModule?.lessonContent?.[title]?.blocks || [] : [];
  const practice = blocks.filter(isPracticeBlock);
  const openPractice = (id: string) => { setPane('practice'); scrollToPractice(id); };
  const positions = modules.flatMap((m, module) => m.subItems.map((_, lesson) => ({ module, lesson })));
  const currentIndex = position ? positions.findIndex(p => p.module === position.module && p.lesson === position.lesson) : -1;
  const allowed = (p: Position) => access === 'verified' || (p.module === 0 && p.lesson < (['pic-microcontrollers', 'manual-lathe', 'manual-milling'].includes(course?.id ?? '') ? 2 : 1));
  const navigate = (p: Position) => { if (!allowed(p)) return; setPosition(p); setContentsOpen(false); setPane('read'); };
  const openCourse = (c: Course) => { setCourse(c); setPosition(null); setContent(null); };


  if (!__COURSES_LOCAL_PREVIEW__) return <main className="disabled-preview"><h1>Armature Courses</h1><p>This Workbench preview runs only on the local development server. The member learning platform is not published.</p></main>;

  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="preview-bar"><span>Local preview · simulated access</span><label>View as <select value={access} onChange={event => { setAccess(event.target.value as Access); setPosition(null); setContent(null); }}><option value="verified">Verified member</option><option value="pending">Registered · unverified</option></select></label></div>
    <header className="site-header"><button className="brand" aria-label="Armature AI Labs course catalog" onClick={() => { setCourse(null); setPosition(null); }}><img src={`/brand/editorial-2026-09/editable/lockup-${theme === 'dark' ? 'dark' : 'light'}.svg`} alt="Armature AI Labs" /></button>
      <span className="course-site-label">Courses</span>
      <nav className="course-header-nav" aria-label="Course navigation"><button className={!course ? 'active' : ''} onClick={() => { setCourse(null); setPosition(null); }}>All courses</button>{course ? <button onClick={() => setPosition(null)}>Course overview</button> : null}<a href="https://armatureailabs.com/"><span aria-hidden="true">← </span>Back to home</a></nav>
      <div className="course-header-actions"><div className="themes" role="group" aria-label="Reading theme">{(['light', 'dark', 'sepia'] as Theme[]).map(t => <button key={t} aria-label={`${t} theme`} aria-pressed={theme === t} title={`${t} theme`} className={`swatch ${t}`} onClick={() => setTheme(t)} />)}</div></div>
    </header>

    {error ? <div className="error" role="alert">{error} Reload this local preview to try again.</div> : null}
    {!course ? <main id="main-content" className="catalog wrap">
      <div className="catalog-intro"><h1 ref={mainHeading} tabIndex={-1}>Build your foundations.</h1><p>Explore computing, mathematics, embedded systems and robotics.<br />Read, inspect and practise in one workbench.</p></div>
      <div className="catalog-heading"><h2>Courses</h2><span className="meta">{courses.length} authored courses · local content preview</span></div>
      <div className="course-list">{courses.map((c, i) => <article className="course-card" key={c.id}><span className="course-index">0{i + 1}</span><div><h2>{c.title}</h2><p>{c.description}</p><span className="meta">{c.moduleCount} modules · {c.lessonCount} lessons · {c.level} · source estimate {c.duration}</span></div><button className="primary" onClick={() => openCourse(c)}>Open course <span aria-hidden="true">→</span></button></article>)}</div>
      {!courses.length && !error ? <p role="status">Loading course catalog…</p> : null}
      <p className="catalog-note">Full learning will use Armature’s free identity verification. Course assessment and lab requirements are being finalized.</p>
    </main> : !position ? <main id="main-content">
      <section className="course-hero"><div className="wrap"><h1 ref={mainHeading} tabIndex={-1}>{course.title}</h1><div className="hero-bottom"><div><p className="meta">{course.moduleCount} modules · {course.lessonCount} lessons · {course.level} · source estimate {course.duration}</p><p>{course.description}</p></div><button className="primary" disabled={!content} onClick={() => navigate({ module: 0, lesson: 0 })}>{access === 'verified' ? 'Open first lesson' : 'Open preview sample'} <span aria-hidden="true">→</span></button></div></div></section>
      <div className="overview wrap"><section><h2>Course syllabus</h2>{modules.map((module, index) => <Curriculum key={`${course.id}-${index}`} module={module} index={index} courseId={course.id} position={position} access={access} complete={complete} navigate={navigate} />)}{!content && !error ? <p role="status">Loading syllabus…</p> : null}</section>
        <aside className="overview-notes"><section><span className="eyebrow">Your preview access</span><h3>{access === 'verified' ? 'Verified member simulation' : 'Registered member simulation'}</h3><p>{access === 'verified' ? 'All authored lessons are available in this local preview.' : 'Explore the syllabus and available sample lessons. Sample access here is simulated; live access is enforced by the member service.'}</p></section><section><span className="eyebrow">Assessment & practical labs</span><h3>Requirements being finalized</h3><p>A course may use an online final quiz or lab assessments. Required practical labs may also apply to the whole course or individual modules.</p><p className="meta">This course’s requirements have not been assigned. Preview practice does not earn a certificate.</p></section></aside>
      </div>
    </main> : <main id="main-content" className="workbench">
      <aside className={`curriculum ${contentsOpen ? 'is-open' : ''}`}><div className="curriculum-title"><span className="eyebrow">Course contents</span><h2>{course.title}</h2><p>{course.moduleCount} modules · {course.lessonCount} lessons</p></div><button className="contents-toggle" aria-expanded={contentsOpen} onClick={() => setContentsOpen(!contentsOpen)}>Contents <span aria-hidden="true">{contentsOpen ? '−' : '+'}</span></button><div className="curriculum-list">{modules.map((module, index) => <Curriculum key={`${course.id}-${index}`} module={module} index={index} courseId={course.id} position={position} access={access} complete={complete} navigate={navigate} />)}</div></aside>
      <div className="reader-area" key={`${course.id}-${position.module}-${position.lesson}`}>
        <div className="mobile-tabs" role="tablist" aria-label="Lesson view">{(['read', 'practice'] as Pane[]).map(p => <button role="tab" aria-selected={pane === p} key={p} onClick={() => setPane(p)}>{p === 'read' ? 'Read' : 'Practice'}</button>)}</div>
        <article className={`lesson ${pane === 'read' ? 'mobile-active' : ''}`}>
          <div className="breadcrumbs"><button onClick={() => setPosition(null)}>Course overview</button><span aria-hidden="true">/</span><span>Module {position.module + 1}</span></div>
          {access === 'pending' ? <p className="notice">Preview sample · simulated access</p> : null}
          <h1 ref={mainHeading} tabIndex={-1}>{title || 'Lesson unavailable'}</h1><p className="lesson-subtitle">{currentModule?.title}</p>
          {blocks.length ? blocks.map((block, index) => isPracticeBlock(block) ? null : practiceLead(blocks, index) ? <PracticeJump key={`${block.id}-${index}`} label={practiceLabel(block)} onOpen={() => openPractice(blocks[index + 1].id)} /> : <ContentBlock key={`${block.id}-${index}`} block={block} />) : <p className="notice">This lesson’s content is unavailable in this preview.</p>}
          <div className="reading-status"><button disabled={!blocks.length} onClick={() => setComplete(old => { const next = new Set(old); const key = lessonKey(course.id, position); next.has(key) ? next.delete(key) : next.add(key); return next; })}>{complete.has(lessonKey(course.id, position)) ? 'Marked as read · undo' : 'Mark as read'}</button><span className="meta">Local reading progress only. Lab completion and assessment results are tracked separately.</span></div>
          <nav className="lesson-navigation" aria-label="Lesson navigation"><button disabled={currentIndex <= 0 || !allowed(positions[currentIndex - 1])} onClick={() => navigate(positions[currentIndex - 1])}>← Previous lesson</button><button className="primary next-lesson" disabled={currentIndex >= positions.length - 1 || !allowed(positions[currentIndex + 1])} onClick={() => navigate(positions[currentIndex + 1])}>Next lesson →{currentIndex >= 0 && currentIndex < positions.length - 1 ? <span className="next-title">{modules[positions[currentIndex + 1].module].subItems[positions[currentIndex + 1].lesson]}</span> : null}</button></nav>
        </article>
        <aside className={`practice-pane ${pane !== 'read' ? 'mobile-active' : ''}`}>
          <h2 className="practice-heading">Practice</h2>
          <div className={`pane-content ${pane === 'practice' ? 'mobile-active' : ''}`}><h3 className="sr-only">Lesson practice</h3>{practice.length ? practice.map((block, index) => <div id={`practice-${block.id}`} key={`${block.id}-${index}`}><ContentBlock block={block} /></div>) : <p className="empty-state">There is no practice activity in this lesson.</p>}</div>
        </aside>
      </div>
    </main>}
    <footer className="site-footer"><span>Armature AI Labs</span><span>HSR Layout, Bengaluru</span><span>Local preview · no enrollment, payments or certificates</span></footer>
  </>;
}
