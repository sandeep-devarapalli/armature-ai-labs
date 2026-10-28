import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CoverImage } from './CoverImage';
import { CourseCatalogue } from './CourseCatalogue';
import { PublicCatalogue } from './PublicCatalogue';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { CourseSignIn, useCourseSession } from './CourseSession';
import { courseApi, createCourseClient, courseLevelsEnabled, type CourseMembership, type MemberCourse, type Progress, type Syllabus } from './member-api';
import { MemberLesson } from './MemberLesson';
import { CourseWorkspace } from './CourseWorkspace';
import { FinalQuiz } from './FinalQuiz';
import { LabOverview, LabReviews } from './LabReviews';
import type { Block } from './types';
import { courseLocationUrl, readCourseLocation, type CourseLocation } from './course-location';

type Theme = 'light' | 'dark' | 'sepia';
const defaultClient = createCourseClient();
function initialTheme(): Theme {
  try { const saved = localStorage.getItem('armature-theme'); if (saved === 'light' || saved === 'dark' || saved === 'sepia') return saved; } catch { /* Optional preference. */ }
  return 'dark';
}

export default function MemberApp({ client = defaultClient }: { client?: SupabaseClient | null }) {
  if (!client) return <main className="wrap account-entry"><h1>Armature Courses</h1><p>The course service is not configured. Please try again later.</p></main>;
  return <AuthenticatedCourses client={client} />;
}
function AuthenticatedCourses({ client }: { client: SupabaseClient }) {
  const { session, ready, error } = useCourseSession(client);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [signOutError, setSignOutError] = useState('');
  const [membership, setMembership] = useState<{ userId: string; value: CourseMembership } | null>(null);
  const receiveMembership = useCallback((userId: string, value: CourseMembership) => setMembership({ userId, value }), []);
  const currentMembership = membership?.userId === session?.user.id ? membership?.value : null;
  const level = courseLevelsEnabled(currentMembership) ? currentMembership?.membership_level : null;
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const destination = readCourseLocation();
  const signInRequested = Boolean(window.location.pathname === '/admin/courses' || destination.version || destination.myCourses || destination.labReviews || new URLSearchParams(window.location.search).get('view') === 'signin' || error);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (accountMenu.current && event.target instanceof Node && !accountMenu.current.contains(event.target)) accountMenu.current.open = false; };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('armature-theme', theme); } catch { /* Optional preference. */ }
  }, [theme]);
  async function signOut() {
    setSignOutError('');
    try {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) setSignOutError('Sign out failed. Please retry.');
    } catch { setSignOutError('Sign out failed. Please retry.'); }
  }
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    {import.meta.env.DEV ? <div className="preview-bar">Development · authenticated course service · unpublished</div> : null}
    <header className="site-header"><a className="brand" href="/" aria-label="Armature AI Labs course catalog"><img src={`/brand/editorial-2026-09/editable/lockup-${theme === 'dark' ? 'dark' : 'light'}.svg`} alt="Armature AI Labs" /></a>
      <span className="course-site-label">Courses</span>
      <nav className="course-header-nav" aria-label="Course navigation"><a href="/">All courses</a><a href="https://armatureailabs.com/"><span aria-hidden="true">← </span>Back to home</a></nav>
      <div className="course-header-actions"><div className="themes" role="group" aria-label="Reading theme">{(['light', 'dark', 'sepia'] as Theme[]).map(value => <button key={value} aria-label={`${value} theme`} aria-pressed={theme === value} title={`${value} theme`} className={`swatch ${value}`} onClick={() => setTheme(value)} />)}</div>
      {session ? <details ref={accountMenu} className="course-account" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary aria-label="Account menu"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg><span>Account</span><span aria-hidden="true">⌄</span></summary><div className="course-account-panel">{level ? <p>{level.charAt(0).toUpperCase() + level.slice(1)} member</p> : null}{courseLevelsEnabled(currentMembership) && currentMembership?.role && currentMembership.role !== 'member' ? <p>{({ membership_reviewer: 'Staff', admin: 'Admin', super_admin: 'Super admin' })[currentMembership.role]}</p> : null}<a href="https://armatureailabs.com/onboarding">My membership</a><button onClick={() => void signOut()}>Sign out</button></div></details> : <a className="course-header-sign-in" href="/?view=signin">Sign in</a>}</div>
    </header>
    {error || signOutError ? <p className="error" role="alert">{error || signOutError}</p> : null}
    {!ready ? <main className="wrap" id="main-content"><p role="status">Restoring your session…</p></main> : session ? <CourseWorkspace key={session.user.id} client={client} session={session}><MemberLearning client={client} session={session} onMembership={receiveMembership} /></CourseWorkspace> : signInRequested ? <CourseSignIn client={client} /> : <PublicCatalogue client={client} />}
    <footer className="site-footer"><span>Armature AI Labs</span><span>HSR Layout, Bengaluru</span><span>Reading progress is separate from lab and assessment results.</span></footer>
  </>;
}

