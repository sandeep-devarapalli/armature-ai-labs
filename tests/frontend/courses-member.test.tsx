import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import MemberApp from '../../course-app/MemberApp';
import { MemberLesson } from '../../course-app/MemberLesson';
import type { CourseApi } from '../../course-app/member-api';

const version = 'version-a';
const sample = { id: 'sample', title: 'Sample introduction', isSample: true };
const protectedLesson = { id: 'protected', title: 'Protected lesson', isSample: false };
const blocks = [{ id: 'explanation', type: 'text', content: { html: '<p>Protected explanation</p>' } }, { id: 'diagram', type: 'illustration', content: { svgCode: '<svg viewBox="0 0 100 40"><text x="5" y="20">Protected diagram</text></svg>', caption: 'Inline protected figure' } }];
function fixture(verified = true, membership: Record<string, unknown> = {}) {
  let user: { id: string; email: string } | null = { id: 'member-a', email: 'a@example.test' };
  let change: (event: string, value: unknown) => void = () => {};
  let enrolled = false;
  let saved: { lessonId: string; lastBlock: number; readAt: string | null; updatedAt: string }[] = [];
  const row = () => ({ id: 'test-course', versionId: version, title: 'Test foundations', description: 'Synthetic test course', moduleCount: 1, lessonCount: 2, accessTier: 'free', finalAssessmentRoute: 'unassigned', labPolicyStatus: 'unassigned', canLearn: verified, enrolled, readCount: saved.filter(p => p.readAt).length, resumeLessonId: saved.at(-1)?.lessonId ?? null, lastBlock: saved.at(-1)?.lastBlock ?? 0 });
  const handler = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_course_admin_access') return { data: { allowed: false } };
    if (name === 'get_public_course_catalog') return { data: [{ id: 'test-course', versionId: version, title: 'Test foundations', description: 'Synthetic public description', moduleCount: 1, lessonCount: 2, accessTier: 'free' }] };
    if (name === 'get_my_course_catalog') return { data: [row()] };
    if (name === 'get_course_membership') return { data: { verified, ...membership } };
    if (name === 'get_course_syllabus') return { data: { modules: [{ id: 'm1', title: 'Module One', lessons: [sample, protectedLesson] }], labRequirements: [] } };
    if (name === 'get_my_course_progress') return { data: saved };
    if (name === 'enroll_in_course') { if (!verified) return { error: { code: '42501' } }; enrolled = true; return { data: {} }; }
    if (name === 'get_course_lesson') return args.p_lesson_id === 'sample' ? { data: [{ id: 's', type: 'text', content: { html: '<p>Sample explanation</p>' } }] } : verified && enrolled ? { data: blocks } : { error: { code: '42501' } };
    if (name === 'save_course_lesson_progress') {
      const next = { lessonId: String(args.p_lesson_id), lastBlock: Number(args.p_last_block), readAt: args.p_read ? '2026-10-04T10:00:00Z' : saved.find(p => p.lessonId === args.p_lesson_id)?.readAt ?? null, updatedAt: '2026-10-04T10:00:00Z' };
      saved = [...saved.filter(p => p.lessonId !== next.lessonId), next];
      return { data: { lesson_id: next.lessonId, last_block: next.lastBlock, read_at: next.readAt, updated_at: next.updatedAt } };
    }
    throw new Error(name);
  });
  const rpc = (name: string, args: Record<string, unknown>) => {
    const promise = handler(name, args);
    return Object.assign(promise, { abortSignal: () => promise });
  };
  const session = () => user ? { user, access_token: user.id } : null;
  const client = { rpc, auth: {
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: session() }, error: null }),
    onAuthStateChange: (callback: typeof change) => { change = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => { user = null; change('SIGNED_OUT', null); return { error: null }; },
  } } as unknown as SupabaseClient;
  return { client, handler, revoke() { verified = false; }, expire() { user = null; change('SIGNED_OUT', null); }, switchUser() { user = { id: 'member-b', email: 'b@example.test' }; enrolled = false; saved = []; change('SIGNED_IN', session()); } };
}
beforeEach(() => { window.history.replaceState(null, '', '/'); window.matchMedia = vi.fn().mockReturnValue({ matches: false }); window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn(); });

