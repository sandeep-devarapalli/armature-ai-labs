import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const directory = '/private/tmp/armature-courses-member-http';
const config = JSON.parse(readFileSync(`${directory}/private.json`, 'utf8'));
assert.equal(config.url, 'http://127.0.0.1:58421');
assert.equal(config.database, 'courses_member_http_check_20261004');
const sql = text => execFileSync('docker', ['exec', '-i', config.databaseContainer, 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U supabase_admin -d courses_member_http_check_20261004 -v ON_ERROR_STOP=1 -qAt'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const call = async (path, token = config.anonKey, body, method) => {
  const response = await fetch(config.url + path, { signal: AbortSignal.timeout(15000), method: method ?? (body ? 'POST' : 'GET'), headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
};
const rpc = async (name, token, body = {}) => {
  const result = await call(`/rest/v1/rpc/${name}`, token, body);
  if (name === 'admin_get_course_version' && result.status === 200) result.data = { ...result.data.course, ...result.data };
  return result;
};
const accountsPath = `${directory}/admin-accounts.json`;
const accounts = existsSync(accountsPath) ? JSON.parse(readFileSync(accountsPath, 'utf8')) : {};
for (const [name, role] of Object.entries({ admin: 'admin', superadmin: 'super_admin', staff: 'membership_reviewer' })) {
  if (!accounts[name]) {
    const email = `courses-${name}@example.test`, password = randomBytes(24).toString('base64url');
    const created = await call('/auth/v1/admin/users', config.serviceKey, { email, password, email_confirm: true });
    assert.equal(created.status, 200, `Create synthetic ${name}`);
    accounts[name] = { id: created.data.id, email, password };
    writeFileSync(accountsPath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  }
  const { id, email } = accounts[name];
  sql(`insert into public.staff_roles(user_id,role) values('${id}','${role}') on conflict do nothing;
    insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
    values('${id}','Synthetic ${name}','${email}','+919999999999','https://linkedin.com/in/synthetic-course-test','1990-01-01','pending') on conflict(user_id) do nothing;`);
}
chmodSync(accountsPath, 0o600);
const member = JSON.parse(readFileSync(`${directory}/accounts.json`, 'utf8')).verified;
const tokens = {};
for (const [name, account] of Object.entries({ ...accounts, member })) {
  const login = await call('/auth/v1/token?grant_type=password', undefined, { email: account.email, password: account.password });
  assert.equal(login.status, 200, `Sign in ${name}`); tokens[name] = login.data.access_token;
}
const { admin, superadmin, staff } = tokens;
const results = [];
const check = (name, pass, details) => { assert.ok(pass, `${name}${details ? ': ' + JSON.stringify(details) : ''}`); results.push({ name, passed: true }); };
const ok = async (name, promise) => { const result = await promise; check(name, result.status >= 200 && result.status < 300, result); return result.data; };
const denied = async (name, promise) => { const result = await promise; check(name, result.status >= 400 && result.status < 500, result); };
const original = sql(`select jsonb_build_object('authored',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.course_versions v where source_reference not like 'synthetic%'),'[]'), 'enrollments',coalesce((select jsonb_agg(to_jsonb(e) order by user_id,course_version_id) from public.course_enrollments e),'[]'), 'progress',coalesce((select jsonb_agg(to_jsonb(p) order by user_id,lesson_id) from public.course_lesson_progress p),'[]'));`);
await denied('anonymous administration denied', rpc('admin_list_course_versions'));
await denied('ordinary member administration denied', rpc('admin_list_course_versions', tokens.member));
await denied('membership-review staff administration denied', rpc('admin_list_course_versions', staff));
await ok('admin can list draft versions', rpc('admin_list_course_versions', admin));
await ok('super admin can list draft versions', rpc('admin_list_course_versions', superadmin));
const memberCatalog = await ok('member catalog readable', rpc('get_my_course_catalog', tokens.member));
const draftIds = JSON.parse(sql("select coalesce(jsonb_agg(id),'[]') from public.course_versions where status='draft';"));
check('member catalog excludes all draft versions', memberCatalog.every(course => !draftIds.includes(course.versionId)));
const fixture = { course: randomUUID(), version: randomUUID(), module: randomUUID(), lesson: randomUUID() };
const blocks = [{ id: 'admin-review-title', type: 'heading', content: { text: 'A reviewable synthetic lesson', level: 2 } }, { id: 'admin-review-text', type: 'text', content: { html: '<p>This synthetic course exercises review, samples and publication locally. It assigns no policy to the three authored courses.</p>' } }];
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
sql(`insert into public.courses(id,slug) values('${fixture.course}','local-admin-${fixture.course}');
insert into public.course_versions(id,course_id,version,title,description,source_reference,source_sha256) values('${fixture.version}','${fixture.course}',1,'Local test — Course administration','Synthetic fixture for draft editing and review.','synthetic local administration test',repeat('d',64));
insert into public.course_modules(id,course_version_id,source_id,title,position) values('${fixture.module}','${fixture.version}','review-module','Review workflow',0);
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position) values('${fixture.lesson}','${fixture.version}','${fixture.module}','review-lesson','Reviewable lesson',0);
insert into private.course_lesson_content(lesson_id,blocks) values('${fixture.lesson}',${literal(blocks)});
insert into private.course_assessment_material values('${fixture.version}','{"secret":"SYNTHETIC_PRIVATE_FINAL_ANSWERS"}');`);
const detail = () => rpc('admin_get_course_version', admin, { p_version_id: fixture.version });
const edit = (revision, overrides = {}, token = admin) => rpc('admin_update_course_version', token, { p_version_id: fixture.version, p_expected_revision: revision, p_title: 'Local test — Course administration', p_description: 'Synthetic fixture for draft editing and review.', p_access_tier: 'free', p_final_assessment_route: 'online_quiz', p_lab_policy_status: 'none', p_note: 'Synthetic local policy exercise', ...overrides });
const action = (name, revision, token = admin) => rpc(`admin_${name}_course_version`, token, { p_version_id: fixture.version, p_expected_revision: revision, p_note: `Synthetic local ${name} exercise` });
await denied('staff cannot update draft', edit(1, {}, staff));
await denied('member cannot update draft', edit(1, {}, tokens.member));
await denied('admin cannot bypass audited writes', call(`/rest/v1/course_versions?id=eq.${fixture.version}`, admin, { title: 'Unaudited' }, 'PATCH'));
await denied('staff cannot set samples directly', call(`/rest/v1/course_lessons?id=eq.${fixture.lesson}`, staff, { is_sample: true }, 'PATCH'));
await denied('unreviewed version cannot publish even when policies are deferred', action('publish', 1));
await denied('blank audit note rejected', edit(1, { p_note: ' ' }));
await ok('admin can read draft lesson through admin API', rpc('admin_get_course_lesson', admin, { p_lesson_id: fixture.lesson }));
await denied('admin cannot read draft through learner API', rpc('get_course_lesson', admin, { p_lesson_id: fixture.lesson }));
await ok('learning access saved with deferred assessment and labs', edit(1, { p_final_assessment_route: 'unassigned', p_lab_policy_status: 'unassigned' }));
let version = await ok('detail returns new revision', detail());
check('save increments revision and clears review', version.revision === 2 && version.reviewedRevision === null, version);
const stale = await edit(1);
check('stale draft save returns a non-retrying HTTP conflict', stale.status === 409 && stale.data.code === 'PT409', stale);
await denied('unreviewed version cannot publish', action('publish', version.revision));
await ok('review records current revision', action('review', version.revision));
version = await ok('review visible in detail', detail());
check('review is tied to exact revision', version.reviewedRevision === version.revision);
const changedBlocks = [...blocks, { id: 'extra-detail', type: 'text', content: { html: '<p>This subsequent edit must invalidate the review.</p>' } }];
await ok('lesson edit and sample selection saved', rpc('admin_update_course_lesson', admin, { p_lesson_id: fixture.lesson, p_expected_revision: version.revision, p_title: 'Reviewable lesson', p_is_sample: true, p_blocks: changedBlocks, p_note: 'Synthetic sample and lesson edit' }));
version = await ok('lesson edit updates version detail', detail());
check('lesson edit invalidates prior review', version.reviewedRevision === null && version.modules[0].lessons[0].isSample === true);
await denied('outdated review cannot publish changed lesson', action('publish', version.revision));
await denied('sample-only draft still private to learner', rpc('get_course_lesson', tokens.member, { p_lesson_id: fixture.lesson }));
await ok('updated draft reviewed by super admin', action('review', version.revision, superadmin));
await ok('reviewed synthetic course publishes', action('publish', version.revision));
const published = await ok('published synthetic course in member catalog', rpc('get_my_course_catalog', tokens.member));
check('member sees published synthetic version', published.some(course => course.versionId === fixture.version));
check('published assessment remains deferred', published.find(course => course.versionId === fixture.version).finalAssessmentRoute === 'unassigned');
check('published lab policy remains deferred', published.find(course => course.versionId === fixture.version).labPolicyStatus === 'unassigned');
check('admin detail excludes final answers', !JSON.stringify(await ok('published detail readable', detail())).includes('SYNTHETIC_PRIVATE_FINAL_ANSWERS'));
await ok('published selected sample readable', rpc('get_course_lesson', tokens.member, { p_lesson_id: fixture.lesson }));
await denied('admin role does not grant identity verification', rpc('enroll_in_course', admin, { p_version_id: fixture.version }));
sql(`update public.basic_onboarding_applications set status='approved' where user_id='${accounts.admin.id}';`);
try { await denied('verified admin cannot bypass paid entitlement', rpc('enroll_in_course', admin, { p_version_id: '79200000-0000-4000-8000-000000000002' })); }
finally { sql(`update public.basic_onboarding_applications set status='pending' where user_id='${accounts.admin.id}';`); }
await denied('admin cannot edit published version', edit((await detail()).data.revision));
await ok('verified member enrolls in synthetic published course', rpc('enroll_in_course', tokens.member, { p_version_id: fixture.version }));
await ok('verified member reads synthetic lesson', rpc('save_course_lesson_progress', tokens.member, { p_lesson_id: fixture.lesson, p_last_block: 1, p_read: true }));
version = await ok('version for clone readable', detail());
const clone = await ok('published version clones to draft', action('clone', version.revision));
const cloned = await ok('cloned draft detail readable', rpc('admin_get_course_version', admin, { p_version_id: clone }));
check('clone is distinct draft with no review', clone !== fixture.version && cloned.status === 'draft' && cloned.reviewedRevision === null);
check('clone has distinct lesson IDs', cloned.modules[0].lessons[0].id !== fixture.lesson);
check('clone has no learner enrollment or progress', sql(`select (select count(*) from public.course_enrollments where course_version_id='${clone}')+(select count(*) from public.course_lesson_progress where course_version_id='${clone}');`) === '0');
await denied('learner cannot access cloned draft', rpc('get_course_lesson', tokens.member, { p_lesson_id: cloned.modules[0].lessons[0].id }));
await ok('cloned draft accepts explicit configured learning labs policy', rpc('admin_update_course_version', admin, { p_version_id: clone, p_expected_revision: cloned.revision, p_title: cloned.title, p_description: cloned.description, p_access_tier: 'free', p_final_assessment_route: 'online_quiz', p_lab_policy_status: 'configured', p_note: 'Synthetic independent learning labs policy' }));
let labDraft = (await rpc('admin_get_course_version', admin, { p_version_id: clone })).data;
await ok('configured draft can be reviewed', rpc('admin_review_course_version', admin, { p_version_id: clone, p_expected_revision: labDraft.revision, p_note: 'Synthetic review with missing requirements' }));
await denied('configured lab policy without requirements cannot publish', rpc('admin_publish_course_version', admin, { p_version_id: clone, p_expected_revision: labDraft.revision, p_note: 'Synthetic negative publication test' }));
const lab = { moduleId: null, title: 'Synthetic learning lab', brief: 'Test the required learning lab configuration independently from the final quiz.', completionCriteria: 'Assessor records successful demonstration.', mandatory: true, location: 'Synthetic local fixture' };
await denied('cross-version module lab assignment rejected', rpc('admin_replace_course_labs', admin, { p_version_id: clone, p_expected_revision: labDraft.revision, p_requirements: [{ ...lab, moduleId: fixture.module }], p_note: 'Synthetic invalid module test' }));
await ok('course and module learning labs saved independently of online final quiz', rpc('admin_replace_course_labs', admin, { p_version_id: clone, p_expected_revision: labDraft.revision, p_requirements: [lab, { ...lab, moduleId: cloned.modules[0].id, title: 'Synthetic module lab' }], p_note: 'Synthetic learning requirements only' }));
labDraft = (await rpc('admin_get_course_version', admin, { p_version_id: clone })).data;
check('lab change invalidates review and retains both scopes', labDraft.reviewedRevision === null && labDraft.labRequirements.length === 2 && labDraft.labRequirements.some(item => item.moduleId === null) && labDraft.labRequirements.some(item => item.moduleId === cloned.modules[0].id));
version = await ok('version for withdrawal readable', detail());
await ok('published synthetic course withdrawn', action('withdraw', version.revision));
await denied('withdrawal removes enrolled lesson access', rpc('get_course_lesson', tokens.member, { p_lesson_id: fixture.lesson }));
const afterWithdrawal = await ok('member catalog after withdrawal', rpc('get_my_course_catalog', tokens.member));
check('withdrawn synthetic version absent from member catalog', !afterWithdrawal.some(course => course.versionId === fixture.version));
version = await ok('withdrawn audit history readable', detail());
check('audit records actor, note, revision and lifecycle', version.audit.length >= 6 && version.audit.every(entry => entry.actorId && entry.note && entry.revision && entry.createdAt));
await denied('admin cannot alter audit rows', call('/rest/v1/course_admin_audit', admin, { note: 'changed' }, 'PATCH'));
await denied('admin cannot delete audit rows', call('/rest/v1/course_admin_audit', admin, undefined, 'DELETE'));
const auditBefore = JSON.stringify(version.audit);
const fresh = await call('/auth/v1/token?grant_type=password', undefined, { email: accounts.admin.email, password: accounts.admin.password });
check('audit survives fresh authenticated session', JSON.stringify((await rpc('admin_get_course_version', fresh.data.access_token, { p_version_id: fixture.version })).data.audit) === auditBefore);
sql(`delete from public.staff_roles where user_id='${accounts.admin.id}' and role='admin';`);
try { await denied('revoked admin role denied with existing token', detail()); }
finally { sql(`insert into public.staff_roles(user_id,role) values('${accounts.admin.id}','admin');`); }
const current = sql(`select jsonb_build_object('authored',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.course_versions v where source_reference not like 'synthetic%'),'[]'), 'enrollments',coalesce((select jsonb_agg(to_jsonb(e) order by user_id,course_version_id) from public.course_enrollments e where course_version_id not in ('${fixture.version}','${clone}')),'[]'), 'progress',coalesce((select jsonb_agg(to_jsonb(p) order by user_id,lesson_id) from public.course_lesson_progress p where course_version_id not in ('${fixture.version}','${clone}')),'[]'));`);
check('original authored versions and prior learner history preserved', current === original);
const importPath = `${directory}/admin-import-check.sql`;
execFileSync(process.execPath, ['scripts/courses/generate-import.mjs', 'output/courses-corrected-v4', importPath, '4'], { stdio: ['ignore', 'pipe', 'pipe'] });
const importSql = readFileSync(importPath, 'utf8');
sql(importSql);
check('untouched authored draft reimport is idempotent', JSON.stringify(JSON.parse(sql(`select jsonb_agg(to_jsonb(v) order by id) from public.course_versions v where source_reference not like 'synthetic%';`))) === JSON.stringify(JSON.parse(original).authored));
const importedVersion = sql("select id from public.course_versions where source_reference not like 'synthetic%' and version=4 order by id limit 1;");
for (const [name, update] of [['edited', 'revision=revision+1'], ['reviewed', 'reviewed_revision=revision'], ['withdrawn', "status='withdrawn'"]]) {
  let rejected = false;
  try { sql(importSql.replace('begin;', `begin; update public.course_versions set ${update} where id='${importedVersion}';`).replace(/commit;\s*$/, 'rollback;')); }
  catch (error) { rejected = String(error.stderr).includes('Managed course version cannot be reimported'); }
  check(`${name} authored version cannot be reimported`, rejected);
}
check('importer rejection transactions preserve all authored drafts', JSON.stringify(JSON.parse(sql(`select jsonb_agg(to_jsonb(v) order by id) from public.course_versions v where source_reference not like 'synthetic%';`))) === JSON.stringify(JSON.parse(original).authored));
fixture.editableDraft = clone;
writeFileSync(`${directory}/admin-checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), database: config.database, fixture, checks: results }, null, 2));
console.log(`${results.length} real Auth/REST administration checks passed. Evidence: ${directory}/admin-checks.json. Synthetic admin accounts: ${accountsPath}`);
