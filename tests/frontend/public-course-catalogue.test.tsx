import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import MemberApp from '../../course-app/MemberApp';

function anonymous() {
  const handler = vi.fn(async (name: string) => {
    if (name !== 'get_public_course_catalog') throw new Error('Protected RPC requested anonymously');
    return { data: [{ id: 'intro-to-robotics', versionId: 'published-robotics', title: 'Published robotics course', description: 'Public description only', moduleCount: 34, lessonCount: 195, accessTier: 'free' }] };
  });
  const client = { rpc: (name: string) => {
    const result = handler(name);
    return Object.assign(result, { abortSignal: () => result });
  }, auth: {
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } } as unknown as SupabaseClient;
  return { client, handler };
}
beforeEach(() => { window.history.replaceState(null, '', '/'); sessionStorage.clear(); });

it('shows published course discovery before sign-in without requesting membership or lesson data', async () => {
  const { client, handler } = anonymous();
  render(<MemberApp client={client} />);
  await screen.findByRole('heading', { name: 'Learn how intelligent machines work.' });
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/?view=signin');
  expect(screen.getAllByRole('link', { name: 'View course' })[0]).toHaveAttribute('href', '/?version=published-robotics');
  expect(handler.mock.calls.every(([name]) => name === 'get_public_course_catalog')).toBe(true);
  expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();
});

it.each(['/?version=published-robotics', '/?view=signin', '/?view=my', '/admin/courses'])('keeps account and course destinations behind sign-in: %s', async url => {
  window.history.replaceState(null, '', url);
  const { client, handler } = anonymous();
  render(<MemberApp client={client} />);
  await screen.findByRole('heading', { name: 'Learn with Armature.' });
  expect(handler).not.toHaveBeenCalled();
});

it('reports public-catalogue failure and allows retry without falling back to protected APIs', async () => {
  const { client, handler } = anonymous();
  handler.mockRejectedValueOnce(new Error('Offline'));
  render(<MemberApp client={client} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry catalogue' }));
  await screen.findByRole('heading', { name: 'Learn how intelligent machines work.' });
  await waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
});
