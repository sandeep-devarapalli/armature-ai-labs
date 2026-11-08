import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { adapt, buildRehearsal, stagingBackend } from '../../scripts/build-desk-rehearsal.mjs';

test('staging bundle rejects production credentials/backend and preserves recovery and role gates', async () => {
  const output = await buildRehearsal();
  try {
    const manifest = JSON.parse(await readFile(resolve(output, 'rehearsal-manifest.json'), 'utf8'));
    assert.equal(manifest.mode, 'test');
    assert.equal(manifest.backend, stagingBackend);
    const checkout = await readFile(resolve(output, 'supabase/functions/_shared/desk-checkout.ts'), 'utf8');
    for (const gate of ['staff_mfa_required', 'independent_reviewer_required', 'list_desk_requests',
      'signed_payment_window_expired', 'reconcileLivePayment', 'manual_desk_agreement', 'list_own', 'staff_queue']) assert.ok(checkout.includes(gate));
    assert.ok(checkout.includes('const mode = "test";'));
    assert.ok(checkout.includes('const live = deployment === "live";'));
    const module = pathToFileURL(resolve(output, 'supabase/functions/_shared/live-desk-payment.ts')).href;
    execFileSync('deno', ['eval', `import {liveRazorpay,liveWebhookSettings} from ${JSON.stringify(module)};
      const vars={SUPABASE_URL:${JSON.stringify(stagingBackend)},REHEARSAL_DESK_RAZORPAY_KEY_ID:'rzp_test_Synthetic',REHEARSAL_DESK_RAZORPAY_KEY_SECRET:'synthetic-only-key',REHEARSAL_DESK_RAZORPAY_WEBHOOK_SECRET:'independent-synthetic-webhook-secret-1234',REHEARSAL_DESK_RAZORPAY_ACCOUNT_ID:'acc_Synthetic'};
      const env=n=>vars[n]; const fetcher=()=>{throw new Error('Network forbidden')};
      if(!liveWebhookSettings(liveRazorpay(env,fetcher),env))throw new Error('Staging test rejected');
      vars.REHEARSAL_DESK_RAZORPAY_KEY_ID='rzp_live_Synthetic';
      if(liveRazorpay(env,fetcher))throw new Error('Live key accepted');
      vars.REHEARSAL_DESK_RAZORPAY_KEY_ID='rzp_test_Synthetic';
      vars.SUPABASE_URL='https://uxfhdfagrmaeyuaipaar.supabase.co';
      if(liveRazorpay(env,fetcher))throw new Error('Production backend accepted');
    `], { stdio: 'pipe' });
    for (const file of manifest.files) {
      assert.match(file.sourceSha256, /^[a-f0-9]{64}$/);
      assert.match(file.bundleSha256, /^[a-f0-9]{64}$/);
    }
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('adapter fails closed when production source anchors change', () => {
  assert.throws(() => adapt('_shared/desk-checkout.ts', 'changed source'), /source changed/);
  assert.throws(() => adapt('_shared/live-desk-payment.ts', 'changed source'), /source changed/);
  assert.throws(() => adapt('_shared/unexpected.ts', 'rzp_live_secret'), /Production configuration remains/);
});
