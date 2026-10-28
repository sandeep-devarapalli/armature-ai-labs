import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const directory = '/private/tmp/armature-courses-member-http';
const config = JSON.parse(readFileSync(`${directory}/private.json`, 'utf8'));
assert.equal(config.url, 'http://127.0.0.1:58421');
assert.equal(config.database, 'courses_member_http_check_20261004');
const sql = text => execFileSync('docker', ['exec', '-i', config.databaseContainer, 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U supabase_admin -d courses_member_http_check_20261004 -v ON_ERROR_STOP=1 -qAt'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const call = async (path, token = config.anonKey, body, method, extraHeaders = {}) => {
  const response = await fetch(config.url + path, { method: method ?? (body ? 'POST' : 'GET'), headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
};
const rpc = (name, token, body = {}) => call(`/rest/v1/rpc/${name}`, token, body);
let accounts;
if (existsSync(`${directory}/accounts.json`)) accounts = JSON.parse(readFileSync(`${directory}/accounts.json`, 'utf8'));
else {
  accounts = {};
  for (const name of ['pending', 'verified', 'second']) {
    const email = `courses-${name}@example.test`, password = randomBytes(24).toString('base64url');
    const result = await call('/auth/v1/admin/users', config.serviceKey, { email, password, email_confirm: true });
    assert.equal(result.status, 200, `Create ${name}: ${JSON.stringify(result.data)}`);
    accounts[name] = { id: result.data.id, email, password };
    sql(`insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) values('${result.data.id}','Synthetic ${name}','${email}','+919999999999','https://linkedin.com/in/synthetic-course-test','1990-01-01','${name === 'pending' ? 'pending' : 'approved'}');`);
  }
  writeFileSync(`${directory}/accounts.json`, JSON.stringify(accounts, null, 2), { mode: 0o600 });
}
const fixture = {
  freeVersion: '79200000-0000-4000-8000-000000000001', paidVersion: '79200000-0000-4000-8000-000000000002',
  sample: '79400000-0000-4000-8000-000000000001', lesson: '79400000-0000-4000-8000-000000000002', paidLesson: '79400000-0000-4000-8000-000000000003', paidCourse: '79100000-0000-4000-8000-000000000002'
};
const sampleBlocks = [{ id: 'sample-title', type: 'heading', content: { text: 'Sample: sensing and decisions', level: 2 } }, { id: 'sample-text', type: 'text', content: { html: '<p>This synthetic lesson checks registered-member sample access. No course policy is assigned by this fixture.</p>' } }];
const blocks = [{ id: 'flow-title', type: 'heading', content: { text: 'Follow the signal', level: 2 } }, { id: 'flow-intro', type: 'text', content: { html: '<p>A controller reads a sensor, decides what to do, and signals an actuator. This local fixture checks reading, inline diagrams and saved progress.</p>' } }, { id: 'flow-diagram', type: 'illustration', content: { svgCode: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 140"><rect x="10" y="30" width="170" height="70" rx="8" fill="#ededed" stroke="#666"/><text x="55" y="73" fill="#222">Sensor</text><path d="M185 65h25" stroke="#666"/><rect x="215" y="30" width="170" height="70" rx="8" fill="#ededed" stroke="#666"/><text x="245" y="73" fill="#222">Controller</text><path d="M390 65h25" stroke="#666"/><rect x="420" y="30" width="170" height="70" rx="8" fill="#ededed" stroke="#666"/><text x="452" y="73" fill="#222">Actuator</text></svg>', caption: 'Synthetic local fixture: sensor, controller and actuator.' } }, { id: 'flow-detail', type: 'text', content: { html: '<p>Follow the diagram from left to right. Reading this lesson does not sign off a laboratory task, pass a final assessment or issue a certificate.</p>' } }, ...Array.from({ length: 8 }, (_, index) => ({ id: `reading-${index}`, type: 'text', content: { html: `<p>Checkpoint ${index + 1}: inspect the measured input, consider the desired output, and record your reasoning before changing a controller. This paragraph provides a stable reading position for testing resume after signing out and back in.</p>` } }))];
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
sql(`
insert into public.courses(id,slug) values('79100000-0000-4000-8000-000000000001','local-member-flow'),('${fixture.paidCourse}','local-paid-flow') on conflict do nothing;
insert into public.course_versions(id,course_id,version,title,description,source_reference,source_sha256,status,access_tier)
values('${fixture.freeVersion}','79100000-0000-4000-8000-000000000001',1,'Local test — Member learning flow','Synthetic fixture for authenticated enrollment and reading progress.','synthetic local test',repeat('e',64),'published','free'),('${fixture.paidVersion}','${fixture.paidCourse}',1,'Local test — Entitled course','Synthetic fixture for paid access checks; no payment system is enabled.','synthetic local test',repeat('e',64),'published','paid') on conflict do nothing;
insert into public.course_modules(id,course_version_id,source_id,title,position) values('79300000-0000-4000-8000-000000000001','${fixture.freeVersion}','signal','Signals and decisions',0),('79300000-0000-4000-8000-000000000002','${fixture.paidVersion}','paid','Entitled reading',0) on conflict do nothing;
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position,is_sample) values('${fixture.sample}','${fixture.freeVersion}','79300000-0000-4000-8000-000000000001','sample','Sample: sensing and decisions',0,true),('${fixture.lesson}','${fixture.freeVersion}','79300000-0000-4000-8000-000000000001','signal-flow','Follow the signal',1,false),('${fixture.paidLesson}','${fixture.paidVersion}','79300000-0000-4000-8000-000000000002','paid-flow','Entitled reading',0,false) on conflict do nothing;
insert into private.course_lesson_content values('${fixture.sample}',${literal(sampleBlocks)}),('${fixture.lesson}',${literal(blocks)}),('${fixture.paidLesson}',${literal(blocks)}) on conflict(lesson_id) do update set blocks=excluded.blocks;
insert into private.course_assessment_material values('${fixture.freeVersion}','{"secret":"FINAL_ANSWER_MUST_STAY_PRIVATE"}') on conflict do nothing;
delete from public.course_lesson_progress where course_version_id in ('${fixture.freeVersion}','${fixture.paidVersion}');
delete from public.course_enrollments where course_version_id in ('${fixture.freeVersion}','${fixture.paidVersion}');
delete from public.course_entitlements where course_id='${fixture.paidCourse}';
`);
const tokens = {};
for (const [name, account] of Object.entries(accounts)) {
  const result = await call('/auth/v1/token?grant_type=password', undefined, { email: account.email, password: account.password });
  assert.equal(result.status, 200, `Sign in ${name}`); tokens[name] = result.data;
}
const pilotPath = `${directory}/pilot-20261004.json`;
const pilotVersions = existsSync(pilotPath) ? JSON.parse(readFileSync(pilotPath, 'utf8')).courses.filter(c => c.phase === 'published').map(c => c.versionId) : [];
const results = [];
const check = (name, pass) => { assert.ok(pass, name); results.push({ name, passed: true }); };
const pending = tokens.pending.access_token, verified = tokens.verified.access_token, second = tokens.second.access_token;
check('anonymous catalog denied', (await rpc('get_my_course_catalog')).status === 401);
check('pending account is not verified', (await rpc('get_course_membership', pending)).data.verified === false);
check('verified identity recognized', (await rpc('get_course_membership', verified)).data.verified === true);
const catalog = await rpc('get_my_course_catalog', pending);
check('registered catalog contains only fixtures and approved local pilot versions', catalog.status === 200 && JSON.stringify(catalog.data.map(c => c.versionId).sort()) === JSON.stringify([fixture.freeVersion, fixture.paidVersion, ...pilotVersions].sort()));
check('private assessment material absent from catalog', !JSON.stringify(catalog.data).includes('FINAL_ANSWER_MUST_STAY_PRIVATE'));
check('pending member sees sample', (await rpc('get_course_lesson', pending, { p_lesson_id: fixture.sample })).status === 200);
check('pending protected lesson denied', (await rpc('get_course_lesson', pending, { p_lesson_id: fixture.lesson })).status === 403);
check('pending enrollment denied', (await rpc('enroll_in_course', pending, { p_version_id: fixture.freeVersion })).status === 403);
check('verified member must enroll before full lesson', (await rpc('get_course_lesson', verified, { p_lesson_id: fixture.lesson })).status === 403);
check('verified free enrollment succeeds', (await rpc('enroll_in_course', verified, { p_version_id: fixture.freeVersion })).status === 200);
check('enrollment retry is idempotent', (await rpc('enroll_in_course', verified, { p_version_id: fixture.freeVersion })).status === 200 && (await call(`/rest/v1/course_enrollments?course_version_id=eq.${fixture.freeVersion}`, verified)).data.length === 1);
check('enrolled protected lesson includes inline diagram', (await rpc('get_course_lesson', verified, { p_lesson_id: fixture.lesson })).data.some(block => block.id === 'flow-diagram'));
check('saved read and resume position', (await rpc('save_course_lesson_progress', verified, { p_lesson_id: fixture.lesson, p_last_block: 3, p_read: true })).status === 200);
const freshLogin = await call('/auth/v1/token?grant_type=password', undefined, { email: accounts.verified.email, password: accounts.verified.password });
const persisted = await rpc('get_my_course_progress', freshLogin.data.access_token, { p_version_id: fixture.freeVersion });
check('progress survives new authenticated session', persisted.data[0].lastBlock === 3 && !!persisted.data[0].readAt);
check('other learner sees no progress', (await rpc('get_my_course_progress', second, { p_version_id: fixture.freeVersion })).data.length === 0);
check('other learner sees no enrollment', (await call(`/rest/v1/course_enrollments?course_version_id=eq.${fixture.freeVersion}`, second)).data.length === 0);
check('client cannot write progress directly', (await call(`/rest/v1/course_lesson_progress?user_id=eq.${accounts.verified.id}`, verified, { last_block: 0 }, 'PATCH')).status === 403);
check('client cannot mint entitlement', (await call('/rest/v1/course_entitlements', verified, { user_id: accounts.verified.id, course_id: fixture.paidCourse, starts_at: new Date().toISOString(), ends_at: '2099-01-01', source_reference: 'forged' })).status === 403);
check('client cannot publish or promote samples', (await call(`/rest/v1/course_lessons?id=eq.${fixture.lesson}`, verified, { is_sample: true }, 'PATCH')).status === 403);
check('private schema unavailable through API', (await call('/rest/v1/course_assessment_material', verified, undefined, undefined, { 'accept-profile': 'private' })).status === 406);
check('paid enrollment denied without entitlement', (await rpc('enroll_in_course', verified, { p_version_id: fixture.paidVersion })).status === 403);
sql(`insert into public.course_entitlements(user_id,course_id,starts_at,ends_at,source_reference) values('${accounts.verified.id}','${fixture.paidCourse}',now()-interval '1 minute',now()+interval '1 day','synthetic local test');`);
check('valid entitlement permits paid enrollment', (await rpc('enroll_in_course', verified, { p_version_id: fixture.paidVersion })).status === 200);
check('valid entitlement permits paid reading', (await rpc('get_course_lesson', verified, { p_lesson_id: fixture.paidLesson })).status === 200);
sql(`update public.course_entitlements set revoked_at=now() where course_id='${fixture.paidCourse}';`);
check('revoked entitlement denies next content request', (await rpc('get_course_lesson', verified, { p_lesson_id: fixture.paidLesson })).status === 403);
sql(`update public.course_entitlements set revoked_at=null,ends_at=now()-interval '1 second' where course_id='${fixture.paidCourse}';`);
check('expired entitlement denies next content request', (await rpc('get_course_lesson', verified, { p_lesson_id: fixture.paidLesson })).status === 403);
const [header, payload] = verified.split('.');
const expiredPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), exp: Math.floor(Date.now() / 1000) - 60 })).toString('base64url');
const expired = `${header}.${expiredPayload}.${createHmac('sha256', config.secret).update(`${header}.${expiredPayload}`).digest('base64url')}`;
check('expired signed session rejected', (await rpc('get_my_course_catalog', expired)).status === 401);
const refreshed = await call('/auth/v1/token?grant_type=refresh_token', undefined, { refresh_token: tokens.second.refresh_token });
check('real Auth refresh restores valid session', refreshed.status === 200 && (await rpc('get_my_course_catalog', refreshed.data.access_token)).status === 200);
sql(`update public.basic_onboarding_applications set status='revoked' where user_id='${accounts.verified.id}';`);
check('identity revocation blocks existing session content', (await rpc('get_course_lesson', verified, { p_lesson_id: fixture.lesson })).status === 403);
sql(`update public.basic_onboarding_applications set status='approved' where user_id='${accounts.verified.id}';`);
const authored = JSON.parse(sql("select jsonb_agg(to_jsonb(v)) from public.course_versions v where source_reference not like 'synthetic%';"));
check('baseline drafts and approved free pilot policies retained', authored.every(v => v.final_assessment_route === 'unassigned' && v.lab_policy_status === 'unassigned' && (pilotVersions.includes(v.id) ? v.status === 'published' && v.access_tier === 'free' : v.status === 'draft' && v.access_tier === 'unassigned')));
writeFileSync(`${directory}/checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), database: config.database, fixture, checks: results }, null, 2));
console.log(`${results.length} real Auth/REST checks passed. Evidence: ${directory}/checks.json. Synthetic login accounts: ${directory}/accounts.json`);
