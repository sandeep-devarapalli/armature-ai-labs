import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { installCourseSessionBridge } from '../../src/lib/courseSessionBridge';

const origin = 'https://courses.armatureailabs.com';
const nonce = 'a'.repeat(64);
const session = { user: { id: 'synthetic-user' }, access_token: 'private-access', refresh_token: 'private-refresh' };
let parent: { postMessage: ReturnType<typeof vi.fn> };
let getSession: ReturnType<typeof vi.fn>;
let invoke: ReturnType<typeof vi.fn>;
let dispose: () => void;
const send = (data: unknown = { type: 'armature:course-session:request', nonce }, messageOrigin = origin, source: unknown = parent) =>
  window.dispatchEvent(new MessageEvent('message', { data, origin: messageOrigin, source: source as Window }));
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

describe('website course session bridge', () => {
  beforeEach(() => {
    parent = { postMessage: vi.fn() };
    vi.stubGlobal('parent', parent);
    getSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
    invoke = vi.fn().mockResolvedValue({ data: { token_hash: 'b'.repeat(64), user_id: session.user.id, access_token: 'must-not-forward' }, error: null });
    dispose = installCourseSessionBridge({ auth: { getSession }, functions: { invoke } } as unknown as SupabaseClient);
  });
  afterEach(() => { dispose(); vi.unstubAllGlobals(); });

  it('returns only a one-use credential to the exact origin and nonce', async () => {
    send(); await flush();
    expect(invoke).toHaveBeenCalledWith('course-session-handoff', { body: {} });
    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'armature:course-session:response', nonce,
      credential: { token_hash: 'b'.repeat(64), user_id: session.user.id },
    }, origin);
    expect(JSON.stringify(parent.postMessage.mock.calls)).not.toMatch(/private-access|private-refresh|must-not-forward/);
  });
  it.each(['https://evil.example', 'https://courses.armatureailabs.com.evil.example', 'null'])('ignores origin %s', async badOrigin => {
    send(undefined, badOrigin); await flush();
    expect(getSession).not.toHaveBeenCalled(); expect(parent.postMessage).not.toHaveBeenCalled();
  });
  it('ignores a different window even at the correct origin', async () => {
    send(undefined, origin, window); await flush();
    expect(getSession).not.toHaveBeenCalled();
  });
  it('does not run when opened as a top-level page', async () => {
    vi.stubGlobal('parent', window); send(undefined, origin, window); await flush();
    expect(getSession).not.toHaveBeenCalled();
  });
  it.each([null, {}, { type: 'wrong', nonce }, { type: 'armature:course-session:request', nonce: 'short' }, { type: 'armature:course-session:request', nonce: 1 }])('ignores malformed message %j', async data => {
    send(data); await flush(); expect(getSession).not.toHaveBeenCalled();
  });
  it('responds once, including while its first request is pending', async () => {
    send(); send(); await flush(); send(); await flush();
    expect(invoke).toHaveBeenCalledTimes(1); expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });
  it('falls back without invoking the service when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    send(); await flush(); expect(invoke).not.toHaveBeenCalled();
    expect(parent.postMessage.mock.calls[0][0].credential).toBeNull();
  });
  it('falls back when session storage is unavailable', async () => {
    getSession.mockRejectedValue(new Error('storage unavailable'));
    send(); await flush(); expect(invoke).not.toHaveBeenCalled();
    expect(parent.postMessage.mock.calls[0][0].credential).toBeNull();
  });
  it.each([
    { data: { token_hash: 'secret', user_id: session.user.id }, error: { message: 'failure' } },
    { data: { token_hash: 'secret', user_id: 'other-user' }, error: null },
    { data: { token_hash: '', user_id: session.user.id }, error: null },
    { data: null, error: null },
  ])('rejects invalid service result %j', async result => {
    invoke.mockResolvedValue(result); send(); await flush();
    expect(parent.postMessage.mock.calls[0][0].credential).toBeNull();
  });
  it.each([
    { data: { session: { user: { id: 'switched-user' } } }, error: null },
    { data: { session: null }, error: null },
    { data: { session }, error: { message: 'session invalid' } },
  ])('rejects switched, signed-out or invalidated source session %j', async current => {
    getSession.mockResolvedValueOnce({ data: { session }, error: null }).mockResolvedValueOnce(current);
    send(); await flush(); expect(parent.postMessage.mock.calls[0][0].credential).toBeNull();
  });
  it('does not return a late credential after disposal', async () => {
    let finish: (value: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    send(); await flush(); dispose();
    finish({ data: { token_hash: 'late', user_id: session.user.id }, error: null });
    await flush(); expect(parent.postMessage).not.toHaveBeenCalled();
  });
});
