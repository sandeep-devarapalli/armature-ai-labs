import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const serviceDir = process.env.TALENT_LOCAL_SERVICES || '/private/tmp/talent-local-services';
const env = Object.fromEntries(fs.readFileSync(`${serviceDir}/auth.env`, 'utf8').trim().split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const database = new URL(env.GOTRUE_DB_DATABASE_URL);
assert.equal(database.pathname, '/armature_talent_launch_check', 'Only the isolated local database is allowed');
assert(['127.0.0.1', 'localhost', 'host.docker.internal'].includes(database.hostname), 'Local database host required');
const container = 'supabase_db_armature-equipment-wishlist-check';
function sql(query) {
  return execFileSync('docker', ['exec', '-e', 'PGPASSWORD=postgres', container, 'psql', '-U', 'supabase_admin', '-d', 'armature_talent_launch_check', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
assert.equal(sql('select current_database()'), 'armature_talent_launch_check');
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(role) {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${crypto.createHmac('sha256', env.GOTRUE_JWT_SECRET).update(body).digest('base64url')}`;
}
const service = jwt('service_role'), anon = jwt('anon');
const checks = [], accounts = {};
const run = `guided-http-${Date.now()}`;
const notificationSettings = JSON.parse(sql('select row_to_json(s) from public.member_notification_settings s') || 'null');
const password = `Synthetic-${crypto.randomBytes(18).toString('hex')}!`;
async function request(path, token, body, expected = 200, method = 'POST', auth = false) {
  const response = await fetch(`http://127.0.0.1:${auth ? 60422 : 60423}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let value; try { value = JSON.parse(text); } catch { value = text; }
  // Never print authentication bodies or bearer tokens on failure.
  assert.equal(response.status, expected, `${method} ${path.split('?')[0]} status (${value?.code || 'no code'})`);
  return value;
}
const rpc = (name, token, body = {}, expected = 200) => request(`/rpc/${name}`, token, body, expected);
function check(label, value) { assert(value, label); checks.push(label); }
const draft = (suffix = '') => ({ name: 'Synthetic Guided Engineer', title: 'Firmware engineer', location: 'Bengaluru', company: 'Synthetic Test Lab', linkedinUrl: `https://www.linkedin.com/in/${run}${suffix}`, skills: ['C++'], education: 'Synthetic degree', experience: 'Synthetic firmware role', availability: 'unknown' });
const save = (token, data, current) => rpc('talent_save_submission', token, { submission_id: current?.id || null, expected_revision: current?.revision || null, profile_data: data, private_evidence: 'Private synthetic ownership evidence; not public.' });
const submit = (token, row, extra = {}) => rpc('talent_submit_profile', token, { submission_id: row.id, expected_revision: row.revision, signed_name: row.data.name, declaration_version: '2026-10-14-add-profile-v1', declaration_accepted: true, ...extra });
const review = (row, decision, token = accounts.admin.token) => rpc('talent_review_submission', token, { submission_id: row.id, expected_revision: row.revision, decision, note: 'Synthetic independent manual review completed.' });
try {
  for (const role of ['owner', 'admin', 'other', 'staff']) {
    const email = `${run}-${role}@example.test`;
    const user = await request('/admin/users', service, { email, password, email_confirm: true }, 200, 'POST', true);
    accounts[role] = { id: user.id };
    const session = await request('/token?grant_type=password', anon, { email, password }, 200, 'POST', true);
    accounts[role].token = session.access_token;
    assert(session.access_token);
  }
  sql(`insert into public.staff_roles(user_id,role) values('${accounts.admin.id}','admin'),('${accounts.staff.id}','membership_reviewer')`);
  sql('insert into public.member_notification_settings(singleton) values(true) on conflict do nothing');
  sql(`update public.member_notification_settings set immediate_enabled=false,enabled=true,talent_notifications_enabled=true,all_members_enabled=false,pilot_recipients=array['${run}-owner@example.test']`);
  const owner = accounts.owner.token, other = accounts.other.token;
  await rpc('talent_my_submissions', anon, {}, 401);
  check('anonymous draft access denied', true);
  let row = await save(owner, draft());
  check('new draft is private and resumable', row.status === 'draft' && (await rpc('talent_my_submissions', owner))[0].id === row.id);
  check('another member cannot list private drafts', (await rpc('talent_my_submissions', other)).length === 0);
  await rpc('talent_save_submission', other, { submission_id: row.id, expected_revision: row.revision, profile_data: draft('-attack'), private_evidence: 'Unrelated synthetic account evidence' }, 403);
  await rpc('talent_submission_queue', other, {}, 403);
  await rpc('talent_submission_queue', accounts.staff.token, {}, 403);
  check('other member mutation and membership-review staff moderation denied', true);
  await rpc('talent_save_submission', owner, { submission_id: row.id, expected_revision: row.revision, profile_data: { ...draft(), claimed: true }, private_evidence: 'Synthetic ownership evidence for review' }, 400);
  check('client cannot inject ownership or verification fields', true);
  row = await save(owner, { ...draft(), headline: 'Updated synthetic draft' }, row);
  check('draft changes survive reload with revision', (await rpc('talent_my_submissions', owner))[0].data.headline === 'Updated synthetic draft' && row.revision === 2);
  await rpc('talent_submit_profile', owner, { submission_id: row.id, expected_revision: row.revision, signed_name: row.data.name, declaration_version: '2026-10-14-add-profile-v1', declaration_accepted: false }, 400);
  check('unsigned submission denied', true);
  row = await submit(owner, row);
  const pid = `member-${row.id}`;
  const receipt = JSON.parse(sql(`select row_to_json(n) from public.member_notifications n where talent_submission_id='${row.id}' and kind='talent_submission_received'`));
  check('submission queues private version 5 receipt', receipt.template_version === 5 && receipt.state === 'pending' && receipt.application_revision === row.revision && !JSON.stringify(receipt).includes('Private synthetic'));
  const lease = crypto.randomUUID();
  sql(`update public.member_notifications set state='leased',lease_token='${lease}',lease_until=now()+interval '2 minutes' where id='${receipt.id}'`);
  await rpc('prepare_member_notification', owner, { p_id: receipt.id, p_lease_token: lease }, 403);
  check('only delivery service can prepare profile email', await rpc('prepare_member_notification', service, { p_id: receipt.id, p_lease_token: lease }) === true);
  check('mock delivery completion is idempotent', await rpc('finish_member_notification', service, { p_id: receipt.id, p_lease_token: lease, p_outcome: 'accepted', p_provider_id: `mock-smtp-${run}` }) === true && await rpc('finish_member_notification', service, { p_id: receipt.id, p_lease_token: lease, p_outcome: 'accepted', p_provider_id: `mock-smtp-${run}` }) === false);
  check('submission awaits manual review and grants no ownership', row.status === 'pending' && !(await rpc('talent_my_status', owner, { profile_id: pid })).owner);
  check('pending profile not public', (await request(`/talent_profiles?id=eq.${pid}`, anon, undefined, 200, 'GET')).length === 0);
  await rpc('talent_update_profile', owner, { profile_id: pid, expected_revision: 1, patch: { title: 'Unauthorized pending edit' } }, 403);
  const queue = await rpc('talent_submission_queue', accounts.admin.token);
  check('admin sees signed revision and private evidence', queue.some(item => item.id === row.id && item.declaration?.version === '2026-10-14-add-profile-v1' && item.evidence.includes('Private synthetic')));
  row = await review(row, 'changes_requested');
  check('changes requested shown to member', (await rpc('talent_my_submissions', owner))[0].status === 'changes_requested');
  row = await save(owner, { ...row.data, title: 'Updated firmware engineer' }, row);
  row = await submit(owner, row);
  row = await review(row, 'rejected');
  check('rejection remains private with review note', row.status === 'rejected' && row.review_note && (await request(`/talent_profiles?id=eq.${pid}`, anon, undefined, 200, 'GET')).length === 0);
  row = await save(owner, { ...row.data, summary: 'Revised synthetic public summary' }, row);
  row = await submit(owner, row);
  check('pending duplicate identity does not expose private draft', (await rpc('talent_check_submission_identity', other, { linkedin_url: draft().linkedinUrl })).status === 'unavailable');
  await rpc('talent_save_submission', other, { submission_id: null, expected_revision: null, profile_data: draft(), private_evidence: 'Synthetic duplicate draft must be rejected' }, 500);
  check('competing duplicate draft blocked', true);
  row = await review(row, 'approved');
  const notices = JSON.parse(sql(`select json_agg(n) from (select kind,template_version,application_revision,private.member_notification_eligible(n) as eligible from public.member_notifications n where talent_submission_id='${row.id}' and recipient_id='${accounts.owner.id}') n`));
  check('review outcomes queue version 5 and only current approval remains eligible', ['talent_submission_received','talent_submission_changes_requested','talent_submission_rejected','talent_submission_approved'].every(kind => notices.some(n => n.kind === kind && n.template_version === 5)) && notices.filter(n => n.eligible).length === 1 && notices.find(n => n.eligible).kind === 'talent_submission_approved');
  check('approval grants ownership and publishes exactly one identity', row.profile_id === pid && (await rpc('talent_my_status', owner, { profile_id: pid })).owner);
  const publicRows = await request(`/talent_profiles?id=eq.${pid}`, anon, undefined, 200, 'GET');
  const publicData = publicRows[0].data;
  check('member provenance preserved without private review data', publicData.source === 'member' && publicData.claimed === true && !JSON.stringify(publicData).includes('Private synthetic') && !('evidence' in publicData) && !('review_note' in publicData) && !('declaration' in publicData));
  const existing = await rpc('talent_check_submission_identity', other, { linkedin_url: `${draft().linkedinUrl.toUpperCase()}/?trk=test` });
  check('canonical duplicate routes to existing profile', existing.status === 'existing' && existing.profile_id === pid);
  await rpc('talent_review_submission', accounts.admin.token, { submission_id: row.id, expected_revision: row.revision, decision: 'approved', note: 'Duplicate synthetic approval must fail.' }, 500);
  check('duplicate approval blocked', true);
  await rpc('talent_save_submission', owner, { submission_id: null, expected_revision: null, profile_data: draft('-second'), private_evidence: 'Synthetic second profile must be blocked' }, 500);
  check('existing owner cannot create a second profile', true);
  const edited = await rpc('talent_update_profile', owner, { profile_id: pid, expected_revision: publicRows[0].revision, patch: { title: 'Persisted owner firmware title', education: 'Updated member degree', experience: 'Updated member experience', availability: 'available' } });
  check('approved owner edits persist', edited.data.title === 'Persisted owner firmware title' && (await request(`/talent_profiles?id=eq.${pid}`, anon, undefined, 200, 'GET'))[0].data.education === 'Updated member degree');
  await rpc('talent_update_profile', other, { profile_id: pid, expected_revision: edited.revision, patch: { title: 'Unauthorized change' } }, 403);
  check('other member cannot edit approved profile', true);
  let adminDraft = await save(accounts.admin.token, draft('-admin'));
  adminDraft = await submit(accounts.admin.token, adminDraft);
  await rpc('talent_review_submission', accounts.admin.token, { submission_id: adminDraft.id, expected_revision: adminDraft.revision, decision: 'approved', note: 'Self approval must be denied.' }, 403);
  check('administrator cannot approve their own submission', true);
  const importRace = await submit(other, await save(other, draft('-import-race')));
  const imported = { ...draft('-import-race'), id: `${run}-imported` };
  sql(`insert into public.talent_profiles(id,data) values('${imported.id}','${JSON.stringify(imported)}'::jsonb)`);
  await rpc('talent_review_submission', accounts.admin.token, { submission_id: importRace.id, expected_revision: importRace.revision, decision: 'approved', note: 'Import race must not create another profile.' }, 500);
  check('identity imported after submission blocks approval without overwrite', (await rpc('talent_check_submission_identity', other, { linkedin_url: imported.linkedinUrl })).profile_id === imported.id);

} finally {
  const ids = Object.values(accounts).map(account => `'${account.id}'`).join(',');
  if (ids) {
    // Immutable history is bypassed only for disposable fixtures in this hard-guarded local DB.
    sql(`begin;
      alter table private.talent_submission_history disable trigger talent_submission_history_immutable;
      delete from private.talent_submission_history where actor_id in (${ids});
      alter table private.talent_submission_history enable trigger talent_submission_history_immutable;
      delete from public.member_notifications where talent_submission_id in (select id from private.talent_submissions where requester_id in (${ids}));
      delete from private.talent_submissions where requester_id in (${ids});
      delete from private.talent_profile_edits where editor_id in (${ids});
      delete from private.talent_owners where user_id in (${ids});
      delete from public.talent_profiles where data->>'linkedinUrl' like 'https://www.linkedin.com/in/${run}%';
      delete from public.staff_roles where user_id in (${ids}); commit;`);
    for (const account of Object.values(accounts)) await request(`/admin/users/${account.id}`, service, undefined, 200, 'DELETE', true);
  }
  if (notificationSettings) sql(`update public.member_notification_settings set immediate_enabled=${notificationSettings.immediate_enabled},enabled=${notificationSettings.enabled},talent_notifications_enabled=${notificationSettings.talent_notifications_enabled},all_members_enabled=${notificationSettings.all_members_enabled},pilot_recipients=ARRAY(select jsonb_array_elements_text('${JSON.stringify(notificationSettings.pilot_recipients).replaceAll("'", "''")}'::jsonb))`);
  else sql('delete from public.member_notification_settings');
}
fs.writeFileSync(`${serviceDir}/submission-http-evidence.json`, JSON.stringify({ checkedAt: new Date().toISOString(), database: database.pathname.slice(1), checks, passed: checks.length, fixturesRemoved: true }, null, 2));
console.log(`Passed ${checks.length} local HTTP integration checks; disposable fixtures removed.`);
