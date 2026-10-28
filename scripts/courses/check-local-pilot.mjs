import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const directory = '/private/tmp/armature-courses-member-http';
const config = JSON.parse(readFileSync(`${directory}/private.json`, 'utf8'));
const pilot = JSON.parse(readFileSync(`${directory}/pilot-20261004.json`, 'utf8'));
const accounts = JSON.parse(readFileSync(`${directory}/accounts.json`, 'utf8'));
assert.equal(config.url, 'http://127.0.0.1:58421'); assert.equal(config.database, 'courses_member_http_check_20261004'); assert.equal(pilot.database, config.database);
const sql = text => execFileSync('docker', ['exec', '-i', config.databaseContainer, 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U supabase_admin -d courses_member_http_check_20261004 -v ON_ERROR_STOP=1 -qAt'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
async function call(path, body, token = config.anonKey, extra = {}) {
  const response = await fetch(config.url + path, { method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(15000), headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const tokens = {};
for (const name of ['pending', 'verified', 'second']) {
  const a = accounts[name]; const result = await call('/auth/v1/token?grant_type=password', { email: a.email, password: a.password });
  assert.equal(result.status, 200); tokens[name] = result.data.access_token;
}
const rpc = (name, args = {}, token) => call(`/rest/v1/rpc/${name}`, args, token);
const results = [];
const check = (name, passed) => { assert(passed, name); results.push({ name, passed: true }); };
check('anonymous catalog denied', (await rpc('get_my_course_catalog')).status === 401);
check('pending identity is not verified', (await rpc('get_course_membership', {}, tokens.pending)).data.verified === false);
check('verified identity recognized', (await rpc('get_course_membership', {}, tokens.verified)).data.verified === true);
const catalog = await rpc('get_my_course_catalog', {}, tokens.pending); assert.equal(catalog.status, 200);
for (const course of pilot.courses) {
  const row = catalog.data.find(c => c.versionId === course.versionId);
  check(`${course.slug}: free catalog with deferred policies`, row?.accessTier === 'free' && row.finalAssessmentRoute === 'unassigned' && row.labPolicyStatus === 'unassigned');
  const { data: syllabus, status } = await rpc('get_course_syllabus', { p_version_id: course.versionId }, tokens.pending); assert.equal(status, 200);
  const lessons = syllabus.modules.flatMap(m => m.lessons), samples = lessons.filter(l => l.isSample), protectedLesson = lessons.find(l => !l.isSample);
  check(`${course.slug}: only two approved samples`, samples.length === 2 && course.samples.every(s => samples.some(l => l.id === s.id)));
  for (const lesson of samples) {
    const body = await rpc('get_course_lesson', { p_lesson_id: lesson.id }, tokens.pending);
    check(`${course.slug}: sample readable ${lesson.title}`, body.status === 200 && Array.isArray(body.data) && body.data.length > 0);
  }
  check(`${course.slug}: pending protected lesson denied`, (await rpc('get_course_lesson', { p_lesson_id: protectedLesson.id }, tokens.pending)).status === 403);
  check(`${course.slug}: pending enrollment denied`, (await rpc('enroll_in_course', { p_version_id: course.versionId }, tokens.pending)).status === 403);
  check(`${course.slug}: pending progress mutation denied`, (await rpc('save_course_lesson_progress', { p_lesson_id: samples[0].id, p_last_block: 0, p_read: true }, tokens.pending)).status === 403);
  const progress = await rpc('get_my_course_progress', { p_version_id: course.versionId }, tokens.second);
  check(`${course.slug}: other learner progress endpoint works`, progress.status === 200);
  const foreign = await call(`/rest/v1/course_lesson_progress?user_id=eq.${accounts.verified.id}&course_version_id=eq.${course.versionId}`, undefined, tokens.second);
  check(`${course.slug}: other learner cannot read verified learner progress`, foreign.status === 200 && foreign.data.length === 0);
  check(`${course.slug}: enrollment works`, (await rpc('enroll_in_course', { p_version_id: course.versionId }, tokens.verified)).status === 200);
  check(`${course.slug}: enrollment retry safe`, (await rpc('enroll_in_course', { p_version_id: course.versionId }, tokens.verified)).status === 200);
  const lesson = await rpc('get_course_lesson', { p_lesson_id: protectedLesson.id }, tokens.verified);
  check(`${course.slug}: enrolled lesson readable`, lesson.status === 200 && Array.isArray(lesson.data));
  const expected = JSON.parse(sql(`select blocks from private.course_lesson_content where lesson_id='${protectedLesson.id}';`));
  assert.deepEqual(lesson.data, expected);
  check(`${course.slug}: protected content exactly matches stored corrected blocks`, true);
  check(`${course.slug}: lesson contains no final assessment object`, !JSON.stringify(lesson.data).includes('correctAnswerId') && !JSON.stringify(lesson.data).includes('finalExam'));
  check(`${course.slug}: saved reading progress`, (await rpc('save_course_lesson_progress', { p_lesson_id: protectedLesson.id, p_last_block: 2, p_read: true }, tokens.verified)).status === 200);
  const a = accounts.verified;
  const fresh = await call('/auth/v1/token?grant_type=password', { email: a.email, password: a.password }); assert.equal(fresh.status, 200);
  const persisted = await rpc('get_my_course_progress', { p_version_id: course.versionId }, fresh.data.access_token);
  check(`${course.slug}: progress survives new session`, persisted.data.some(p => p.lessonId === protectedLesson.id && p.lastBlock === 2 && p.readAt));
  check(`${course.slug}: original v4 draft still inaccessible`, (await rpc('get_course_syllabus', { p_version_id: course.baseVersionId }, tokens.verified)).status === 403);
}
check('private final material unavailable through REST', (await call('/rest/v1/course_assessment_material', undefined, tokens.verified, { 'accept-profile': 'private' })).status === 406);
const report = { database: config.database, scope: 'Synthetic local learner rehearsal; no real participant or production publication', checks: results };
writeFileSync(`${directory}/pilot-checks.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`${results.length} local pilot Auth/API checks passed.`);