it('allows selected samples before verification without fetching full lessons or enrolling', async () => {
  const { client, handler } = fixture(false); render(<MemberApp client={client} />);
  fireEvent.click(await screen.findByText('View course'));
  fireEvent.click(await screen.findByText('Read sample lesson'));
  await screen.findByText('Sample explanation');
  expect(screen.queryByText('Protected explanation')).not.toBeInTheDocument();
  expect(screen.queryByText('Mark as read')).not.toBeInTheDocument();
  expect(handler).not.toHaveBeenCalledWith('get_course_lesson', { p_lesson_id: 'protected' });
  expect(handler.mock.calls.some(([name]) => name === 'enroll_in_course')).toBe(false);
});
it('enrolls a verified member, renders the protected diagram inline and resumes saved progress after remount', async () => {
  const { client } = fixture(); const view = render(<MemberApp client={client} />);
  fireEvent.click(await screen.findByText('View course'));
  fireEvent.click(await screen.findByText('Enroll in course'));
  fireEvent.click(await screen.findByRole('button', { name: 'Protected lesson' }));
  await screen.findByText('Protected explanation');
  expect(document.querySelector('article.lesson figure.diagram')).toHaveTextContent('Inline protected figure');
  await screen.findByText('Reading position saved.');
  fireEvent.click(screen.getByText('Mark as read'));
  await screen.findByText('Marked as read');
  view.unmount(); render(<MemberApp client={client} />);
  fireEvent.click(await screen.findByRole('button', { name: 'My courses' }));
  await screen.findByText('1 of 2 lessons read');
  fireEvent.click(screen.getByText('Resume learning'));
  await screen.findByText('Protected explanation');
});
it('removes protected content on access revocation and retains reading history only', async () => {
  const context = fixture(); render(<MemberApp client={context.client} />);
  fireEvent.click(await screen.findByText('View course')); fireEvent.click(await screen.findByText('Enroll in course'));
  fireEvent.click(await screen.findByRole('button', { name: 'Protected lesson' })); await screen.findByText('Protected explanation');
  context.revoke(); fireEvent.click(screen.getByText('Refresh access'));
  await waitFor(() => expect(screen.queryByText('Protected explanation')).not.toBeInTheDocument());
  await screen.findByText('Free identity verification is required for full learning.');
});
it('clears lesson data on sign out and does not show it to another account', async () => {
  const context = fixture(); render(<MemberApp client={context.client} />);
  fireEvent.click(await screen.findByText('View course')); fireEvent.click(await screen.findByText('Enroll in course'));
  fireEvent.click(await screen.findByRole('button', { name: 'Protected lesson' })); await screen.findByText('Protected explanation');
  act(() => context.switchUser());
  await screen.findByText('b@example.test');
  expect(screen.queryByText('Protected explanation')).not.toBeInTheDocument();
  act(() => context.expire());
  await screen.findByText('Learn with Armature.');
  expect(screen.queryByText('Test foundations')).not.toBeInTheDocument();
});
it('rejects a late protected lesson response after sign out', async () => {
  const context = fixture(); let resolve: (value: unknown) => void = () => {};
  const original = context.handler.getMockImplementation()!;
  context.handler.mockImplementation(async (name, args) => name === 'get_course_lesson' && args.p_lesson_id === 'protected' ? await new Promise<unknown>(r => { resolve = r; }) as Awaited<ReturnType<typeof original>> : original(name, args));
  render(<MemberApp client={context.client} />);
  fireEvent.click(await screen.findByText('View course')); fireEvent.click(await screen.findByText('Enroll in course'));
  fireEvent.click(await screen.findByRole('button', { name: 'Protected lesson' }));
  await screen.findByText('Loading protected lesson…');
  act(() => context.expire());
  await act(async () => resolve({ data: blocks }));
  expect(screen.queryByText('Protected explanation')).not.toBeInTheDocument();
  await screen.findByText('Learn with Armature.');
});
it('reports failed writes without claiming saved progress and retries the same position', async () => {
  const onSaved = vi.fn(); const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ lesson_id: 'protected', last_block: 1, read_at: null, updated_at: 'now' });
  render(<MemberLesson api={{ save } as unknown as CourseApi} lesson={protectedLesson} blocks={blocks} initialProgress={{ lessonId: 'protected', lastBlock: 1, readAt: null, updatedAt: 'before' }} canSave onSaved={onSaved} onDenied={vi.fn()} />);
  await screen.findByText('Position not saved. Use Save position to retry.'); expect(onSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Save position')); await screen.findByText('Reading position saved.');
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ lastBlock: 1 }));
  expect(within(document.querySelector('article.lesson')!).getByText('Inline protected figure')).toBeInTheDocument();
});
it('keeps the lesson and practice draft during unchanged-access background refresh', async () => {
  const context = fixture(); render(<MemberApp client={context.client} />);
  fireEvent.click(await screen.findByText('View course')); fireEvent.click(await screen.findByText('Enroll in course'));
  fireEvent.click(await screen.findByRole('button', { name: 'Protected lesson' })); await screen.findByText('Protected explanation');
  fireEvent.click(screen.getByRole('tab', { name: 'Practice' }));
  const originalArticle = document.querySelector('article.lesson');
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(context.handler.mock.calls.filter(([name]) => name === 'get_my_course_catalog').length).toBeGreaterThanOrEqual(3));
  expect(document.querySelector('article.lesson')).toBe(originalArticle);
  expect(screen.getByRole('tab', { name: 'Practice' })).toHaveAttribute('aria-selected', 'true');
});
it('clears enrollment busy state when a background refresh cancels its request', async () => {
  const context = fixture(); const original = context.handler.getMockImplementation()!;
  let finish: (value: unknown) => void = () => {};
  context.handler.mockImplementation(async (name, args) => name === 'enroll_in_course' ? await new Promise<unknown>(r => { finish = r; }) as Awaited<ReturnType<typeof original>> : original(name, args));
  render(<MemberApp client={context.client} />);
  fireEvent.click(await screen.findByText('View course')); fireEvent.click(await screen.findByText('Enroll in course'));
  await screen.findByText('Enrolling…');
  act(() => window.dispatchEvent(new Event('focus')));
  expect(await screen.findByText('Enroll in course')).toBeEnabled();
  await act(async () => finish({ data: {} }));
  expect(screen.getByText('Enroll in course')).toBeEnabled();
});

