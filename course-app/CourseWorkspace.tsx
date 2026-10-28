import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { courseAdminApi } from './admin-api';
const CourseAdmin = lazy(() => import('./CourseAdmin'));

export function CourseWorkspace({ client, session, children }: { client: SupabaseClient; session: Session; children: ReactNode }) {
  const api = useMemo(() => courseAdminApi(client), [client]);
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const isAdminPage = window.location.pathname === '/admin/courses';
  useEffect(() => {
    let request = 0;
    let active = true;
    const abort = new AbortController();
    const check = async () => {
      const current = ++request;
      try { const result = await api.access(abort.signal); if (active && current === request) { setAllowed(result.allowed); setCheckFailed(false); } }
      catch { if (active && current === request) setCheckFailed(true); }
      finally { if (active && current === request) setChecked(true); }
    };
    void check();
    const refresh = () => { if (document.visibilityState === 'visible') void check(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { active = false; abort.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [api, session.access_token, retry]);
  return <>
    {allowed || isAdminPage ? <nav className="member-nav wrap" aria-label="Workspace"><a href="/">Learning</a>{allowed ? <a href="/admin/courses" aria-current={isAdminPage ? 'page' : undefined}>Course administration</a> : null}</nav> : null}
    {isAdminPage && checkFailed ? <div className="wrap error" role="alert">Unable to confirm administration access. Unsaved edits are retained, with editing hidden until access is confirmed. <button onClick={() => setRetry(value => value + 1)}>Retry access check</button></div> : null}
    {!isAdminPage ? children : !checked ? <main className="wrap" id="main-content"><p role="status">Checking administration access…</p></main> : allowed ? <div hidden={checkFailed}><Suspense fallback={<p role="status" className="wrap">Loading course administration…</p>}><CourseAdmin client={client} session={session} blocked={checkFailed} /></Suspense></div> : checkFailed ? null : <main className="wrap" id="main-content"><h1>Administration unavailable</h1><p>Course administration is restricted to Admins and Super admins. Sign in with an authorized account or return to Learning.</p></main>}
  </>;
}