function MemberLearning({ client, session, onMembership }: { client: SupabaseClient; session: Session; onMembership: (userId: string, value: CourseMembership) => void }) {
  const api = useMemo(() => courseApi(client), [client]);
  const [catalog, setCatalog] = useState<{ token: string; courses: MemberCourse[]; verified: boolean; membership: CourseMembership } | null>(null);
  const [location, setLocation] = useState<CourseLocation>(() => readCourseLocation());
  const { version, lessonId, myCourses } = location;
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const syllabusVersion = useRef<string | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loaded, setLoaded] = useState<{ id: string; token: string; blocks: Block[] } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [labAccess, setLabAccess] = useState<{ token: string; viewer: boolean } | null>(null);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const mutation = useRef<AbortController | null>(null);
  const token = session.access_token;
  const checkedToken = useRef<string | null>(null);
  const activeLesson = useRef<string | null>(null);
  activeLesson.current = loaded?.id ?? null;
  const courses = catalog?.token === token ? catalog.courses : [];
  const levelsEnabled = courseLevelsEnabled(catalog?.membership);
  const basic = levelsEnabled ? catalog?.membership.basic === true : catalog?.verified;
  const course = courses.find(item => item.versionId === version);
  const lessons = syllabus?.modules.flatMap(module => module.lessons) ?? [];
  const lesson = lessons.find(item => item.id === lessonId);
  const canLearn = Boolean(course?.enrolled && course.canLearn);
  const canOpen = (id: string) => canLearn || Boolean(lessons.find(item => item.id === id)?.isSample);
  // Lab checkpoints (Robot Actuators and other lab_written_and_practical courses). Keep when editing this file.
  const labViewer = labAccess?.token === token && labAccess.viewer;
  const lessonModule = syllabus?.modules.find(module => module.lessons.some(item => item.id === lessonId));
  const labModuleId = course?.finalAssessmentRoute === 'lab_written_and_practical' && canLearn && lessonModule && lessonModule.lessons[lessonModule.lessons.length - 1]?.id === lessonId
    && syllabus?.labRequirements.some(item => item.moduleId === lessonModule.id) ? lessonModule.id : null;
  function openLabModule(moduleId: string) { const module = syllabus?.modules.find(item => item.id === moduleId); const last = module?.lessons[module.lessons.length - 1]; if (last) navigate(last.id); }
  useEffect(() => {
    const abort = new AbortController();
    api.reviewerStatus(abort.signal).then(r => { if (!abort.signal.aborted) setLabAccess({ token, viewer: r.viewer }); }).catch(() => { if (!abort.signal.aborted) setLabAccess({ token, viewer: false }); });
    return () => abort.abort();
  }, [api, token]);
  function changeLocation(next: CourseLocation, replace = false) {
    const url = courseLocationUrl(next);
    if (url !== window.location.pathname + window.location.search) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    setLocation(next); setLoaded(null); setContentsOpen(false);
  }
  useEffect(() => {
    const restore = () => { setLocation(readCourseLocation()); setLoaded(null); setError(''); setContentsOpen(false); };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  function revalidate() { setRefresh(value => value + 1); }
  function denyAccess() { setLoaded(null); setError('Learning access changed. Refresh your access to continue.'); revalidate(); }

  useEffect(() => {
    const abort = new AbortController();
    const initial = checkedToken.current !== token;
    if (initial) { setLoading(true); setLoaded(null); }
    setError('');
    mutation.current?.abort(); setEnrolling(false);
    const checkLesson = activeLesson.current;
    Promise.all([api.catalog(abort.signal), api.membership(abort.signal), checkLesson ? api.lesson(checkLesson, abort.signal).then(() => true).catch(() => false) : Promise.resolve(true)]).then(([next, membership, lessonAllowed]) => {
      if (abort.signal.aborted) return;
      if (!lessonAllowed) { setLoaded(null); changeLocation({ ...location, lessonId: null }, true); setError('Lesson access could not be confirmed.'); }
      checkedToken.current = token;
      setCatalog({ token, courses: next, verified: membership.verified, membership });
      onMembership(session.user.id, membership);
    }).catch(() => { if (!abort.signal.aborted) { setCatalog(null); setLoaded(null); setError('Unable to confirm course access. Refresh or sign in again.'); } }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); mutation.current?.abort(); };
  }, [api, token, refresh]);

  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') revalidate(); };
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(update, 60000);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);

  useEffect(() => {
    if (!levelsEnabled || !catalog?.membership.next_status_change_at) return;
    const delay = Date.parse(catalog.membership.next_status_change_at) - Date.now();
    if (!Number.isFinite(delay) || delay < 0) return;
    const timer = window.setTimeout(revalidate, Math.min(delay + 100, 2147483647));
    return () => clearTimeout(timer);
  }, [levelsEnabled, catalog?.membership.next_status_change_at]);

  useEffect(() => {
    syllabusVersion.current = null;
    setSyllabus(null); setProgress([]); setLoaded(null);
    if (!version || loading || !course) return;
    const abort = new AbortController();
    Promise.all([api.syllabus(version, abort.signal), api.progress(version, abort.signal)]).then(([next, saved]) => {
      if (!abort.signal.aborted) { syllabusVersion.current = version; setSyllabus(next); setProgress(saved); }
    }).catch(() => { if (!abort.signal.aborted) setError('The syllabus could not be loaded. Refresh to retry.'); });
    return () => abort.abort();
  }, [api, version, token, loading, course?.versionId]);

  useEffect(() => {
    setLoaded(null); setLessonLoading(false);
    if (!lessonId || !syllabus || syllabusVersion.current !== version || loading || !course) return;
    if (!lessons.some(item => item.id === lessonId) || !canOpen(lessonId)) { changeLocation({ ...location, lessonId: null }, true); setError('This lesson requires eligible membership, enrollment and any applicable course entitlement.'); return; }
    const abort = new AbortController();
    setLessonLoading(true); setError('');
    api.lesson(lessonId, abort.signal).then(blocks => {
      if (!abort.signal.aborted) {
        if (!Array.isArray(blocks)) throw new Error('Missing lesson');
        setLoaded({ id: lessonId, token, blocks });
      }
    }).catch(() => { if (!abort.signal.aborted) setError('Lesson access could not be confirmed. Refresh your access to retry.'); }).finally(() => { if (!abort.signal.aborted) setLessonLoading(false); });
    return () => abort.abort();
  }, [api, lessonId, syllabus, token, loading, canLearn, course?.versionId]);

  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [version, lessonId, myCourses]);
  function openCourse(item: MemberCourse, resume = false) {
    mutation.current?.abort(); setEnrolling(false); changeLocation({ version: item.versionId, lessonId: resume && item.canLearn ? item.resumeLessonId : null, myCourses: false }); setError(''); setLoaded(null);
  }
  function navigate(id: string) { if (lessons.some(item => item.id === id) && canOpen(id)) changeLocation({ ...location, lessonId: id }); }
  async function enroll() {
    if (!course || enrolling) return;
    const current = course;
    const abort = new AbortController(); mutation.current?.abort(); mutation.current = abort;
    setEnrolling(true); setError('');
    try {
      await api.enroll(current.versionId, abort.signal);
      const next = await api.catalog(abort.signal);
      if (!abort.signal.aborted) setCatalog(old => old ? { ...old, courses: next } : old);
    } catch { if (!abort.signal.aborted) { setError('Enrollment could not be confirmed. Refresh your access and try again.'); setLoaded(null); } }
    finally { if (!abort.signal.aborted) setEnrolling(false); }
  }
  function saved(value: Progress) {
    setProgress(old => [...old.filter(item => item.lessonId !== value.lessonId), value]);
    setCatalog(old => old ? { ...old, courses: old.courses.map(item => item.versionId === version ? { ...item, resumeLessonId: value.lessonId, lastBlock: value.lastBlock, readCount: progress.filter(p => p.lessonId !== value.lessonId && p.readAt).length + (value.readAt ? 1 : 0) } : item) } : old);
  }
  function curriculum() {
    return syllabus?.modules.map(module => <details className="curriculum-module" key={module.id} open={module.lessons.some(item => item.id === lessonId) || undefined}><summary>{module.title}</summary><ol>{module.lessons.map(item => <li key={item.id}><button disabled={!canOpen(item.id)} aria-current={item.id === lessonId ? 'page' : undefined} onClick={() => navigate(item.id)}><span className={`lesson-dot ${progress.some(p => p.lessonId === item.id && p.readAt) ? 'read' : ''}`} aria-hidden="true" /><span>{item.title}{item.isSample ? <small>Sample</small> : !canLearn ? <small>Enrollment required</small> : null}</span></button></li>)}</ol></details>);
  }
  const displayed = myCourses ? courses.filter(item => item.enrolled) : courses;
  const nextLesson = lessons[lessons.findIndex(item => item.id === lessonId) + 1];
  const previousLesson = lessons[lessons.findIndex(item => item.id === lessonId) - 1];
  return <>
    <nav className="member-nav wrap" aria-label="Course navigation"><button onClick={() => { changeLocation({ version: null, lessonId: null, myCourses: false }); }}>Courses</button><button onClick={() => { changeLocation({ version: null, lessonId: null, myCourses: true }); }}>My courses</button>{labViewer ? <button onClick={() => { changeLocation({ version: null, lessonId: null, myCourses: false, labReviews: true }); }}>Lab reviews</button> : null}<button onClick={revalidate}>Refresh access</button><span className="meta">{session.user.email}</span></nav>
    {error ? <div className="error" role="alert">{error}</div> : null}
    {loading ? <main className="wrap" id="main-content"><p role="status">Checking course access…</p></main> : location.labReviews && !version && labViewer ? <main id="main-content"><LabReviews api={api} /></main> : !version && !myCourses ? <CourseCatalogue courses={courses} onOpenCourse={openCourse} headingRef={heading} accessNotice={catalog && !basic ? <p className="notice">Browse syllabuses and selected samples. <a href="https://armatureailabs.com/join/">{levelsEnabled ? 'Confirm your email' : 'Complete free identity verification'}</a> to enroll.</p> : null} /> : !version ? <main className="catalog wrap" id="main-content">
      <div className="catalog-intro"><h1 ref={heading} tabIndex={-1}>{myCourses ? 'My courses' : 'Build your foundations.'}</h1><p>{myCourses ? 'Resume your learning and see your saved reading progress.' : 'Explore computing, mathematics, embedded systems and robotics.'}</p></div>
      {catalog && !basic ? <p className="notice">Browse syllabuses and selected samples. <a href="https://armatureailabs.com/join/">{levelsEnabled ? 'Confirm your email' : 'Complete free identity verification'}</a> to enroll.</p> : null}
      <div className="course-list">{displayed.map((item, index) => <article className="course-card" key={item.versionId}><span className="course-index">{String(index + 1).padStart(2, '0')}</span><div><CoverImage url={item.coverUrl} className="course-card-cover" sizes="(max-width: 760px) 100vw, 560px" /><h2>{item.title}</h2><p>{item.description}</p><span className="meta">{item.moduleCount} modules · {item.lessonCount} lessons · {item.accessTier === 'free' ? (item.requiresVerifiedMembership ? 'Free · verified members' : 'Free course') : 'Course entitlement required'}</span>{item.enrolled ? <p className="meta">{item.readCount} of {item.lessonCount} lessons read{!item.canLearn ? ' · Learning access unavailable' : ''}</p> : null}</div><div className="course-actions"><button className="primary" onClick={() => openCourse(item)}>View course</button>{item.enrolled && item.canLearn && item.resumeLessonId ? <button onClick={() => openCourse(item, true)}>Resume learning</button> : null}</div></article>)}</div>
      {!displayed.length && !error ? <p>{myCourses ? 'You have not enrolled in a published course yet.' : 'No courses are published yet.'}</p> : null}
    </main> : !course ? <main className="wrap" id="main-content"><h1 ref={heading} tabIndex={-1}>Course unavailable</h1><p>This course is no longer available for learning. Return to Courses or refresh your access.</p></main> : !lessonId ? <main id="main-content">
      <section className="course-hero"><div className="wrap"><CoverImage url={course.coverUrl} className="course-hero-cover" sizes="(max-width: 960px) 100vw, 880px" eager /><h1 ref={heading} tabIndex={-1}>{course.title}</h1><p>{course.description}</p><p className="meta">{course.moduleCount} modules · {course.lessonCount} lessons · {course.readCount} read</p><div className="course-actions">
        {!course.enrolled && course.canLearn ? <button className="primary" disabled={enrolling} onClick={() => void enroll()}>{enrolling ? 'Enrolling…' : 'Enroll in course'}</button> : null}
        {canLearn && lessons.length ? <button className="primary" onClick={() => navigate(course.resumeLessonId && canOpen(course.resumeLessonId) ? course.resumeLessonId : lessons[0].id)}>{course.resumeLessonId ? 'Resume learning' : 'Start learning'}</button> : null}
        {!canLearn && lessons.some(item => item.isSample) ? <button onClick={() => navigate(lessons.find(item => item.isSample)!.id)}>Read sample lesson</button> : null}
      </div></div></section>
      <div className="overview wrap"><section>{course.finalAssessmentRoute === 'online_quiz' ? <FinalQuiz key={`${course.versionId}:${session.user.id}`} api={api} versionId={course.versionId} enrolled={canLearn} /> : null}<h2>Course syllabus</h2>{curriculum()}{!syllabus ? <p role="status">Loading syllabus…</p> : null}</section><aside className="overview-notes"><section><h3>Your access</h3><p>{canLearn ? 'Enrolled · full lesson access' : course.canLearn ? (levelsEnabled && course.accessTier === 'free' && !course.requiresVerifiedMembership ? 'Basic membership · enroll to start learning' : 'Verified member · enroll to start learning') : course.requiresVerifiedMembership && !catalog?.verified ? 'Free identity verification is required for full learning. Registered members can read the introduction and first lesson.' : !basic ? (levelsEnabled ? 'Confirmed email is required for free learning.' : 'Free identity verification is required for full learning.') : 'A valid course entitlement is required. Payments are not available yet.'}</p></section>
        <section><h3>Assessment & practical labs</h3>{course.finalAssessmentRoute === 'lab_written_and_practical' ? <LabOverview api={api} versionId={course.versionId} refreshKey={refresh * 2 + (course.enrolled ? 1 : 0)} onOpenModule={openLabModule} /> : null}<p>{course.finalAssessmentRoute === 'online_quiz' ? 'Final assessment: online quiz.' : course.finalAssessmentRoute === 'lab_written_and_practical' ? 'Final assessment: supervised written test and assessed practical at the lab.' : 'Assessment policy: to be confirmed. Learning access does not include an assessment or certificate.'}</p><p>{course.labPolicyStatus === 'unassigned' ? 'Course and module lab policy: to be confirmed. No lab activity is assigned in this version.' : course.labPolicyStatus === 'none' ? 'No separate learning labs are required.' : 'The course or selected modules include practical labs.'}</p>{syllabus?.labRequirements.map(lab => <section key={lab.id}><h4>{lab.title} · {lab.mandatory ? 'Required' : 'Optional'}</h4><p>{lab.moduleId ? syllabus.modules.find(module => module.id === lab.moduleId)?.title : 'Course-level lab'}</p><p>{lab.brief}</p><p>{lab.completionCriteria}</p>{lab.location ? <p>{lab.location}</p> : null}</section>)}<p className="meta">{course.finalAssessmentRoute === 'online_quiz' ? 'The final quiz is graded online. Certification requires passing an offline exam as well.' : course.finalAssessmentRoute === 'lab_written_and_practical' ? 'Submit each lab checkpoint in its lesson. An assessor reviews it, and records your written test and practical results here.' : 'Lab sign-off, final grading and certificates are not available in this release.'}</p></section>
      </aside></div>
    </main> : <main id="main-content" className="workbench"><aside className={`curriculum ${contentsOpen ? 'is-open' : ''}`}><div className="curriculum-title"><span className="eyebrow">Course contents</span><h2>{course.title}</h2><button onClick={() => { changeLocation({ ...location, lessonId: null }); }}>Course overview</button></div><button className="contents-toggle" aria-expanded={contentsOpen} onClick={() => setContentsOpen(!contentsOpen)}>Contents</button><div className="curriculum-list">{curriculum()}</div></aside><div className="member-reader">
      {(() => {
        // Lesson navigation sits inside the reading column, under Save position / Mark as read (owner request, 25 Oct 2026).
        const navigation = <nav className="lesson-navigation" aria-label="Lesson navigation"><button disabled={!previousLesson || !canOpen(previousLesson.id)} onClick={() => navigate(previousLesson.id)}>← Previous lesson</button><button className="primary next-lesson" disabled={!nextLesson || !canOpen(nextLesson.id)} onClick={() => navigate(nextLesson.id)}>Next lesson →{nextLesson ? <span className="next-title">{nextLesson.title}</span> : null}</button></nav>;
        return lesson && loaded?.id === lessonId && loaded.token === token ? <MemberLesson key={`${lessonId}:${token}`} api={api} lesson={lesson} blocks={loaded.blocks} initialProgress={progress.find(item => item.lessonId === lessonId)} canSave={canLearn} onSaved={saved} onDenied={denyAccess} onEnroll={course && !course.enrolled && course.canLearn ? () => void enroll() : undefined} enrolling={enrolling} lessonCount={course?.lessonCount} lab={labModuleId && course ? { versionId: course.versionId, moduleId: labModuleId, userId: session.user.id } : undefined} navigation={navigation} /> : <><p className="lesson" role="status">{lessonLoading ? 'Loading protected lesson…' : 'Lesson unavailable. Refresh access to retry.'}</p>{navigation}</>;
      })()}
    </div></main>}
  </>;
}
