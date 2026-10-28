// @vitest-environment-options {"url":"https://courses.armatureailabs.com/"}
import { restoreWebsiteSession, websiteSignOutKey } from '../../course-app/website-session';
import type { SupabaseClient } from '@supabase/supabase-js';

beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.querySelectorAll('iframe').forEach(frame => frame.remove()); });
const credential = { token_hash: 'a'.repeat(64), user_id: '11111111-1111-4111-8111-111111111111' };
function setup() {
  const session = { user: { id: credential.user_id } };
  const verifyOtp = vi.fn().mockResolvedValue({ data: { user: session.user, session }, error: null });
  const abort = new AbortController();
  const result = restoreWebsiteSession({ auth: { verifyOtp } } as unknown as SupabaseClient, abort.signal);
  const frame = document.querySelector('iframe')!;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  frame.dispatchEvent(new Event('load'));
  const nonce = post.mock.calls[0][0].nonce;
  const reply = (patch: Partial<MessageEventInit> = {}) => window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://armatureailabs.com', source: frame.contentWindow,
    data: { type: 'armature:course-session:response', nonce, credential }, ...patch,
  }));
  return { result, verifyOtp, abort, frame, post, nonce, reply };
}
it('exchanges a single-use credential for an independent session without credentials in URLs', async () => {
  const test = setup();
  expect(test.frame.src).toBe('https://armatureailabs.com/auth/course-session');
  expect(test.post.mock.calls[0][1]).toBe('https://armatureailabs.com');
  test.reply();
  expect((await test.result)?.user.id).toBe(credential.user_id);
  expect(test.verifyOtp).toHaveBeenCalledWith({ token_hash: credential.token_hash, type: 'magiclink' });
  expect(document.querySelector('iframe')).toBeNull();
});
it('ignores forged origins, windows and nonces and times out without adopting credentials', async () => {
  const test = setup();
  test.reply({ origin: 'https://attacker.test' });
  test.reply({ source: window });
  test.reply({ data: { type: 'armature:course-session:response', nonce: 'wrong', credential } });
  await vi.advanceTimersByTimeAsync(8000);
  expect(await test.result).toBeNull();
  expect(test.verifyOtp).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
});
it.each([null, { token_hash: 'bad', user_id: credential.user_id }])('fails closed for missing or malformed credentials', async value => {
  const test = setup();
  test.reply({ data: { type: 'armature:course-session:response', nonce: test.nonce, credential: value } });
  expect(await test.result).toBeNull();
  expect(test.verifyOtp).not.toHaveBeenCalled();
});
it('aborts on unmount/signout and ignores a later response', async () => {
  const test = setup(); test.abort.abort(); test.reply();
  expect(await test.result).toBeNull(); expect(test.verifyOtp).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
});
it('respects an explicit signout across reloads', async () => {
  sessionStorage.setItem(websiteSignOutKey, '1');
  const verifyOtp = vi.fn();
  expect(await restoreWebsiteSession({ auth: { verifyOtp } } as unknown as SupabaseClient, new AbortController().signal)).toBeNull();
  expect(document.querySelector('iframe')).toBeNull(); expect(verifyOtp).not.toHaveBeenCalled();
});
it('leaves normal login available if a credential is expired or reused', async () => {
  const test = setup(); test.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { code: 'otp_expired' } }); test.reply();
  expect(await test.result).toBeNull();
});
