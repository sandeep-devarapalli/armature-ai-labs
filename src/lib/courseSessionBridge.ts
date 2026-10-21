import type { SupabaseClient } from '@supabase/supabase-js';

const courseOrigin = 'https://courses.armatureailabs.com';
export function installCourseSessionBridge(client: SupabaseClient) {
  let used = false;
  let active = true;
  const receive = async (event: MessageEvent) => {
    const request = event.data;
    if (!active || used || window.parent === window || event.source !== window.parent || event.origin !== courseOrigin ||
      request?.type !== 'armature:course-session:request' || typeof request.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(request.nonce)) return;
    used = true;
    let credential = null;
    try {
      const { data, error } = await client.auth.getSession();
      if (!error && data.session) {
        const result = await client.functions.invoke('course-session-handoff', { body: {} });
        const current = await client.auth.getSession();
        if (!result.error && !current.error && current.data.session?.user.id === data.session.user.id &&
          result.data?.user_id === data.session.user.id && typeof result.data.token_hash === 'string' && /^[a-f0-9]{32,128}$/.test(result.data.token_hash)) {
          credential = { token_hash: result.data.token_hash, user_id: result.data.user_id };
        }
      }
    } catch { /* Missing storage, expired sessions and service failures fall back to normal sign-in. */ }
    if (!active) return;
    window.parent.postMessage({ type: 'armature:course-session:response', nonce: request.nonce, credential }, courseOrigin);
  };
  window.addEventListener('message', receive);
  return () => { active = false; window.removeEventListener('message', receive); };
}
