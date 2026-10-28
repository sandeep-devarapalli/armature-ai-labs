import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import CourseAdmin from '../../course-app/CourseAdmin';
import { CourseWorkspace } from '../../course-app/CourseWorkspace';
import type { AdminCourse, AdminDetail } from '../../course-app/admin-api';

const session = { user: { id: 'admin-a' }, access_token: 'token-a' } as Session;
const base: AdminCourse = { versionId: 'v1', courseId: 'c1', slug: 'synthetic', version: 1, title: 'Synthetic foundations', description: 'Course draft', status: 'draft', accessTier: 'unassigned', finalAssessmentRoute: 'unassigned', labPolicyStatus: 'unassigned', revision: 1, reviewedRevision: null, reviewedAt: null, moduleCount: 1, lessonCount: 1 };
const lesson = { id: 'l1', title: 'First explanation', isSample: false };
const body = [{ id: 'b1', type: 'text', content: { html: '<p>Original explanation</p>' } }];
interface Reply { data?: unknown; error?: { code: string; message?: string } }
function fixture(initial: Partial<AdminCourse> = {}) {
  let current = { ...base, ...initial };
  const handler = vi.fn(async (name: string, args: Record<string, unknown>): Promise<Reply> => {
    if (name === 'get_course_admin_access') return { data: { allowed: true } };
    if (name === 'admin_list_course_versions') return { data: [current] };
    if (name === 'admin_get_course_version') return { data: { course: current, modules: [{ id: 'm1', title: 'Module one', lessons: [lesson] }], labRequirements: [], audit: [] } satisfies AdminDetail };
    if (name === 'admin_get_course_lesson') return { data: body };
    if (name === 'admin_update_course_version') { current = { ...current, title: String(args.p_title), description: String(args.p_description), revision: current.revision + 1, reviewedRevision: null }; return { data: null }; }
    if (name === 'admin_review_course_version') { current = { ...current, reviewedRevision: current.revision }; return { data: null }; }
    if (name === 'admin_publish_course_version') { current = { ...current, status: 'published' }; return { data: null }; }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const client = { rpc: (name: string, args: Record<string, unknown>) => { const promise = handler(name, args); return Object.assign(promise, { abortSignal: () => promise }); } } as unknown as SupabaseClient;
  return { client, handler };
}
async function open() { await screen.findByRole('option', { name: /Synthetic foundations/ }); fireEvent.change(screen.getByLabelText('Course version'), { target: { value: 'v1' } }); await screen.findByLabelText('Course title'); }
beforeEach(() => window.history.replaceState(null, '', '/'));

it('keeps staff and members out of administration and never requests draft data', async () => {
  const { client, handler } = fixture(); handler.mockResolvedValue({ data: { allowed: false } });
  window.history.replaceState(null, '', '/admin/courses');
  render(<CourseWorkspace client={client} session={session}><p>Learning area</p></CourseWorkspace>);
  await screen.findByText('Administration unavailable');
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).not.toHaveBeenCalledWith('admin_list_course_versions', expect.anything());
});
it('saves course details with a note and expected revision; edits do not publish', async () => {
  const { client, handler } = fixture(); render(<CourseAdmin client={client} session={session} />); await open();
  fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'Revised draft' } });
  expect(screen.getByText('Save course details')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Change or review note'), { target: { value: 'Correct the course title' } });
  fireEvent.click(screen.getByText('Save course details'));
  await screen.findByText('Course details saved. Previous review is no longer current.');
  expect(handler).toHaveBeenCalledWith('admin_update_course_version', expect.objectContaining({ p_title: 'Revised draft', p_expected_revision: 1, p_note: 'Correct the course title' }));
  expect(handler.mock.calls.some(([name]) => name === 'admin_publish_course_version')).toBe(false);
});
it('retains local edits after an optimistic concurrency conflict', async () => {
  const { client, handler } = fixture(); const original = handler.getMockImplementation()!;
  handler.mockImplementation((name, args) => name === 'admin_update_course_version' ? Promise.resolve({ error: { code: 'PT409' } }) : original(name, args));
  render(<CourseAdmin client={client} session={session} />); await open();
  fireEvent.change(screen.getByLabelText('Course description'), { target: { value: 'My unsaved corrections' } });
  fireEvent.change(screen.getByLabelText('Change or review note'), { target: { value: 'Content correction' } });
  fireEvent.click(screen.getByText('Save course details')); await screen.findByText(/Another admin changed this version/);
  expect(screen.getByLabelText('Course description')).toHaveValue('My unsaved corrections');
  fireEvent.click(screen.getByText('Discard edits and reload')); await waitFor(() => expect(screen.getByLabelText('Course description')).toHaveValue('Course draft'));
});
it('allows deferred assessment and labs but requires content review, learning access and explicit publication intent', async () => {
  const { client, handler } = fixture({ accessTier: 'free' });
  render(<CourseAdmin client={client} session={session} />); await open();
  fireEvent.click(screen.getByRole('button', { name: 'Review & publish' }));
  fireEvent.change(screen.getByLabelText('Change or review note'), { target: { value: 'Reviewed synthetic lessons and policies' } });
  expect(screen.getByText('Publish reviewed version')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I have checked this version and intend to perform the selected action.'));
  fireEvent.click(screen.getByText('Record content review')); await screen.findByText('Content review recorded for this revision.');
  expect(screen.getByText('Publish reviewed version')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Change or review note'), { target: { value: 'Publish the reviewed synthetic fixture' } });
  fireEvent.click(screen.getByLabelText('I have checked this version and intend to perform the selected action.'));
  fireEvent.click(screen.getByText('Publish reviewed version')); await screen.findByText('Course version published to the connected course service.');
  expect(handler.mock.calls.filter(([name]) => name === 'admin_publish_course_version')).toHaveLength(1);
});
it('keeps published course fields read-only and offers a new draft rather than in-place edits', async () => {
  const { client } = fixture({ status: 'published', reviewedRevision: 1 }); render(<CourseAdmin client={client} session={session} />); await open();
  expect(screen.getByLabelText('Course title')).toBeDisabled(); expect(screen.queryByText('Save course details')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review & publish' }));
  expect(screen.getByText('Create new draft version')).toBeInTheDocument();
  expect(screen.queryByText('Publish reviewed version')).not.toBeInTheDocument();
});
it('ignores late lesson data after administration is unmounted', async () => {
  const { client, handler } = fixture(); const original = handler.getMockImplementation()!; let finish: (reply: Reply) => void = () => {};
  handler.mockImplementation((name, args) => name === 'admin_get_course_lesson' ? new Promise(resolve => { finish = resolve; }) : original(name, args));
  const view = render(<CourseAdmin client={client} session={session} />); await open();
  fireEvent.click(screen.getByRole('button', { name: 'Lessons & samples' }));
  fireEvent.click(screen.getByText('Module one')); fireEvent.click(screen.getByText('First explanation'));
  await screen.findByText('Loading protected lesson…'); view.unmount();
  await act(async () => finish({ data: body })); expect(screen.queryByText('Original explanation')).not.toBeInTheDocument();
});
it('retains unsaved edits while a transient role recheck fails and restores them on retry', async () => {
  const { client, handler } = fixture(); const original = handler.getMockImplementation()!; let offline = false;
  handler.mockImplementation((name, args) => name === 'get_course_admin_access' && offline ? Promise.reject(new Error('Offline')) : original(name, args));
  window.history.replaceState(null, '', '/admin/courses');
  render(<CourseWorkspace client={client} session={session}><p>Learning</p></CourseWorkspace>); await open();
  fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'Unsaved correction' } });
  offline = true; act(() => window.dispatchEvent(new Event('focus')));
  await screen.findByText('Retry access check');
  expect(screen.getByLabelText('Course title')).toHaveValue('Unsaved correction');
  expect(screen.getByLabelText('Course title')).not.toBeVisible();
  offline = false; fireEvent.click(screen.getByText('Retry access check'));
  await waitFor(() => expect(screen.getByLabelText('Course title')).toBeVisible());
  expect(screen.getByLabelText('Course title')).toHaveValue('Unsaved correction');
});
it('blocks duplicate mutation after clone succeeds but refreshing its result fails', async () => {
  const { client, handler } = fixture({ status: 'published' }); const original = handler.getMockImplementation()!;
  handler.mockImplementation((name, args) => name === 'admin_clone_course_version' ? Promise.resolve({ data: 'v2' }) : name === 'admin_get_course_version' && args.p_version_id === 'v2' ? Promise.reject(new Error('Offline')) : original(name, args));
  render(<CourseAdmin client={client} session={session} />); await open();
  fireEvent.click(screen.getByRole('button', { name: 'Review & publish' }));
  fireEvent.change(screen.getByLabelText('Change or review note'), { target: { value: 'Prepare next version' } });
  fireEvent.click(screen.getByLabelText('I have checked this version and intend to perform the selected action.'));
  fireEvent.click(screen.getByText('Create new draft version'));
  await screen.findByText('The change was saved, but refreshing the view failed. Reload this version before making another change.');
  expect(screen.getByText('Create new draft version')).toBeDisabled();
  expect(handler.mock.calls.filter(([name]) => name === 'admin_clone_course_version')).toHaveLength(1);
});

it('does not publish while learning access is unassigned even with current content review', async () => {
  const { client } = fixture({ reviewedRevision: 1 }); render(<CourseAdmin client={client} session={session} />); await open();
  fireEvent.click(screen.getByRole('button', { name: 'Review & publish' }));
  fireEvent.change(screen.getByLabelText('Change or review note'), { target: { value: 'Content reviewed; access undecided' } });
  fireEvent.click(screen.getByLabelText('I have checked this version and intend to perform the selected action.'));
  expect(screen.getByText('Publish reviewed version')).toBeDisabled();
});
