import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(execFileSync('supabase', ['status', '--workdir', '/private/tmp/armature-onboarding-local', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:55421');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const client = createClient(status.API_URL, status.ANON_KEY, options);
const original = await admin.from('onboarding_settings').select('enabled').eq('singleton', true).single();
assert.ifError(original.error);
const email = `scanner-${randomUUID()}@example.test`, password = randomUUID() + '-Synthetic!';
let user;
const paths = [];
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error); user = created.data.user;
  assert.ifError((await admin.from('onboarding_settings').update({ enabled: true }).eq('singleton', true)).error);
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  assert.ifError((await client.rpc('submit_basic_onboarding', { p_full_name: 'Synthetic Scanner Test', p_phone: '+919999000000', p_linkedin_url: 'https://www.linkedin.com/in/synthetic-scanner-test/', p_date_of_birth: '2000-01-01', p_notice_version: '2026-09-26-release-1' })).error);
  const clean = Buffer.from(execFileSync('/private/tmp/armature-scanner-venv/bin/python', ['-c', "import io,sys;from PIL import Image;o=io.BytesIO();Image.new('RGB',(32,32),'white').save(o,format='PNG');sys.stdout.buffer.write(o.getvalue())"]));
  const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
  const reserved = await client.rpc('reserve_onboarding_document', { p_kind: 'photo', p_id_type: null });
  assert.ifError(reserved.error);
  const document = Array.isArray(reserved.data) ? reserved.data[0] : reserved.data;
  paths.push(document.object_path);
  const sql = command => execFileSync('docker', ['exec', 'supabase_db_armature-onboarding-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', command], { stdio: 'ignore' });
  sql(`delete from public.onboarding_notice_acceptances where user_id='${user.id}'::uuid`);
  const noConsent = await fetch(`${status.API_URL}/functions/v1/onboarding-document?id=${document.id}`, { method: 'POST', headers: { Authorization: `Bearer ${signed.data.session.access_token}`, apikey: status.ANON_KEY, 'Content-Type': 'image/png' }, body: clean });
  assert.equal(noConsent.status, 403, 'Legacy reservation without current notice must reject before storage');
  assert.ok((await admin.storage.from('onboarding-documents').download(document.object_path)).error);
  console.log('missing current notice: 403; no storage object');
  sql(`insert into public.onboarding_notice_acceptances(user_id,revision,notice_version) select user_id,revision,'2026-09-26-release-1' from public.basic_onboarding_applications where user_id='${user.id}'::uuid`);
  for (const [name, body, expected] of [['truncated', clean.subarray(0, 30), 422], ['trailing-eicar', Buffer.concat([clean, eicar]), 422], ['clean', clean, 201]]) {
    const response = await fetch(`${status.API_URL}/functions/v1/onboarding-document?id=${document.id}`, { method: 'POST', headers: { Authorization: `Bearer ${signed.data.session.access_token}`, apikey: status.ANON_KEY, 'Content-Type': 'image/png' }, body });
    assert.equal(response.status, expected, `${name}: ${await response.text()}`);
    const record = await admin.from('onboarding_documents').select('uploaded_at').eq('id', document.id).single();
    assert.ifError(record.error);
    assert.equal(Boolean(record.data.uploaded_at), expected === 201);
    if (expected !== 201) {
      const stored = await admin.storage.from('onboarding-documents').download(document.object_path);
      assert.ok(stored.error, 'Rejected image must not enter storage');
    }
    console.log(`${name}: ${expected}; storage/finalization state correct`);
  }
} finally {
  if (paths.length) await admin.storage.from('onboarding-documents').remove(paths);
  if (user) await admin.auth.admin.deleteUser(user.id);
  assert.ifError((await admin.from('onboarding_settings').update({ enabled: original.data.enabled }).eq('singleton', true)).error);
  console.log('Synthetic test user/documents removed; prior onboarding gate restored');
}
