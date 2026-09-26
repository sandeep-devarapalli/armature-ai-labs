import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.ONBOARDING_LOCAL_URL;
assert.equal(url, 'http://127.0.0.1:55421', 'Only the isolated local onboarding API is allowed.');
assert.equal(Number(process.versions.node.split('.')[0]), 22, 'Run with Node 22.');
const required = name => {
  assert.ok(process.env[name], `Missing ${name}`);
  return process.env[name];
};
const anonKey = required('ONBOARDING_LOCAL_ANON_KEY');
const serviceKey = required('ONBOARDING_LOCAL_SERVICE_KEY');
const jobSecret = required('ARMATURE_JOB_SECRET');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const users = [];
const paths = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  console.log(`PASS ${++checks}: ${label}`);
}
function success(result, label) {
  assert.equal(result.error?.code ?? null, null, `${label} failed (${result.error?.code ?? 'unknown'})`);
  assert.ok(!result.error, `${label} failed`);
  return result.data;
}
async function actor(name) {
  const email = `onboarding-${name}-${randomUUID()}@example.test`;
  const password = `${randomUUID()}-LocalOnly!`;
  const user = success(await service.auth.admin.createUser({ email, password, email_confirm: true }), 'Create synthetic user').user;
  users.push(user.id);
  const client = createClient(url, anonKey, options);
  const session = success(await client.auth.signInWithPassword({ email, password }), 'Synthetic sign-in').session;
  return { id: user.id, client, token: session.access_token };
}
async function application(person) {
  success(await person.client.rpc('submit_basic_onboarding', {
    p_full_name: 'Synthetic Test Member', p_phone: '+919999000000',
    p_linkedin_url: 'https://www.linkedin.com/in/synthetic-local-only/', p_date_of_birth: '2000-01-01',
  }), 'Submit synthetic application');
}
async function reserve(person, kind, idType = null) {
  const result = success(await person.client.rpc('reserve_onboarding_document', { p_kind: kind, p_id_type: idType }), 'Reserve document');
  const document = Array.isArray(result) ? result[0] : result;
  assert.ok(document?.id && document?.object_path, 'Reservation returns ID and object_path');
  paths.push(document.object_path);
  return document;
}
async function documentRequest(person, document, method = 'GET', body, contentType = 'image/png') {
  return fetch(`${url}/functions/v1/onboarding-document?id=${document.id}`, {
    method, redirect: 'error', headers: {
      apikey: anonKey, ...(person ? { Authorization: `Bearer ${person.token}` } : {}),
      ...(body ? { 'Content-Type': contentType } : {}),
    }, body,
  });
}
async function retention(secret) {
  return fetch(`${url}/functions/v1/onboarding-retention`, {
    method: 'POST', redirect: 'error', headers: { apikey: anonKey, 'x-armature-job-secret': secret },
  });
}

