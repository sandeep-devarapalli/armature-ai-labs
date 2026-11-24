import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Rich } from './LessonBlocks';
import type { Block } from './types';
import type { AssignmentResult, AssignmentWork } from './member-api';
import { AssignmentStoreContext } from './assignment-store';
import { GraderError, sharedGrader, type Grader, type GraderFile, type TestResult } from './grader/client';
import { PYODIDE_PYTHON } from './grader/runtime';
import { zip } from './grader/zip';

export const GraderContext = createContext<() => Grader>(sharedGrader);

type Run = { kind: 'visible' | 'all'; results: TestResult[]; seconds: number };
type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' | 'conflict';
const SAVE_TEXT: Record<SaveState, string> = {
  idle: '', unsaved: 'Unsaved changes…', saving: 'Saving…', saved: 'Code saved.',
  error: 'Your code was not saved. It is still here; keep this page open and try again.',
  conflict: 'This assignment changed in another window. Copy your code somewhere safe, then reload the page.',
};
const isHidden = (test: string) => test.startsWith('test_hidden');
const label = (test: string) => test.split('::').slice(1).join(' › ').replace(/^test_/, '').replace(/_/g, ' ') || test;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function CodeAssignment({ block }: { block: Block }) {
  const c = block.content;
  const store = useContext(AssignmentStoreContext);
  const grader = useContext(GraderContext);
  const starter = useMemo(() => Object.fromEntries((c.files ?? []).filter(f => f.editable).map(f => [f.name, f.code])), [c.files]);
  const provided = useMemo(() => (c.files ?? []).filter(f => !f.editable), [c.files]);
  const visibleTests = useMemo(() => (c.tests ?? []).filter(t => !t.hidden), [c.tests]);
  const tabs = useMemo(() => [...Object.keys(starter), ...provided.map(f => f.name), ...visibleTests.map(t => t.name)], [starter, provided, visibleTests]);
  const [code, setCode] = useState<Record<string, string>>(starter);
  const [tab, setTab] = useState(tabs[0] ?? '');
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(store));
  const [work, setWork] = useState<Pick<AssignmentWork, 'best' | 'last'> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirmReset, setConfirmReset] = useState(false);
  const revision = useRef<number | null>(null);
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(code); latest.current = code;
  const escaped = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!store) return;
    let active = true;
    store.load(block.id).then(saved => {
      if (!active) return;
      if (saved) {
        revision.current = saved.revision; setWork({ best: saved.best, last: saved.last });
        setCode({ ...starter, ...Object.fromEntries(Object.entries(saved.files).filter(([name]) => name in starter)) });
      }
      setLoading(false);
    }).catch(() => { if (active) { setLoading(false); setError('Your saved code could not be loaded. You can still work here, but nothing will be saved until you reload.'); setSaveState('error'); } });
    return () => { active = false; };
  }, [store, block.id, starter]);

  const persist = useCallback((result: AssignmentResult | null) => {
    if (!store) return Promise.resolve();
    clearTimeout(timer.current);
    setSaveState('saving');
    queue.current = queue.current.then(async () => {
      try {
        const saved = await store.save(block.id, latest.current, result, revision.current);
        revision.current = saved.revision;
        if (mounted.current) { setWork({ best: saved.best, last: saved.last }); setSaveState('saved'); }
      } catch (e) {
        if (mounted.current) setSaveState((e as { code?: string })?.code === 'PT409' ? 'conflict' : 'error');
      }
    });
    return queue.current;
  }, [store, block.id]);

  function edit(name: string, value: string) {
    setCode(current => ({ ...current, [name]: value }));
    if (!store || saveState === 'conflict') return;
    setSaveState('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(null), 1500);
  }

  // Tab indents by four spaces. Press Escape first to let Tab move focus out of the editor.
  function onKey(event: KeyboardEvent<HTMLTextAreaElement>, name: string) {
    if (event.key === 'Escape') { escaped.current = true; return; }
    if (event.key !== 'Tab' || escaped.current || event.shiftKey) { escaped.current = false; return; }
    event.preventDefault();
    const area = event.currentTarget; const start = area.selectionStart; const end = area.selectionEnd;
    const value = area.value.slice(0, start) + '    ' + area.value.slice(end);
    edit(name, value);
    requestAnimationFrame(() => { area.selectionStart = area.selectionEnd = start + 4; });
  }

  async function test(kind: 'visible' | 'all') {
    setBusy(true); setError(''); setStatus('Starting Python…');
    const files: GraderFile[] = [
      ...Object.entries(code).map(([name, text]) => ({ name, text })),
      ...provided.map(f => ({ name: f.name, text: f.code })),
      ...(c.tests ?? []).filter(t => kind === 'all' || !t.hidden).map(t => ({ name: t.name, text: t.code })),
      ...(kind === 'all' ? (c.support ?? []).map(s => ({ name: s.name, base64: s.base64 })) : []),
    ];
    const tests = (c.tests ?? []).filter(t => kind === 'all' || !t.hidden).map(t => t.name);
    try {
      const outcome = await grader().run({ files, tests, packages: c.packages ?? ['numpy', 'scipy'], timeLimitSeconds: c.timeLimitSeconds ?? 120, onStatus: text => { if (mounted.current) setStatus(text); } });
      if (!mounted.current) return;
      setRun({ kind, results: outcome.results, seconds: outcome.seconds });
      setStatus('');
      if (c.support?.length && c.python && outcome.python && outcome.python !== c.python) setError(`This assignment was prepared for Python ${c.python} but the site now runs Python ${outcome.python}, so some hidden tests may fail for reasons that are not yours. Please tell the course team.`);
      const passed = outcome.results.filter(r => r.outcome === 'passed').length;
      await persist({ kind, passed, total: outcome.results.length });
    } catch (e) {
      if (!mounted.current) return;
      setStatus('');
      setError(e instanceof GraderError ? e.message : 'The tests could not run. Reload the page and try again.');
    } finally { if (mounted.current) setBusy(false); }
  }

  function download() {
    const files = [
      ...Object.entries(code).map(([name, text]) => ({ name, text })),
      ...provided.map(f => ({ name: f.name, text: f.code })),
      ...visibleTests.map(t => ({ name: t.name, text: t.code })),
      { name: 'HOW-TO-RUN.txt', text: `${c.title ?? 'Assignment'}\n\nYou need Python ${c.python ?? PYODIDE_PYTHON} or newer with NumPy, SciPy and pytest.\nIn this folder run:\n\n    python -m pytest -q\n\nThese are the visible tests. Grade the assignment on the course page to run the hidden tests as well.\n` },
    ];
    const url = URL.createObjectURL(new Blob([zip(files)], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${(c.title ?? 'assignment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.zip`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function reset() {
    setConfirmReset(false);
    if (!(tab in starter)) return;
    edit(tab, starter[tab]);
  }

  const passed = run?.results.filter(r => r.outcome === 'passed').length ?? 0;
  const failedVisible = run?.results.filter(r => r.outcome !== 'passed' && !isHidden(r.test)) ?? [];
  const failedHidden = run?.results.filter(r => r.outcome !== 'passed' && isHidden(r.test)) ?? [];
  const fileText = tab in code ? null : provided.find(f => f.name === tab)?.code ?? visibleTests.find(t => t.name === tab)?.code ?? '';

  return <section className="code-assignment" aria-labelledby={`${block.id}-title`}>
    <header><span className="eyebrow">Assignment · runs in your browser</span><h2 id={`${block.id}-title`}>{c.title}</h2></header>
    <Rich html={c.briefHtml} />
    <p className="meta">Scores here track your progress only. They do not count towards the final quiz, the lab checkpoints or a certificate.{store ? '' : ' Enroll to keep your code between visits.'}</p>
    {loading ? <p role="status">Loading your saved code…</p> : <>
      <div className="assignment-tabs" role="tablist" aria-label="Assignment files">{tabs.map(name => <button key={name} role="tab" type="button" aria-selected={tab === name} onClick={() => { setTab(name); setConfirmReset(false); }}>
        {name}<span className="assignment-tab-kind">{name in starter ? 'your code' : name.startsWith('test_') ? 'tests' : 'provided'}</span></button>)}</div>
      {fileText === null
        ? <label className="assignment-editor"><span className="sr-only">Edit {tab}</span>
          <textarea value={code[tab]} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off"
            onChange={event => edit(tab, event.target.value)} onKeyDown={event => onKey(event, tab)} aria-describedby={`${block.id}-keys`} /></label>
        : <pre className="assignment-readonly" tabIndex={0} aria-label={`${tab} (read only)`}><code>{fileText}</code></pre>}
      <p className="meta" id={`${block.id}-keys`}>{fileText === null ? 'Tab indents by four spaces. Press Escape, then Tab, to leave the editor.' : 'Read only. These files are provided with the assignment.'}</p>
      <div className="assignment-actions">
        <button type="button" disabled={busy} onClick={() => void test('visible')}>Run visible tests</button>
        <button type="button" className="primary" disabled={busy} onClick={() => void test('all')}>Grade with all tests</button>
        <button type="button" onClick={download}>Download files</button>
        {tab in starter ? confirmReset
          ? <><button type="button" onClick={reset}>Yes, reset {tab}</button><button type="button" onClick={() => setConfirmReset(false)}>Keep my code</button></>
          : <button type="button" disabled={busy} onClick={() => setConfirmReset(true)}>Reset {tab} to the starter</button> : null}
      </div>
      <p className="meta" role="status">{status || SAVE_TEXT[saveState]}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {work?.best || work?.last ? <ul className="assignment-scores">
        {work.best ? <li><span>Best graded run</span><strong>{work.best.passed} of {work.best.total} tests ({when(work.best.at)})</strong></li> : null}
        {work.last ? <li><span>Last run</span><strong>{work.last.passed} of {work.last.total} {work.last.kind === 'all' ? 'tests' : 'visible tests'}</strong></li> : null}
      </ul> : null}
      {run ? <div className={`assignment-results ${passed === run.results.length ? 'success' : ''}`} aria-live="polite">
        <h3>{run.kind === 'all' ? 'Graded with all tests' : 'Visible tests'}: {passed} of {run.results.length} passed <span className="meta">({run.seconds.toFixed(1)} s)</span></h3>
        {passed === run.results.length && run.results.length ? <p>{run.kind === 'all' ? 'Every test passes. Well done.' : 'Every visible test passes. Grade with all tests to check the hidden cases.'}</p> : null}
        {failedVisible.length ? <ol className="assignment-failures">{failedVisible.map(r => <li key={r.test}><details><summary>{label(r.test)} <span className="meta">{r.outcome}</span></summary><pre tabIndex={0}>{r.message}</pre></details></li>)}</ol> : null}
        {failedHidden.length ? <><p>Hidden tests not yet passing ({failedHidden.length}):</p><ul className="assignment-failures">{failedHidden.map(r => <li key={r.test}>{label(r.test)}</li>)}</ul>
          <p className="meta">Hidden tests try new cases. Their messages are not shown; reread the brief and test your code on cases of your own.</p></> : null}
      </div> : null}
    </>}
  </section>;
}
