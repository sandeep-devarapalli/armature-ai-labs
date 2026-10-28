import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { courseLocationUrl, readCourseLocation } from './course-location';

import { restoreWebsiteSession, websiteSignOutKey } from './website-session';

const returnKey = 'armature-courses-return';
function restoreCourseDestination() {
  try {
    const search = sessionStorage.getItem(returnKey);
    sessionStorage.removeItem(returnKey);
    if (search !== null) window.history.replaceState(null, '', courseLocationUrl(readCourseLocation(search)));
  } catch { /* Navigation restoration is optional. */ }
}

export function useCourseSession(client: SupabaseClient) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(() => {
    const parameters = [new URLSearchParams(window.location.search), new URLSearchParams(window.location.hash.slice(1))];
    return parameters.some(params => ['error', 'error_code', 'error_description'].some(key => params.has(key)))
      ? 'The sign-in link expired or could not be completed. Request a new link and open it in this browser.' : '';
  });
  const callbackAttempt = useRef(new URLSearchParams(window.location.search).has('code') || new URLSearchParams(window.location.hash.slice(1)).has('access_token'));
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const handoff = new AbortController();
    const current = ++generation.current;
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (!active || event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        handoff.abort();
        try { sessionStorage.setItem(websiteSignOutKey, '1'); } catch { /* Optional local sign-out preference. */ }
      }
      ++generation.current;
      if (next) restoreCourseDestination();
      setSession(next); setReady(true); if (next) setError('');
    });
    void Promise.all([client.auth.initialize(), client.auth.getSession()]).then(async ([initialization, result]) => {
      if (!active || current !== generation.current) return;
      if (!result.data.session && !callbackAttempt.current && !handoff.signal.aborted) {
        const inherited = await restoreWebsiteSession(client, handoff.signal).catch(() => null);
        if (!active || current !== generation.current) return;
        if (inherited) { setSession(inherited); setReady(true); setError(''); return; }
      }
      if (!result.error && result.data.session) restoreCourseDestination();
      setSession(result.error ? null : result.data.session); setReady(true);
      if (result.data.session && !result.error) setError('');
      else if (initialization.error || callbackAttempt.current) setError('This sign-in link could not be completed in this browser. Request a fresh link below, then open it in the same browser and profile. Each link works only once.');
      else if (result.error) setError('Your session could not be restored. Please sign in again.');
    }).catch(() => { if (active && current === generation.current) { setReady(true); setError('Unable to restore your session.'); } });
    return () => { active = false; handoff.abort(); ++generation.current; data.subscription.unsubscribe(); };
  }, [client]);
  return { session, ready, error };
}

export function CourseSignIn({ client }: { client: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const localPassword = import.meta.env.DEV && import.meta.env.VITE_COURSES_LOCAL_PASSWORD === 'true' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const fields = new FormData(event.currentTarget);
    try {
      const email = String(fields.get('email')).trim();
      if (!localPassword) {
        try { sessionStorage.setItem(returnKey, courseLocationUrl(readCourseLocation()).slice(1)); } catch { /* Sign-in works without destination storage. */ }
      }
      const result = localPassword
        ? await client.auth.signInWithPassword({ email, password: String(fields.get('password')) })
        : await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } });
      if (result.error) throw result.error;
      if (!localPassword) setNotice('Check your email for a sign-in link. Open it in this browser to return to courses.');
    } catch { setError('Sign-in failed. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  return <main className="wrap account-entry" id="main-content"><h1>Learn with Armature.</h1><p>Sign in with your Armature member email. Registration is free. Sign in to see your course access and any remaining membership steps.</p>
    {!localPassword ? <p>Request and open your link in the same browser and profile. If you use Chrome for email, open this courses page in that Chrome profile first. Use the newest link only; each link works once.</p> : null}
    <button className="secondary" onClick={() => { try { sessionStorage.removeItem(websiteSignOutKey); } catch { /* Normal sign-in remains available. */ } window.location.reload(); }}>Continue with website sign-in</button>
    <form onSubmit={event => void submit(event)}><label>Email<input name="email" type="email" autoComplete="email" required /></label>
      {localPassword ? <label>Local test password<input name="password" type="password" autoComplete="current-password" required /></label> : null}
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : localPassword ? 'Sign in to local test' : 'Email sign-in link'}</button>
    </form>{notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="error">{error}</p> : null}
    <p><a href="https://armatureailabs.com/join/">Register or review your membership</a></p>
    {localPassword ? <p className="meta">Local test accounts only · real authentication against the isolated test backend.</p> : null}
  </main>;
}
