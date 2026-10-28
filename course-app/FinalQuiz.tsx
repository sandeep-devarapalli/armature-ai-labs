import { useEffect, useRef, useState } from 'react';
import { Rich } from './LessonBlocks';
import type { CourseApi, FinalQuizAttempt, FinalQuizResult, FinalQuizStatus } from './member-api';

// Answers are kept per attempt in session storage so a reload or token refresh mid-quiz does not lose them.
const storageKey = (attempt: string) => `armature-final-quiz:${attempt}`;
const readAnswers = (attempt: string): Record<string, string> => {
  try { const raw = sessionStorage.getItem(storageKey(attempt)); return raw ? JSON.parse(raw) as Record<string, string> : {}; } catch { return {}; }
};
const writeAnswers = (attempt: string, answers: Record<string, string>) => { try { sessionStorage.setItem(storageKey(attempt), JSON.stringify(answers)); } catch { /* storage unavailable */ } };
const clearAnswers = (attempt: string) => { try { sessionStorage.removeItem(storageKey(attempt)); } catch { /* storage unavailable */ } };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const errorText = (error: unknown) => {
  const e = error as { code?: string; message?: string };
  if (e?.code === '42501') return 'Final quiz access could not be confirmed. Refresh your access and try again.';
  if (e?.code === '22023' && e.message) return e.message.startsWith('Next attempt available at ') ? `Your next attempt opens ${when(e.message.slice(26))}.` : e.message;
  return 'The final quiz service could not complete this request. Please try again.';
};

export function FinalQuiz({ api, versionId, enrolled }: { api: CourseApi; versionId: string; enrolled: boolean }) {
  const [status, setStatus] = useState<FinalQuizStatus | null>(null);
  const [attempt, setAttempt] = useState<FinalQuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<FinalQuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const submitted = useRef(false);

  async function refresh(signal?: AbortSignal) {
    try { const next = await api.quizStatus(versionId, signal); if (!signal?.aborted) setStatus(next); }
    catch (e) { if (!signal?.aborted) setError(errorText(e)); }
  }
  useEffect(() => { const c = new AbortController(); void refresh(c.signal); return () => c.abort(); }, [api, versionId, enrolled]);
  useEffect(() => { if (!attempt) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [attempt]);

  async function start() {
    setBusy(true); setError(''); setResult(null);
    try {
      const next = await api.startQuiz(versionId);
      submitted.current = false; setAnswers(readAnswers(next.attemptId)); setAttempt(next); setNow(Date.now());
    } catch (e) { setError(errorText(e)); await refresh(); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!attempt || submitted.current) return;
    submitted.current = true; setBusy(true); setConfirming(false); setError('');
    try {
      const graded = await api.submitQuiz(attempt.attemptId, answers);
      clearAnswers(attempt.attemptId); setResult(graded); setAttempt(null); await refresh();
    } catch (e) { submitted.current = false; setError(errorText(e)); }
    finally { setBusy(false); }
  }
  function choose(question: string, option: string) {
    if (!attempt) return;
    const next = { ...answers, [question]: option }; setAnswers(next); writeAnswers(attempt.attemptId, next); setConfirming(false);
  }
  const remaining = attempt ? new Date(attempt.expiresAt).getTime() - now : 0;
  useEffect(() => { if (attempt && remaining <= 0 && !submitted.current) void submit(); }, [attempt, remaining]);

  if (!status) return error ? <section className="final-quiz"><h2>Final quiz</h2><p className="error" role="alert">{error}</p></section> : null;
  if (!status.available) return null;
  const facts = `${status.questionCount} questions · pass mark ${status.passPercent}% · ${status.timeLimitMinutes} minutes`;
  const retake = status.retakeHours ? `If you do not pass, you can try again ${status.retakeHours} hours after an attempt.` : 'If you do not pass, you can try again straight away.';

  if (attempt) {
    const unanswered = attempt.questions.filter(q => !answers[q.id]).length;
    return <section className="final-quiz final-quiz-active" aria-labelledby="final-quiz-title">
      <div className="final-quiz-bar">
        <h2 id="final-quiz-title">Final quiz</h2>
        <span className="meta" role="timer" aria-live="off">Time left {clock(remaining)}</span>
        <span className="meta">{attempt.questions.length - unanswered} of {attempt.questions.length} answered</span>
      </div>
      {attempt.questions.map((question, index) => <fieldset className="question" key={question.id}>
        <legend><span className="eyebrow">Question {index + 1}</span><Rich html={question.question} /></legend>
        {question.options.map(option => <label className="answer" key={option.id}>
          <input type="radio" name={`final-${question.id}`} checked={answers[question.id] === option.id} disabled={busy} onChange={() => choose(question.id, option.id)} />
          <Rich html={option.text} />
        </label>)}
      </fieldset>)}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="final-quiz-actions">
        {confirming && unanswered ? <><p role="status">{unanswered} question{unanswered === 1 ? '' : 's'} unanswered. Unanswered questions score zero.</p><button className="primary" disabled={busy} onClick={() => void submit()}>Submit anyway</button><button disabled={busy} onClick={() => setConfirming(false)}>Keep answering</button></>
          : <button className="primary" disabled={busy} onClick={() => unanswered ? setConfirming(true) : void submit()}>{busy ? 'Submitting…' : 'Submit final quiz'}</button>}
      </div>
      <p className="meta">Your answers are saved in this browser until you submit. The quiz is submitted automatically when time runs out.</p>
    </section>;
  }

  const next = status.nextAttemptAt && new Date(status.nextAttemptAt).getTime() > Date.now() ? status.nextAttemptAt : null;
  return <section className="final-quiz" aria-labelledby="final-quiz-title">
    <h2 id="final-quiz-title">Final quiz</h2>
    <p className="meta">{facts}</p>
    {result ? <div className={`final-quiz-result ${result.passed ? 'success' : ''}`} role="status">
      <strong>{result.outcome === 'expired' ? 'Time ran out before this attempt was submitted, so it scored zero.' : result.passed ? `Passed: ${result.correct} of ${result.total} correct (${result.percent}%).` : `Not passed: ${result.correct} of ${result.total} correct (${result.percent}%). The pass mark is ${result.passPercent}%.`}</strong>
      {result.passed ? <p>Next step for certification: the offline exam.</p> : <p>Answers are not shown, so the quiz stays fair for every attempt. Review the lessons before trying again.</p>}
    </div> : null}
    {status.passed ? <p>You passed the final quiz{status.passedAt ? ` on ${when(status.passedAt)}` : ''} with {status.bestPercent}%. Next step for certification: the offline exam.</p>
      : !status.eligible ? <p>{enrolled ? 'Final quiz access could not be confirmed. Refresh your access to retry.' : 'Enroll in the course to take the final quiz.'}</p>
      : status.openAttempt ? <><p>You have an attempt in progress. It closes at {when(status.openAttempt.expiresAt)}.</p><button className="primary" disabled={busy} onClick={() => void start()}>Resume final quiz</button></>
      : next ? <p>Your next attempt opens {when(next)}.{status.bestPercent != null ? ` Best result so far: ${status.bestPercent}%.` : ''}</p>
      : <><p>Answer every question, then submit. The timer starts when you begin. {retake}</p>{status.attempts ? <p className="meta">Attempts so far: {status.attempts}. Best result: {status.bestPercent}%.</p> : null}<button className="primary" disabled={busy} onClick={() => void start()}>{busy ? 'Starting…' : status.attempts ? 'Start another attempt' : 'Start final quiz'}</button></>}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <p className="meta">Certification needs one more step: an offline exam. Passing this online quiz alone does not award a certificate.</p>
  </section>;
}
