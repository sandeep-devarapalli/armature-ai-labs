import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinalQuiz } from '../../course-app/FinalQuiz';
import type { CourseApi, FinalQuizAttempt, FinalQuizStatus } from '../../course-app/member-api';

const base: FinalQuizStatus = { available: true, eligible: true, questionCount: 2, passPercent: 70, timeLimitMinutes: 30, retakeHours: 24, attempts: 0, bestPercent: null, passed: false, passedAt: null, openAttempt: null, nextAttemptAt: null };
const attempt = (expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()): FinalQuizAttempt => ({
  attemptId: 'attempt-1', startedAt: new Date().toISOString(), expiresAt, passPercent: 70,
  questions: [
    { id: 'q1', question: '<p>First question?</p>', options: [{ id: 'A', text: 'Alpha' }, { id: 'B', text: 'Beta' }] },
    { id: 'q2', question: '<p>Second question?</p>', options: [{ id: 'A', text: 'Gamma' }, { id: 'B', text: 'Delta' }] },
  ],
});
function api(status: FinalQuizStatus, next: FinalQuizAttempt = attempt()) {
  let current = status;
  const calls = {
    quizStatus: vi.fn(async () => current),
    startQuiz: vi.fn(async () => next),
    submitQuiz: vi.fn(async (_id: string, answers: Record<string, string>) => {
      const correct = answers.q1 === 'A' ? 1 : 0;
      current = { ...current, attempts: 1, bestPercent: correct * 50, nextAttemptAt: new Date(Date.now() + 86_400_000).toISOString() };
      return { attemptId: 'attempt-1', outcome: 'graded' as const, correct, total: 2, percent: correct * 50, passed: false, passPercent: 70, submittedAt: new Date().toISOString(), nextAttemptAt: current.nextAttemptAt };
    }),
  };
  return { api: calls as unknown as CourseApi, calls };
}
beforeEach(() => sessionStorage.clear());

it('asks a learner who is not enrolled to enroll and offers no start button', async () => {
  const { api: a } = api({ ...base, eligible: false });
  render(<FinalQuiz api={a} versionId="v" enrolled={false} />);
  await screen.findByText('Enroll in the course to take the final quiz.');
  expect(screen.queryByText('Start final quiz')).not.toBeInTheDocument();
  expect(screen.getByText('Certification needs one more step: an offline exam. Passing this online quiz alone does not award a certificate.')).toBeInTheDocument();
});

it('runs an attempt: confirms unanswered questions, submits the chosen answers and shows only the score', async () => {
  const { api: a, calls } = api(base);
  render(<FinalQuiz api={a} versionId="v" enrolled />);
  await screen.findByText('2 questions · pass mark 70% · 30 minutes');
  fireEvent.click(screen.getByText('Start final quiz'));
  await screen.findByText('First question?');
  fireEvent.click(screen.getByLabelText('Alpha'));
  expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Submit final quiz'));
  await screen.findByText('1 question unanswered. Unanswered questions score zero.');
  fireEvent.click(screen.getByText('Submit anyway'));
  await screen.findByText('Not passed: 1 of 2 correct (50%). The pass mark is 70%.');
  expect(calls.submitQuiz).toHaveBeenCalledWith('attempt-1', { q1: 'A' });
  expect(screen.queryByText('First question?')).not.toBeInTheDocument();
  await screen.findByText(/Your next attempt opens/);
  expect(screen.queryByText('Start another attempt')).not.toBeInTheDocument();
});

it('shows the retake wait instead of a start button', async () => {
  const { api: a } = api({ ...base, attempts: 1, bestPercent: 50, nextAttemptAt: new Date(Date.now() + 3_600_000).toISOString() });
  render(<FinalQuiz api={a} versionId="v" enrolled />);
  await screen.findByText(/Your next attempt opens .*Best result so far: 50%\./);
  expect(screen.queryByText('Start another attempt')).not.toBeInTheDocument();
});

it('reports a pass and offers no further attempts', async () => {
  const { api: a } = api({ ...base, passed: true, bestPercent: 90, attempts: 1, passedAt: '2026-10-19T10:00:00Z' });
  render(<FinalQuiz api={a} versionId="v" enrolled />);
  await screen.findByText(/You passed the final quiz on .* with 90%\. Next step for certification: the offline exam\./);
  expect(screen.queryByText(/Start/)).not.toBeInTheDocument();
});

it('resumes an open attempt with the answers saved in this browser', async () => {
  sessionStorage.setItem('armature-final-quiz:attempt-1', JSON.stringify({ q2: 'B' }));
  const { api: a } = api({ ...base, openAttempt: { id: 'attempt-1', expiresAt: new Date(Date.now() + 600_000).toISOString() } });
  render(<FinalQuiz api={a} versionId="v" enrolled />);
  fireEvent.click(await screen.findByText('Resume final quiz'));
  await screen.findByText('Second question?');
  expect(screen.getByLabelText('Delta')).toBeChecked();
  expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
});

it('submits automatically when time has run out', async () => {
  const { api: a, calls } = api(base, attempt(new Date(Date.now() - 1000).toISOString()));
  render(<FinalQuiz api={a} versionId="v" enrolled />);
  fireEvent.click(await screen.findByText('Start final quiz'));
  await waitFor(() => expect(calls.submitQuiz).toHaveBeenCalledTimes(1));
});