it('discloses deferred policies without claiming no labs or a certificate', async () => {
  const { client } = fixture(); render(<MemberApp client={client} />);
  fireEvent.click(await screen.findByText('View course'));
  await screen.findByText('Assessment policy: to be confirmed. Learning access does not include an assessment or certificate.');
  expect(screen.getByText('Course and module lab policy: to be confirmed. No lab activity is assigned in this version.')).toBeInTheDocument();
  expect(screen.queryByText('No separate learning labs are required.')).not.toBeInTheDocument();
});

it('restores a registered-member sample from its URL after reload without saving learning progress', async () => {
  window.history.replaceState(null, '', '/?version=version-a&lesson=sample');
  const context = fixture(false); const view = render(<MemberApp client={context.client} />);
  await screen.findByText('Sample explanation');
  view.unmount(); render(<MemberApp client={context.client} />);
  await screen.findByText('Sample explanation');
  expect(context.handler.mock.calls.some(([name]) => ['enroll_in_course', 'save_course_lesson_progress'].includes(name))).toBe(false);
});

it('restores course and lesson selection with browser back and forward', async () => {
  const context = fixture(false); render(<MemberApp client={context.client} />);
  fireEvent.click(await screen.findByText('View course'));
  await screen.findByText('Read sample lesson');
  expect(window.location.search).toBe('?version=version-a');
  fireEvent.click(screen.getByText('Read sample lesson'));
  await screen.findByText('Sample explanation');
  expect(window.location.search).toBe('?version=version-a&lesson=sample');
  act(() => window.history.back());
  await screen.findByText('Read sample lesson');
  expect(screen.queryByText('Sample explanation')).not.toBeInTheDocument();
  act(() => window.history.forward());
  await screen.findByText('Sample explanation');
});

