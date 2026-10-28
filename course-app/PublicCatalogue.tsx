import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CourseCatalogue } from './CourseCatalogue';
import { courseApi, type CatalogueCourse } from './member-api';

export function PublicCatalogue({ client }: { client: SupabaseClient }) {
  const [courses, setCourses] = useState<CatalogueCourse[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    courseApi(client).publicCatalog(abort.signal).then(value => {
      if (!abort.signal.aborted) setCourses(value);
    }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [client, retry]);
  if (failed) return <main id="main-content" className="wrap account-entry"><h1>Explore Armature courses</h1><p role="alert">The course catalogue could not be loaded.</p><button onClick={() => setRetry(value => value + 1)}>Retry catalogue</button><p><a href="/?view=signin">Sign in to your courses</a></p></main>;
  if (!courses) return <main id="main-content" className="wrap account-entry"><p role="status">Loading course catalogue…</p></main>;
  return <CourseCatalogue courses={courses} />;
}
