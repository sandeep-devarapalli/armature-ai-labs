import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

// Explicit opt-in and a local-only connection prevent accidental production fixtures.
assert.equal(process.env.ECOSYSTEM_LOCAL_TEST, 'true');
assert.ok(['127.0.0.1', 'localhost'].includes(process.env.PGHOST) || /^\/private\/tmp\/atlas-db-[A-Za-z0-9]+$/.test(process.env.PGHOST ?? ''));
assert.ok(process.env.PGDATABASE && process.env.PGPORT);
const psql = process.env.PSQL ?? 'psql';
const slug = `concurrency-${randomUUID()}`;
const firstKey = randomUUID();
const secondKey = randomUUID();
const firstHash = randomBytes(32).toString('hex');
const secondHash = randomBytes(32).toString('hex');
const data = JSON.stringify({ name: 'Synthetic concurrency fixture', summary: 'Isolated local concurrency test', primaryType: 'supplier', websiteUrl: 'https://example.org' });
const call = (key, hash) => `select public.receive_ecosystem_submission('${key}','${hash}','update','${slug}',1,'${data}',null,null,'${hash}')`;
function query(sql, onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { env: process.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; onOutput?.(stdout); });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(`${sql};\n`);
  });
}
try {
  assert.equal((await query(`insert into public.ecosystem_listings(slug,data,published) values('${slug}','${data}',true)`)).code, 0);
  let contender;
  let contenderStarted;
  const winner = query(`begin; set local role service_role; ${call(firstKey, firstHash)}; select 'WINNER_INSERTED'; select pg_sleep(1); commit`, output => {
    if (output.includes('WINNER_INSERTED') && !contender) {
      contenderStarted = Date.now();
      // A distinct key/hash avoids per-IP or idempotency serialization masking the index race.
      contender = query(`set role service_role; ${call(secondKey, secondHash)}`);
    }
  });
  const saved = await winner;
  assert.equal(saved.code, 0, saved.stderr);
  assert.ok(contender, 'The second connection must start while the winner is uncommitted.');
  const blocked = await contender;
  assert.notEqual(blocked.code, 0);
  assert.match(blocked.stderr, /P0409/);
  assert.ok(Date.now() - contenderStarted >= 500, 'The contender must wait for the unique-index conflict.');
  assert.equal((await query(`select count(*) from public.ecosystem_submissions where target_slug='${slug}' and status in ('pending','needs_info')`)).stdout, '1');
  const receipt = saved.stdout.split('\n')[0];
  const retried = await query(`set role service_role; ${call(firstKey, firstHash)}`);
  assert.equal(retried.code, 0, retried.stderr);
  assert.equal(retried.stdout, receipt);
  console.log('PASS: two concurrent connections, distinct rate hashes, one saved proposal, P0409 loser, idempotent winner retry.');
} finally {
  const cleanup = await query(`delete from private.ecosystem_notifications where submission_id in(select id from public.ecosystem_submissions where target_slug='${slug}'); delete from public.ecosystem_submissions where target_slug='${slug}'; delete from public.ecosystem_listings where slug='${slug}'; delete from private.ecosystem_rate_limits where key_hash in('${firstHash}','${secondHash}')`);
  assert.equal(cleanup.code, 0, cleanup.stderr);
}
