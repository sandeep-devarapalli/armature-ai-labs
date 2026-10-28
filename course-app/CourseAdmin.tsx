import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { courseAdminApi, type AdminCourse, type AdminDetail, type AdminLab } from './admin-api';
import { CourseBlockEditor } from './CourseBlockEditor';
import { ContentBlock } from './LessonBlocks';
import type { LessonSummary } from './member-api';
import type { Block } from './types';
import './course-admin.css';

type Tab = 'details' | 'lessons' | 'labs' | 'review' | 'history';
const tabNames: Record<Tab, string> = { details: 'Course details', lessons: 'Lessons & samples', labs: 'Practical labs', review: 'Review & publish', history: 'Audit history' };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function failure(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === 'PT409' || code === '40001') return 'Another admin changed this version. Your edits are kept. Discard them and reload the latest version before saving again.';
  if (code === '42501') return 'Administration access could not be confirmed. No further changes can be made with this session.';
  if (code === '22023') return (error as { message?: string }).message || 'Check the fields and publication requirements before retrying.';
  return 'The course service could not complete this request. Your unsaved edits are kept.';
}

export default function CourseAdmin({ client, session, blocked = false }: { client: SupabaseClient; session: Session; blocked?: boolean }) {
  const api = useMemo(() => courseAdminApi(client), [client]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [detail, setDetail] = useState<AdminDetail | null>(null);
  const [form, setForm] = useState<AdminCourse | null>(null);
  const [labs, setLabs] = useState<AdminLab[]>([]);
  const [selection, setSelection] = useState('');
  const [tab, setTab] = useState<Tab>('details');
  const [lesson, setLesson] = useState<LessonSummary | null>(null);
  const [lessonOriginal, setLessonOriginal] = useState<{ lesson: LessonSummary; blocks: Block[] } | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [allVersions, setAllVersions] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const lifetime = useRef(new AbortController());
  const loadRequest = useRef<AbortController | null>(null);
  const lessonRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const course = detail?.course;
  const isDraft = course?.status === 'draft';
  const courseDirty = !!form && !!course && !equal(form, course);
  const labsDirty = !!detail && !equal(labs, detail.labRequirements);
  const lessonDirty = !!lessonOriginal && (!equal(lesson, lessonOriginal.lesson) || !equal(blocks, lessonOriginal.blocks));
  const dirty = courseDirty || labsDirty || lessonDirty;
  const frozen = busy || loading || denied || blocked;
  const canAct = !frozen && !needsReload && !!note.trim();
  const visibleCourses = allVersions ? courses : courses.filter(item => item.versionId === selection || !courses.some(other => other.courseId === item.courseId && other.version > item.version));

  function adopt(next: AdminDetail) {
    setCourses(old => old.some(item => item.versionId === next.course.versionId) ? old.map(item => item.versionId === next.course.versionId ? next.course : item) : [...old, next.course]);
    setNeedsReload(false); setDetail(next); setForm(next.course); setLabs(next.labRequirements);
    setLesson(null); setLessonOriginal(null); setBlocks([]); setPreview(false); setConfirmed(false);
  }
  function report(cause: unknown) {
    if ((cause as { code?: string }).code === '42501') { setDenied(true); setDetail(null); setForm(null); setBlocks([]); setLessonOriginal(null); }
    setError(failure(cause));
  }
  useEffect(() => {
    const abort = new AbortController(); lifetime.current = abort;
    setLoading(true);
    api.list(abort.signal).then(next => { if (!abort.signal.aborted) setCourses(next); }).catch(cause => { if (!abort.signal.aborted) report(cause); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); loadRequest.current?.abort(); lessonRequest.current?.abort(); };
  }, [api, session.user.id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { heading.current?.focus(); }, [selection]);

  async function openVersion(id: string, discard = false) {
    if (frozen || (dirty && !discard)) return;
    loadRequest.current?.abort(); lessonRequest.current?.abort();
    const abort = new AbortController(); loadRequest.current = abort;
    setSelection(id); setLoading(true); setError(''); setNotice(''); setDetail(null); setForm(null); setBlocks([]); setLessonOriginal(null); setTab('details');
    try { const next = await api.detail(id, abort.signal); if (!abort.signal.aborted) adopt(next); }
    catch (cause) { if (!abort.signal.aborted) report(cause); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  async function openLesson(next: LessonSummary) {
    if (frozen || lessonDirty) return;
    lessonRequest.current?.abort();
    const abort = new AbortController(); lessonRequest.current = abort;
    setLesson(next); setBlocks([]); setLessonOriginal(null); setLessonLoading(true); setPreview(false); setError('');
    try {
      const data = await api.lesson(next.id, abort.signal);
      if (!Array.isArray(data)) throw new Error('Lesson body unavailable');
      if (!abort.signal.aborted) { setBlocks(data); setLessonOriginal({ lesson: next, blocks: data }); }
    } catch (cause) { if (!abort.signal.aborted) report(cause); }
    finally { if (!abort.signal.aborted) setLessonLoading(false); }
  }
  async function run(action: (signal: AbortSignal) => Promise<void | string>, success: string) {
    if (!course || !canAct) return;
    const signal = lifetime.current.signal;
    setBusy(true); setError(''); setNotice('');
    let committed = false;
    try {
      const newId = await action(signal); committed = true;
      if (signal.aborted) return;
      const id = typeof newId === 'string' ? newId : course.versionId;
      setSelection(id);
      const [next, list] = await Promise.all([api.detail(id, signal), api.list(signal)]);
      if (!signal.aborted) { adopt(next); setCourses(list); setSelection(id); setNote(''); setNotice(success); if (typeof newId === 'string') setTab('details'); }
    } catch (cause) {
      if (!signal.aborted) { report(cause); if ((cause as { code?: string }).code !== '22023') setNeedsReload(true); if (committed) setNotice('The change was saved, but refreshing the view failed. Reload this version before making another change.'); }
    } finally { if (!signal.aborted) setBusy(false); }
  }
  function changeCourse<K extends keyof AdminCourse>(key: K, value: AdminCourse[K]) { setForm(old => old ? { ...old, [key]: value } : old); }
  function changeLab(index: number, patch: Partial<AdminLab>) { setLabs(old => old.map((lab, i) => i === index ? { ...lab, ...patch } : lab)); }
  const readyToPublish = !!course && course.status === 'draft' && course.reviewedRevision === course.revision && course.accessTier !== 'unassigned';

  return <main id="main-content" className="wrap course-admin">
    <div className="admin-intro"><h1 ref={heading} tabIndex={-1}>Course administration</h1><p>Review course content, select samples and manage versioned publication.</p></div>
    {error ? <p className="error" role="alert">{error}</p> : null}{notice ? <p className="notice" role="status">{notice}</p> : null}
    {denied ? <p>Return to Learning or sign in again with an authorized account.</p> : <>
      <section className="admin-version-picker"><label className="admin-inline"><input type="checkbox" checked={allVersions} onChange={event => setAllVersions(event.target.checked)} /> Show earlier versions</label>
        <label>Course version<select aria-label="Course version" value={selection} disabled={frozen || dirty} onChange={event => void openVersion(event.target.value)}><option value="" disabled>Select a course to review</option>{visibleCourses.map(item => <option key={item.versionId} value={item.versionId}>{item.title} · v{item.version} · {item.status}</option>)}</select></label>
        {selection ? <button disabled={frozen} onClick={() => void openVersion(selection, true)}>{dirty ? 'Discard edits and reload' : 'Reload version'}</button> : null}
      </section>
      {loading ? <p role="status">Loading course administration…</p> : !course || !form ? <p>Select a course version. No content or publication status changes until you save an action.</p> : <>
        <section className="admin-course-summary"><h2>{course.title}</h2><p className="meta">Version {course.version} · {course.status} · revision {course.revision} · {course.moduleCount} modules · {course.lessonCount} lessons{course.clonedFromVersionId ? ` · Based on version ${courses.find(item => item.versionId === course.clonedFromVersionId)?.version ?? "recorded in history"}` : ""}</p><p>{course.reviewedRevision === course.revision ? 'Current version review recorded.' : 'Current content needs review before publication.'}{!isDraft ? ' Published and withdrawn versions are read-only; create a new draft to make corrections.' : ''}</p></section>
        <nav className="admin-tabs" aria-label="Administration sections">{(Object.keys(tabNames) as Tab[]).map(value => <button key={value} aria-current={tab === value ? 'page' : undefined} disabled={frozen || (dirty && value !== tab)} onClick={() => { setTab(value); setError(''); setConfirmed(false); }}>{tabNames[value]}</button>)}</nav>
        <div className="admin-change-note"><label>Change or review note<textarea value={note} disabled={frozen} onChange={event => setNote(event.target.value)} placeholder="Explain the change or record what you reviewed." /></label><p className="meta">Required for each saved action. Recorded with your account in the audit history.</p>{needsReload ? <p role="status">Reload this version before making further changes.</p> : null}{dirty ? <p role="status">Unsaved edits · save this section or discard before navigating.</p> : null}</div>
        {tab === 'details' ? <section><h2>Course details</h2><fieldset disabled={frozen || !isDraft} className="admin-fields"><label>Course title<input value={form.title} onChange={event => changeCourse('title', event.target.value)} /></label><label>Course description<textarea rows={5} value={form.description} onChange={event => changeCourse('description', event.target.value)} /></label>
          <label>Learning access<select value={form.accessTier} onChange={event => changeCourse('accessTier', event.target.value as AdminCourse['accessTier'])}><option value="unassigned">Not assigned</option><option value="free">Free · current membership rules</option><option value="paid">Paid · verified members with entitlement</option></select></label>
          <label>Final assessment<select value={form.finalAssessmentRoute} onChange={event => changeCourse('finalAssessmentRoute', event.target.value as AdminCourse['finalAssessmentRoute'])}><option value="unassigned">To be confirmed later</option><option value="online_quiz">Online final quiz</option><option value="lab_written_and_practical">Supervised written test and lab practical</option></select></label>
          <label>Learning labs<select value={form.labPolicyStatus} onChange={event => changeCourse('labPolicyStatus', event.target.value as AdminCourse['labPolicyStatus'])}><option value="unassigned">To be confirmed later</option><option value="none">No separate learning labs</option><option value="configured">Course or module labs required / offered</option></select></label>
          <p className="meta">Assessment and lab policies may remain to be confirmed while learning content is reviewed and published. This does not mean no labs or no assessment. An online final quiz may still have separate course or module labs. Selecting a policy does not enable payments, lab sign-off, grading or certificates.</p>
        </fieldset>{isDraft ? <button className="primary" disabled={!canAct || !courseDirty} onClick={() => void run(signal => api.saveCourse(form, note.trim(), signal), 'Course details saved. Previous review is no longer current.')}>Save course details</button> : null}</section> : null}
        {tab === 'lessons' ? <section><h2>Lessons & samples</h2><div className="admin-lesson-layout"><aside aria-label="Lesson selection">{detail.modules.map(module => <details key={module.id} open={module.lessons.some(item => item.id === lesson?.id) || undefined}><summary>{module.title}</summary><ol>{module.lessons.map(item => <li key={item.id}><button disabled={frozen || lessonDirty} aria-current={lesson?.id === item.id ? 'page' : undefined} onClick={() => void openLesson(item)}>{item.title}{item.isSample ? ' · Sample' : ''}</button></li>)}</ol></details>)}</aside>
          <div>{lessonLoading ? <p role="status">Loading protected lesson…</p> : lesson && lessonOriginal ? <>
            <fieldset disabled={frozen || !isDraft} className="admin-fields"><label>Lesson title<input value={lesson.title} onChange={event => setLesson({ ...lesson, title: event.target.value })} /></label><label className="admin-inline"><input type="checkbox" checked={lesson.isSample} onChange={event => setLesson({ ...lesson, isSample: event.target.checked })} /> Selected sample for registered members</label></fieldset>
            <div className="admin-actions"><button aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? 'Return to editing' : 'Preview lesson'}</button>{isDraft ? <button className="primary" disabled={!canAct || !lessonDirty} onClick={() => void run(signal => api.saveLesson(course, lesson, blocks, note.trim(), signal), 'Lesson saved. Previous review is no longer current.')}>Save lesson</button> : null}</div>
            {preview ? <article className="lesson admin-lesson-preview"><p className="meta">{lessonDirty ? 'Unsaved preview' : 'Saved lesson preview'} · diagrams remain inline</p><h3>{lesson.title}</h3>{blocks.map((block, index) => <ContentBlock key={`${block.id}-${index}`} block={block} />)}</article> : <CourseBlockEditor blocks={blocks} onChange={setBlocks} disabled={frozen || !isDraft} />}
          </> : <p>Select a lesson to inspect its content and sample setting.</p>}</div></div></section> : null}
        {tab === 'labs' ? <section><h2>Practical learning labs</h2><p>These requirements are separate from the final assessment. Defining one does not record attendance or completion.</p><fieldset disabled={frozen || !isDraft} className="admin-fields">{labs.map((lab, index) => <fieldset className="admin-lab" key={index}><legend>Lab {index + 1}</legend><label>Applies to<select value={lab.moduleId ?? ''} onChange={event => changeLab(index, { moduleId: event.target.value || null })}><option value="">Whole course</option>{detail.modules.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label><label>Lab title<input value={lab.title} onChange={event => changeLab(index, { title: event.target.value })} /></label><label>Brief<textarea value={lab.brief} onChange={event => changeLab(index, { brief: event.target.value })} /></label><label>Completion criteria<textarea value={lab.completionCriteria} onChange={event => changeLab(index, { completionCriteria: event.target.value })} /></label><label>Location<input value={lab.location ?? ''} onChange={event => changeLab(index, { location: event.target.value || null })} /></label><label className="admin-inline"><input type="checkbox" checked={lab.mandatory} onChange={event => changeLab(index, { mandatory: event.target.checked })} /> Mandatory learning lab</label><button onClick={() => setLabs(old => old.filter((_, i) => index !== i))}>Remove lab {index + 1}</button></fieldset>)}
          <button onClick={() => setLabs(old => [...old, { moduleId: null, title: '', brief: '', completionCriteria: '', mandatory: true, location: null }])}>Add learning lab</button></fieldset>{isDraft ? <button className="primary" disabled={!canAct || !labsDirty} onClick={() => void run(signal => api.saveLabs(course, labs, note.trim(), signal), 'Learning lab requirements saved. Previous review is no longer current.')}>Save lab requirements</button> : null}</section> : null}
        {tab === 'review' ? <section className="admin-review"><h2>Review & publish</h2><ul><li>Learning access: {course.accessTier === 'unassigned' ? 'Not assigned' : course.accessTier}</li><li>Final assessment: {course.finalAssessmentRoute === 'unassigned' ? 'To be confirmed later' : course.finalAssessmentRoute === 'online_quiz' ? 'Online final quiz' : 'Supervised written test and lab practical'}</li><li>Learning labs: {course.labPolicyStatus === 'unassigned' ? 'To be confirmed later' : course.labPolicyStatus === 'none' ? 'None' : `${detail.labRequirements.length} configured`}</li><li>Content review: {course.reviewedRevision === course.revision ? 'Current' : 'Required'}</li></ul>
          <p>Review the lesson explanations, diagrams, practice answers, source attribution, selected samples and any configured policies before recording review. Any draft edit invalidates the recorded review.</p>
          <label className="admin-inline"><input type="checkbox" checked={confirmed} disabled={frozen} onChange={event => setConfirmed(event.target.checked)} /> I have checked this version and intend to perform the selected action.</label>
          <div className="admin-actions">{isDraft ? <><button disabled={!canAct || !confirmed || dirty} onClick={() => void run(signal => api.review(course, note.trim(), signal), 'Content review recorded for this revision.')}>Record content review</button><button className="primary" disabled={!canAct || !confirmed || !readyToPublish || dirty} onClick={() => void run(signal => api.publish(course, note.trim(), signal), 'Course version published to the connected course service.')}>Publish reviewed version</button></> : null}
            <button disabled={!canAct || !confirmed || dirty} onClick={() => void run(signal => api.clone(course, note.trim(), signal), 'New draft created. Earlier enrollment and progress stay with their original version.')}>Create new draft version</button>
            {course.status === 'published' ? <button disabled={!canAct || !confirmed || dirty} onClick={() => void run(signal => api.withdraw(course, note.trim(), signal), 'Course version withdrawn. Enrollment and progress history are retained.')}>Withdraw version</button> : null}</div>
          <p className="meta">Publication changes visibility in the connected course database. Withdrawal removes learning access to this version. Neither action deploys the website or enables certificates or payments.</p>
        </section> : null}
        {tab === 'history' ? <section><h2>Audit history</h2>{detail.audit.length ? <ol className="admin-audit">{detail.audit.map(event => <li key={event.id}><strong>{event.action.replaceAll('_', ' ')}</strong><p>{event.note}</p><span className="meta">{new Date(event.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · revision {event.revision} · actor <span title={event.actorId}>{event.actorId.slice(0, 8)}</span></span></li>)}</ol> : <p>No administration actions have been recorded for this version.</p>}</section> : null}
      </>}
    </>}
  </main>;
}
