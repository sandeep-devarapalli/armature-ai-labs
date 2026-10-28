import type { SupabaseClient } from '@supabase/supabase-js';

const websiteOrigin = 'https://armatureailabs.com';
export const websiteSignOutKey = 'armature-courses-website-signout';
export async function restoreWebsiteSession(client: SupabaseClient, signal: AbortSignal) {
  if (window.location.origin !== 'https://courses.armatureailabs.com' || signal.aborted) return null;
  try { if (sessionStorage.getItem(websiteSignOutKey)) return null; } catch { return null; }
  const credential = await new Promise<{ token_hash: string; user_id: string } | null>(resolve => {
    const frame = document.createElement('iframe');
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    frame.hidden = true;
    frame.title = 'Restore website sign-in';
    frame.referrerPolicy = 'no-referrer';
    frame.src = `${websiteOrigin}/auth/course-session`;
    const finish = (value: { token_hash: string; user_id: string } | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', abort);
      frame.remove();
      resolve(value);
    };
    const abort = () => finish(null);
    const receive = (event: MessageEvent) => {
      if (event.origin !== websiteOrigin || event.source !== frame.contentWindow ||
        event.data?.type !== 'armature:course-session:response' || event.data.nonce !== nonce) return;
      const value = event.data.credential;
      finish(value && typeof value.token_hash === 'string' && /^[a-f0-9]{32,128}$/.test(value.token_hash) &&
        typeof value.user_id === 'string' && /^[a-f0-9-]{36}$/.test(value.user_id) ? value : null);
    };
    const timer = window.setTimeout(() => finish(null), 8000);
    frame.onload = () => frame.contentWindow?.postMessage({ type: 'armature:course-session:request', nonce }, websiteOrigin);
    frame.onerror = abort;
    window.addEventListener('message', receive);
    signal.addEventListener('abort', abort, { once: true });
    document.body.append(frame);
  });
  if (!credential || signal.aborted) return null;
  const { data, error } = await client.auth.verifyOtp({ token_hash: credential.token_hash, type: 'magiclink' });
  if (error || data.user?.id !== credential.user_id) return null;
  return data.session;
}
