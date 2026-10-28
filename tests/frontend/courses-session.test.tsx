import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { CourseSignIn, useCourseSession } from '../../course-app/CourseSession';
import { courseLocationUrl, readCourseLocation } from '../../course-app/course-location';

beforeEach(() => { window.history.replaceState(null, '', '/'); sessionStorage.clear(); });

it('keeps an exact-root email callback and saves only a validated same-browser course destination', async () => {
  window.history.replaceState(null, '', '/?version=version-a&lesson=sample&next=https://outside.test/&code=old');
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  render(<CourseSignIn client={{ auth: { signInWithOtp } } as unknown as SupabaseClient} />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'member@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email sign-in link' }));
  await screen.findByText('Check your email for a sign-in link. Open it in this browser to return to courses.');
  expect(signInWithOtp).toHaveBeenCalledWith({ email: 'member@example.test', options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } });
  expect(sessionStorage.getItem('armature-courses-return')).toBe('?version=version-a&lesson=sample');
  expect(screen.getByRole('link', { name: 'Register or review your membership' })).toHaveAttribute('href', 'https://armatureailabs.com/join/');
  expect(courseLocationUrl(readCourseLocation('?version=https://outside.test&lesson=sample'))).toBe('/');
});

it('retains a readable expired-link error when initial auth emits an empty session', async () => {
  window.history.replaceState(null, '', '/?error=access_denied&error_description=Untrusted-details');
  const client = { auth: {
    onAuthStateChange: (callback: (event: string, session: null) => void) => { callback('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe() {} } } }; },
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
  } } as unknown as SupabaseClient;
  const { result } = renderHook(() => useCourseSession(client));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toBe('The sign-in link expired or could not be completed. Request a new link and open it in this browser.');
  expect(result.current.session).toBeNull();
});

it('does not restore a stale session response after a sign-out event', async () => {
  let callback: (event: string, session: Session | null) => void = () => {};
  let resolve: (value: unknown) => void = () => {};
  const client = { auth: {
    onAuthStateChange: (next: typeof callback) => { callback = next; return { data: { subscription: { unsubscribe() {} } } }; },
    initialize: async () => ({ error: null }),
    getSession: () => new Promise(done => { resolve = done; }),
  } } as unknown as SupabaseClient;
  const { result } = renderHook(() => useCourseSession(client));
  act(() => callback('SIGNED_OUT', null));
  await act(async () => resolve({ data: { session: { user: { id: 'stale-user' }, access_token: 'stale' } }, error: null }));
  expect(result.current.ready).toBe(true);
  expect(result.current.session).toBeNull();
});


it.each([['?version=version-a&lesson=sample', '/?version=version-a&lesson=sample'], ['https://outside.test/', '/']])('restores only a local course destination after successful authentication: %s', async (stored, expected) => {
  sessionStorage.setItem('armature-courses-return', stored);
  const client = { auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: { user: { id: 'member' }, access_token: 'session' } }, error: null }),
  } } as unknown as SupabaseClient;
  const { result } = renderHook(() => useCourseSession(client));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(window.location.pathname + window.location.search).toBe(expected);
  expect(sessionStorage.getItem('armature-courses-return')).toBeNull();
});


it.each([null, { message: 'private server detail', code: 'flow_state_not_found' }])('shows callback failure even when INITIAL_SESSION arrives first: %s', async initializationError => {
  window.history.replaceState(null, '', '/?code=private-test-code');
  const client = { auth: {
    onAuthStateChange: (callback: (event: string, session: null) => void) => { callback('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe() {} } } }; },
    initialize: async () => ({ error: initializationError }),
    getSession: async () => ({ data: { session: null }, error: null }),
  } } as unknown as SupabaseClient;
  const { result } = renderHook(() => useCourseSession(client));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toContain('Request a fresh link below');
  expect(result.current.error).toContain('same browser and profile');
  expect(result.current.error).not.toContain('private');
  expect(result.current.session).toBeNull();
});

it('preserves an existing valid session when a reused link fails initialization', async () => {
  window.history.replaceState(null, '', '/?code=used-code');
  const client = { auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    initialize: async () => ({ error: { code: 'flow_state_not_found' } }),
    getSession: async () => ({ data: { session: { user: { id: 'member' }, access_token: 'session' } }, error: null }),
  } } as unknown as SupabaseClient;
  const { result } = renderHook(() => useCourseSession(client));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.session?.user.id).toBe('member');
  expect(result.current.error).toBe('');
});
