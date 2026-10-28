import { useEffect, useState } from 'react';
import type { CourseApi, LabAssessment, LabCheckpoint, LabQueueItem, LabStatus, LabSubmissionDetail, MyCourseLabs } from './member-api';
import { LabChecksList, LabPhotos, LabStatusBadge, LabValuesView } from './LabForm';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const errorText = (error: unknown) => {
  const e = error as { code?: string; message?: string };
  if (e?.code === '22023' && e.message) return e.message;
  if (e?.code === 'PT409') return 'This submission changed meanwhile. It has been reloaded; check it and try again.';
  if (e?.code === '42501') return 'Your lab review access could not be confirmed.';
  return 'That did not go through. Please try again.';
};

export function AssessmentSummary({ assessment }: { assessment: LabAssessment }) {
  const a = assessment;
  const written = a.writtenScore === null || a.writtenScore === undefined ? 'not yet recorded'
    : `${a.writtenScore} / ${a.writtenTotal} (${a.writtenPassed ? 'passed' : 'not passed'}; pass mark ${a.writtenPassPercent} %)`;
  const practical = a.practicalPassed === null || a.practicalPassed === undefined ? 'not yet recorded' : a.practicalPassed ? 'passed' : 'not passed';
  return <ul className="lab-summary">
    <li><span>Lab checkpoints approved</span><strong>{a.labsApproved} of {a.labsRequired}</strong></li>
    <li><span>Supervised written test</span><strong>{written}</strong></li>
    <li><span>Assessed practical</span><strong>{practical}</strong></li>
    <li><span>Course result</span><strong>{a.passedAt ? `Passed on ${when(a.passedAt)}` : 'Not passed yet'}</strong></li>
  </ul>;
}

// Course overview: checkpoint statuses and the overall result for the signed-in learner.
export function LabOverview({ api, versionId, refreshKey, onOpenModule }: { api: CourseApi; versionId: string; refreshKey: number; onOpenModule: (moduleId: string) => void }) {
  const [data, setData] = useState<MyCourseLabs | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    api.labs(versionId, abort.signal).then(r => { if (!abort.signal.aborted) setData(r); }).catch(() => { if (!abort.signal.aborted) setData(null); });
    return () => abort.abort();
  }, [api, versionId, refreshKey]);
  if (!data?.available || !data.labs?.length) return null;
  return <div className="lab-overview"><h4>Your lab checkpoints</h4>
    {!data.enrolled ? <p className="meta">Enroll to record and submit your lab values.</p> : null}
    <ol>{data.labs.map((lab: LabCheckpoint) => <li key={lab.moduleId}><button type="button" className="link-button" onClick={() => onOpenModule(lab.moduleId)}>{lab.title}</button> <LabStatusBadge status={lab.submission?.status} /></li>)}</ol>
    {data.assessment ? <AssessmentSummary assessment={data.assessment} /> : null}
  </div>;
}