try {
  const owner = await actor('owner');
  const outsider = await actor('outsider');
  const staff = await actor('staff');
  assert.match(staff.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  execFileSync('docker', ['exec', '-i', 'supabase_db_armature-onboarding-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `insert into public.staff_roles(user_id, role, granted_by) values ('${staff.id}', 'admin', '${staff.id}');`,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  const initialGate = success(await service.from('onboarding_settings').select('enabled').eq('singleton', true).single(), 'Read local release gate');
  check(initialGate.enabled === false, 'Database onboarding gate defaults off');
  check(Boolean((await owner.client.rpc('submit_basic_onboarding', {
    p_full_name: 'Synthetic Test Member', p_phone: '+919999000000',
    p_linkedin_url: 'https://www.linkedin.com/in/synthetic-local-only/', p_date_of_birth: '2000-01-01',
  })).error), 'Disabled database gate rejects registration');
  success(await service.from('onboarding_settings').update({ enabled: true }).eq('singleton', true), 'Enable isolated local test only');
  await application(owner);
  const photo = await reserve(owner, 'photo');
  const identity = await reserve(owner, 'government_id', 'pan');
  success(await service.from('onboarding_documents').update({ created_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', identity.id), 'Delay synthetic reservation');

  check(Boolean((await owner.client.storage.from('onboarding-documents').upload(photo.object_path, png, { contentType: 'image/png' })).error), 'Owner cannot bypass upload endpoint through Storage');
  check(!(await documentRequest(null, photo, 'POST', png)).ok, 'Unauthenticated upload denied');
  check(!(await documentRequest(outsider, photo, 'POST', png)).ok, 'Other member upload denied');
  check(!(await documentRequest(owner, photo, 'POST', Buffer.from('not an image'))).ok, 'Invalid image signature rejected');
  check(!(await documentRequest(owner, photo, 'POST', png, 'text/plain')).ok, 'Wrong MIME upload rejected');
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  png.copy(oversized);
  check((await documentRequest(owner, photo, 'POST', oversized)).status === 413, 'Oversized image rejected before storage');
  check((await documentRequest(owner, photo, 'POST', png)).ok, 'Owner uploads synthetic photo');
  check((await documentRequest(owner, identity, 'POST', png)).ok, 'Owner uploads synthetic identity image');
  const uploaded = success(await service.from('onboarding_documents').select('created_at,uploaded_at,expires_at').eq('id', identity.id).single(), 'Read upload retention clock');
  check(Date.parse(uploaded.uploaded_at) - Date.parse(uploaded.created_at) > 23 * 3600000, 'Delayed reservation records the actual upload time');
  check(Date.parse(uploaded.expires_at) - Date.parse(uploaded.uploaded_at) === 30 * 86400000, 'Thirty-day retention starts at actual upload');
  check(!(await documentRequest(owner, identity, 'POST', png)).ok, 'Existing original cannot be overwritten');

  const ownRead = await documentRequest(owner, identity);
  check(ownRead.ok && Buffer.from(await ownRead.arrayBuffer()).equals(png), 'Owner retrieves exact original through authenticated endpoint');
  check(ownRead.headers.get('cache-control')?.includes('no-store'), 'Document response prevents browser caching');
  check(ownRead.headers.get('x-content-type-options') === 'nosniff', 'Document response disables MIME sniffing');
  check((await documentRequest(staff, identity)).ok, 'Authorized staff can review original');
  check(!(await documentRequest(outsider, identity)).ok, 'Other member cannot read original');
  check(!(await documentRequest(null, identity)).ok, 'Anonymous caller cannot read original');
  check(Boolean((await owner.client.storage.from('onboarding-documents').download(identity.object_path)).error), 'Owner cannot download directly from Storage');
  check(Boolean((await owner.client.storage.from('onboarding-documents').createSignedUrl(identity.object_path, 60)).error), 'Owner cannot mint a signed URL');
  const publicRead = await fetch(`${url}/storage/v1/object/public/onboarding-documents/${identity.object_path}`, { redirect: 'error' });
  check(!publicRead.ok, 'Private bucket has no public image access');
  const visible = success(await outsider.client.from('onboarding_documents').select('id').eq('user_id', owner.id), 'Outsider metadata query');
  check(visible.length === 0, 'Other member cannot see document metadata');

  check(Boolean((await owner.client.rpc('review_basic_onboarding', { p_user_id: owner.id, p_decision: 'approved' })).error), 'Member cannot approve their application');
  const reviewed = success(await staff.client.rpc('review_basic_onboarding', { p_user_id: owner.id, p_decision: 'approved' }), 'Staff approval');
  check(reviewed.status === 'approved', 'Independent reviewer approves uploaded application');
  check(!(await retention('invalid-local-secret')).ok, 'Retention rejects invalid job credential');
  const future = success(await service.storage.from('onboarding-documents').download(identity.object_path), 'Read local fixture before expiry');
  check(future.size === png.length, 'Original exists before expiry');
  success(await service.from('onboarding_documents').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', identity.id), 'Expire synthetic document');
  check(!(await documentRequest(owner, identity)).ok, 'Expired original inaccessible to owner');
  check(!(await documentRequest(staff, identity)).ok, 'Expired original inaccessible to reviewer');
  check((await retention(jobSecret)).ok, 'Retention worker runs against local storage');
  check(Boolean((await service.storage.from('onboarding-documents').download(identity.object_path)).error), 'Retention physically deletes expired original');
  const expired = success(await service.from('onboarding_documents').select('deleted_at').eq('id', identity.id).single(), 'Read deletion record');
  check(Boolean(expired.deleted_at), 'Deletion audit timestamp recorded');
  check((await retention(jobSecret)).ok, 'Repeated retention run succeeds idempotently');
  check(!(await service.storage.from('onboarding-documents').download(photo.object_path)).error, 'Unexpired photo survives retention');
  const membership = success(await owner.client.from('memberships').select('status').eq('user_id', owner.id), 'Read membership');
  check(membership.every(row => row.status !== 'active'), 'Basic application does not activate paid membership');
  success(await service.from('onboarding_settings').update({ enabled: false }).eq('singleton', true), 'Disable local onboarding');
  check((await documentRequest(owner, photo)).status === 503, 'Database off switch also closes document endpoint');
  console.log(`Completed ${checks} local onboarding integration checks.`);
} finally {
  success(await service.from('onboarding_settings').update({ enabled: false }).eq('singleton', true), 'Restore disabled database gate');
  if (paths.length) success(await service.storage.from('onboarding-documents').remove(paths), 'Remove synthetic originals');
  if (users.length) {
    success(await service.from('onboarding_reviews').delete().in('user_id', users), 'Remove synthetic review records');
    success(await service.from('onboarding_documents').delete().in('user_id', users), 'Remove synthetic document records');
    success(await service.from('basic_onboarding_applications').delete().in('user_id', users), 'Remove synthetic applications');
  }
  for (const id of users.reverse()) success(await service.auth.admin.deleteUser(id), 'Remove synthetic user');
}