it.each(['protected', 'not-in-syllabus'])('does not fetch a forbidden or unknown deep-linked lesson: %s', async lessonId => {
  window.history.replaceState(null, '', `/?version=version-a&lesson=${lessonId}`);
  const context = fixture(false); render(<MemberApp client={context.client} />);
  await screen.findByText('This lesson requires eligible membership, enrollment and any applicable course entitlement.');
  expect(context.handler.mock.calls.some(([name]) => name === 'get_course_lesson')).toBe(false);
  expect(window.location.search).toBe('?version=version-a');
});

it('does not request a syllabus or lesson for a version absent from the authorized catalog', async () => {
  window.history.replaceState(null, '', '/?version=unknown-version&lesson=sample');
  const context = fixture(); render(<MemberApp client={context.client} />);
  await screen.findByRole('heading', { name: 'Course unavailable' });
  expect(context.handler.mock.calls.some(([name]) => ['get_course_syllabus', 'get_course_lesson'].includes(name))).toBe(false);
});

it('keeps catalog and home destinations distinct and signs out through the compact account menu', async () => {
  const { client } = fixture(); render(<MemberApp client={client} />);
  await screen.findByText('View course');
  expect(screen.getByRole('link', { name: 'Armature AI Labs course catalog' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'All courses' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', 'https://armatureailabs.com/');
  const account = screen.getByLabelText('Account menu');
  fireEvent.click(account);
  expect(account.parentElement).toHaveAttribute('open');
  fireEvent.keyDown(account, { key: 'Escape' });
  expect(account.parentElement).not.toHaveAttribute('open');
  expect(account).toHaveFocus();
  fireEvent.click(account);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Learn how intelligent machines work.' });
  expect(screen.queryByLabelText('Account menu')).not.toBeInTheDocument();
  expect(screen.queryByText('a@example.test')).not.toBeInTheDocument();
});


it('lets confirmed-email Basic members enroll and read full free lessons when both gates are enabled', async () => {
  vi.stubEnv('VITE_MEMBERSHIP_LEVELS_ENABLED', 'true');
  try {
    const context = fixture(true, { verified: false, basic: true, membership_levels_enabled: true, membership_level: 'basic', role: 'admin' });
    render(<MemberApp client={context.client} />);
    fireEvent.click(await screen.findByText('View course'));
    await screen.findByText('Basic membership · enroll to start learning');
    fireEvent.click(screen.getByText('Enroll in course'));
    fireEvent.click(await screen.findByRole('button', { name: 'Protected lesson' }));
    await screen.findByText('Protected explanation');
    fireEvent.click(screen.getByText('Mark as read'));
    await screen.findByText('Marked as read');
    fireEvent.click(screen.getByLabelText('Account menu'));
    expect(screen.getByText('Basic member')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  } finally { vi.unstubAllEnvs(); }
});

it('does not turn a restricted Basic classification into learning access', async () => {
  vi.stubEnv('VITE_MEMBERSHIP_LEVELS_ENABLED', 'true');
  try {
    const context = fixture(false, { verified: false, basic: false, membership_levels_enabled: true, membership_level: null });
    render(<MemberApp client={context.client} />);
    fireEvent.click(await screen.findByText('View course'));
    expect(screen.queryByRole('button', { name: 'Enroll in course' })).not.toBeInTheDocument();
    expect(screen.queryByText('Basic member')).not.toBeInTheDocument();
  } finally { vi.unstubAllEnvs(); }
});
it('places lesson navigation inside the reading column, after the reading controls', async () => {
  const context = fixture(); render(<MemberApp client={context.client} />);
  fireEvent.click(await screen.findByText('View course')); fireEvent.click(await screen.findByText('Enroll in course'));
  fireEvent.click(await screen.findByRole('button', { name: 'Protected lesson' })); await screen.findByText('Protected explanation');
  const article = document.querySelector('article.lesson')!;
  const navigation = screen.getByRole('navigation', { name: 'Lesson navigation' });
  expect(article.contains(navigation)).toBe(true);
  expect(article.querySelector('.reading-status')!.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(navigation).getByRole('button', { name: /Previous lesson/ })).toBeInTheDocument();
  expect(within(navigation).getByRole('button', { name: /Next lesson/ })).toHaveClass('primary');
});
