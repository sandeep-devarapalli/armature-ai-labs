import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, health, STALE_MS } from '../../scripts/run-onboarding-retention-local.mjs';

function fixture(fetcher, extra = {}) {
  const statuses = [];
  const logs = [];
  const runner = createRunner({ secret: 'sensitive-secret', fetcher,
    persist: async s => statuses.push(structuredClone(s)), log: s => logs.push(s), ...extra });
  return { runner, statuses, logs };
}
const response = (body, ok = true) => ({ ok, json: async () => body });
const clean = { examined: 0, deleted: 0, failed: 0 };

test('successful batches drain until fewer than 100 remain', async () => {
  let calls = 0;
  const { runner } = fixture(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:55421/functions/v1/onboarding-retention');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return response(++calls === 1 ? { examined: 100, deleted: 100, failed: 0 } : clean);
  });
  const status = await runner.run();
  assert.equal(status.healthy, true);
  assert.equal(status.counts.deleted, 100);
  assert.equal(calls, 2);
  assert.ok(status.lastSuccess && status.nextRun && status.staleAfter);
});

test('remote targets and invalid intervals fail before any request', () => {
  let calls = 0;
  for (const url of ['https://example.com', 'http://localhost:55421', 'http://127.0.0.1:55421/']) {
    assert.throws(() => fixture(() => calls++, { url }), /Only the isolated/);
  }
  assert.throws(() => fixture(() => calls++, { intervalMs: 0 }), /Interval/);
  assert.throws(() => fixture(() => calls++, { secret: '' }), /required/);
  assert.equal(calls, 0);
});

test('network failures are sanitized and alert at three failures', async () => {
  const { runner, statuses, logs } = fixture(async () => { throw new Error('sensitive-secret /documents/secret-id'); });
  for (let i = 0; i < 3; i++) await runner.run();
  assert.equal(statuses.at(-1).consecutiveFailures, 3);
  assert.equal(statuses.at(-1).alert, true);
  assert.equal(statuses.at(-1).lastSuccess, null);
  assert.doesNotMatch(JSON.stringify({ statuses, logs }), /sensitive-secret|secret-id/);
});

test('HTTP failure records partial counts and never immediately retries', async () => {
  let calls = 0;
  const { runner } = fixture(async () => {
    calls++;
    return response({ examined: 100, deleted: 99, failed: 1, id: 'secret-id' }, false);
  });
  const status = await runner.run({ once: true });
  assert.equal(status.counts.deleted, 99);
  assert.equal(status.error, 'http_failure');
  assert.equal(status.nextRun, null);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(status), /secret-id/);
});

test('malformed counters and JSON are rejected', async () => {
  for (const body of [null, {}, { examined: 1, deleted: 0, failed: 0 }, { examined: 101, deleted: 101, failed: 0 }]) {
    assert.equal((await fixture(async () => response(body)).runner.run()).error, 'invalid_response');
  }
  assert.equal((await fixture(async () => ({ ok: true, json: async () => { throw Error(); } })).runner.run()).error, 'invalid_response');
});

test('batches bounded and overlapping calls skipped', async () => {
  let release;
  let calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const { runner } = fixture(async () => { calls++; await gate; return response({ examined: 100, deleted: 100, failed: 0 }); });
  const pending = runner.run();
  assert.equal(await runner.run(), null);
  release();
  const status = await pending;
  assert.equal(calls, 10);
  assert.equal(status.backlog, true);
  assert.equal(status.healthy, false);
});

test('stale heartbeat is recomputed and success recovers failures', async () => {
  let time = Date.now();
  let fail = true;
  const { runner } = fixture(async () => { if (fail) throw Error(); return response(clean); }, { now: () => time });
  await runner.run();
  fail = false;
  const success = await runner.run();
  assert.equal(success.consecutiveFailures, 0);
  assert.equal(success.healthy, true);
  time += STALE_MS + 1;
  assert.equal(health(success, time).stale, true);
  assert.equal(health(success, time).healthy, false);
  assert.equal(health(success, time).alert, true);
});