// Assessor page: queue, submission detail, approve or return, and written test and practical results.
export function LabReviews({ api }: { api: CourseApi }) {
  const [tab, setTab] = useState<LabStatus>('submitted');
  const [queue, setQueue] = useState<LabQueueItem[] | null>(null);
  const [detail, setDetail] = useState<LabSubmissionDetail | null>(null);
  const [comment, setComment] = useState('');
  const [score, setScore] = useState('');
  const [practical, setPractical] = useState<'' | 'pass' | 'fail'>('');
  const [practicalNotes, setPracticalNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const abort = new AbortController(); setQueue(null);
    api.labQueue(tab, abort.signal).then(q => { if (!abort.signal.aborted) setQueue(q); }).catch(e => { if (!abort.signal.aborted) setError(errorText(e)); });
    return () => abort.abort();
  }, [api, tab, reload]);

  async function open(id: string) {
    setError(''); setMessage(''); setComment(''); setScore(''); setPractical(''); setPracticalNotes('');
    try { setDetail(await api.labSubmission(id)); } catch (e) { setError(errorText(e)); }
  }
  async function decide(decision: 'approve' | 'return') {
    if (!detail) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setDetail(await api.reviewLab(detail.submission.id, detail.submission.revision, decision, comment));
      setMessage(decision === 'approve' ? 'Approved.' : 'Returned to the learner with your comment.'); setComment(''); setReload(x => x + 1);
    } catch (e) { setError(errorText(e)); await open(detail.submission.id); }
    finally { setBusy(false); }
  }
  async function record() {
    if (!detail) return;
    const s = score.trim() === '' ? null : Number(score);
    if (s !== null && !Number.isInteger(s)) { setError('Enter the written score as a whole number of correct answers.'); return; }
    if (s === null && !practical) { setError('Enter a written score, a practical result, or both.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const overall = await api.recordAssessment(detail.userId, detail.versionId, s, practical === '' ? null : practical === 'pass', practicalNotes.trim() || null);
      setDetail({ ...detail, overall }); setMessage('Results recorded.'); setScore(''); setPractical(''); setPracticalNotes('');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const sub = detail?.submission;
  return <div className="lab-reviews wrap">
    <h1 tabIndex={-1}>Lab reviews</h1>
    <div className="lab-tabs" role="tablist" aria-label="Submission status">{(['submitted', 'returned', 'approved', 'draft'] as LabStatus[]).map(s =>
      <button key={s} role="tab" aria-selected={tab === s} onClick={() => { setTab(s); setDetail(null); }}>{s === 'submitted' ? 'Waiting for review' : s[0].toUpperCase() + s.slice(1)}</button>)}</div>
    {error ? <p role="alert" className="error">{error}</p> : null}
    <div className="lab-review-layout">
      <section className="lab-queue">{queue === null ? <p role="status">Loading…</p> : !queue.length ? <p className="empty-state">Nothing here.</p>
        : <ul>{queue.map(item => <li key={item.id}><button type="button" aria-current={detail?.submission.id === item.id || undefined} onClick={() => void open(item.id)}>
          <strong>{item.learner.name || item.learner.email || 'Learner'}</strong><span>{item.lab || item.module}</span><span className="meta">{item.course.title}{item.submittedAt ? ` · ${when(item.submittedAt)}` : ''}</span></button></li>)}</ul>}</section>
      <section className="lab-detail">{!detail || !sub ? <p className="meta">Choose a submission to review.</p> : <>
        <h2>{detail.requirement?.title ?? detail.module}</h2>
        <p>{detail.learner.name || 'Learner'}{detail.learner.email ? ` · ${detail.learner.email}` : ''} · {detail.course.title}</p>
        <p><LabStatusBadge status={sub.status} />{sub.submittedAt ? <span className="meta"> · submitted {when(sub.submittedAt)}</span> : null}{sub.shareConsent ? <span className="meta"> · agreed to anonymised use</span> : null}</p>
        {detail.requirement ? <details><summary>Lab brief and pass criteria</summary><p>{detail.requirement.brief}</p><p><strong>Pass:</strong> {detail.requirement.completionCriteria}</p></details> : null}
        <LabValuesView fields={detail.fields} values={sub.values} />
        <LabChecksList values={sub.values} />
        {sub.notes ? <p className="lab-notes"><strong>Learner's notes:</strong> {sub.notes}</p> : null}
        <LabPhotos api={api} paths={sub.photos} />
        <details><summary>History</summary><ol className="lab-history">{detail.events.map((e, i) => <li key={i}>{when(e.at)}: {e.byLearner ? 'learner' : 'assessor'} {e.action === 'save' ? 'saved a draft' : e.action === 'submit' ? 'submitted' : e.action === 'approve' ? 'approved' : 'returned it'}{e.comment ? `: "${e.comment}"` : ''}</li>)}</ol></details>
        {detail.canReview && sub.status === 'submitted' ? <div className="lab-decision">
          <label className="lab-field">Comment to the learner (required when returning)<textarea rows={3} maxLength={4000} value={comment} disabled={busy} onChange={e => setComment(e.target.value)} /></label>
          <div className="lab-actions"><button className="primary" disabled={busy} onClick={() => void decide('approve')}>Approve</button><button disabled={busy || !comment.trim()} onClick={() => void decide('return')}>Return for changes</button></div>
        </div> : null}
        <h3>This learner's course result</h3>
        <AssessmentSummary assessment={detail.overall.assessment} />
        {detail.canReview ? <div className="lab-record">
          <label className="lab-field">Written test score (correct answers out of {detail.overall.assessment.writtenTotal})<input type="number" min={0} max={detail.overall.assessment.writtenTotal ?? undefined} step={1} value={score} disabled={busy} onChange={e => setScore(e.target.value)} /></label>
          <fieldset className="lab-field lab-yesno" disabled={busy}><legend>Assessed practical</legend>
            <label><input type="radio" name="practical" checked={practical === 'pass'} onChange={() => setPractical('pass')} /> Passed</label>
            <label><input type="radio" name="practical" checked={practical === 'fail'} onChange={() => setPractical('fail')} /> Not passed</label></fieldset>
          <label className="lab-field">Practical notes<textarea rows={2} maxLength={4000} value={practicalNotes} disabled={busy} onChange={e => setPracticalNotes(e.target.value)} /></label>
          <button disabled={busy} onClick={() => void record()}>Record results</button>
        </div> : <p className="meta">Only lab assessors can approve submissions and record results.</p>}
        {message ? <p role="status" className="lab-message">{message}</p> : null}
      </>}</section>
    </div>
  </div>;
}
