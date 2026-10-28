import assert from 'node:assert/strict';
import { assertCourseProduction, backendOrigin, courseOrigin } from './release-config.mjs';
const valid = { VITE_COURSES_SITE_URL: courseOrigin, VITE_COURSES_SUPABASE_URL: backendOrigin, VITE_COURSES_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_not_a_real_key' };
assert.doesNotThrow(() => assertCourseProduction(valid));
for (const patch of [
  { VITE_COURSES_SITE_URL: 'http://localhost:4191' },
  { VITE_COURSES_SUPABASE_URL: 'http://127.0.0.1:58421' },
  { VITE_COURSES_SUPABASE_URL: 'https://icarypinlgndzckddlbq.supabase.co' },
  { VITE_COURSES_LOCAL_PASSWORD: 'true' },
  { VITE_DEMO_MODE: 'true' },
  { VITE_COURSES_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture' },
  { VITE_COURSES_SUPABASE_PUBLISHABLE_KEY: '' },
  { VITE_COURSES_SUPABASE_PUBLISHABLE_KEY: 'broken.jwt.token' },
]) assert.throws(() => assertCourseProduction({ ...valid, ...patch }));
console.log('9 production configuration checks passed.');
