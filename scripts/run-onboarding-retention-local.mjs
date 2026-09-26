import { readFile, writeFile, rename, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const LOCAL_URL = 'http://127.0.0.1:55421';
export const STALE_MS = 600_000;

export function health(status, now = Date.now()) {
  const stale = !status.lastSuccess || now - Date.parse(status.lastSuccess) > STALE_MS;
  return { ...status, stale, healthy: !stale && status.state !== 'stopped' && status.consecutiveFailures === 0 && !status.backlog,
    alert: stale || status.consecutiveFailures >= 3 };
}

export function createRunner({ secret, url = LOCAL_URL, intervalMs = 300_000,
  fetcher = fetch, persist, now = Date.now, log = console.log }) {
  if (url !== LOCAL_URL) throw new Error('Only the isolated local onboarding API is allowed.');
  if (!secret) throw new Error('ARMATURE_JOB_SECRET is required.');
  if (!Number.isInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 300_000) {
    throw new Error('Interval must be 60000–300000 milliseconds.');
  }
  let running = false;
  let status = { version: 1, state: 'starting', lastAttempt: null, lastSuccess: null,
    consecutiveFailures: 0, nextRun: null, staleAfter: null, backlog: false,
    counts: { examined: 0, deleted: 0, failed: 0, batches: 0 },
    totals: { examined: 0, deleted: 0, failed: 0, batches: 0 } };
  async function save() { status = health(status, now()); await persist(status); }
  return {
    async run({ once = false } = {}) {
      if (running) return null;
      running = true;
      try {
        status.lastAttempt = new Date(now()).toISOString();
        status.state = 'running';
        status.nextRun = null;
        status.counts = { examined: 0, deleted: 0, failed: 0, batches: 0 };
        await save();
        let error = null;
        status.backlog = false;
        for (let batch = 0; batch < 10; batch++) {
          let response;
          try {
            response = await fetcher(`${url}/functions/v1/onboarding-retention`, {
              method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
              headers: { 'x-armature-job-secret': secret },
            });
          } catch { error = 'request_failed'; break; }
          let result;
          try { result = await response.json(); } catch { error = 'invalid_response'; break; }
          const valid = ['examined', 'deleted', 'failed'].every(key =>
            Number.isInteger(result?.[key]) && result[key] >= 0 && result[key] <= 100)
            && result.deleted + result.failed === result.examined;
          if (valid) {
            for (const key of ['examined', 'deleted', 'failed']) status.counts[key] += result[key];
            status.counts.batches++;
          }
          if (!response.ok) { error = 'http_failure'; break; }
          if (!valid) { error = 'invalid_response'; break; }
          if (result.failed) { error = 'deletion_failed'; break; }
          if (result.examined < 100) break;
          if (batch === 9) status.backlog = true;
        }
        for (const key of Object.keys(status.totals)) status.totals[key] += status.counts[key];
        status.consecutiveFailures = error ? status.consecutiveFailures + 1 : 0;
        if (!error) {
          status.lastSuccess = new Date(now()).toISOString();
          status.staleAfter = new Date(now() + STALE_MS).toISOString();
        }
        status.state = error ? 'failed' : status.backlog ? 'backlog' : 'idle';
        status.error = error;
        status.nextRun = once ? null : new Date(now() + intervalMs).toISOString();
        await save();
        log(`Local retention: ${status.state}; examined=${status.counts.examined}, deleted=${status.counts.deleted}, failed=${status.counts.failed}; consecutiveFailures=${status.consecutiveFailures}; alert=${status.alert}`);
        return { ...status };
      } finally { running = false; }
    },
    async stop() { status.state = 'stopped'; status.nextRun = null; await save(); },
  };
}

async function statusPath(filename) {
  if (!filename || !path.isAbsolute(filename)) throw new Error('--status-file requires an absolute path under /private/tmp.');
  const directory = await realpath(path.dirname(filename));
  if (directory !== '/private/tmp' && !directory.startsWith('/private/tmp/')) {
    throw new Error('Status file must be under /private/tmp.');
  }
  return path.join(directory, path.basename(filename));
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Run with Node 22.');
  const args = process.argv.slice(2);
  let filename;
  let intervalMs = 300_000;
  let once = false;
  let inspect = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--status-file') filename = args.shift();
    else if (arg === '--interval-ms') intervalMs = Number(args.shift());
    else if (arg === '--once') once = true;
    else if (arg === '--status') inspect = true;
    else throw new Error('Unknown argument. Use --status-file, --once, --status or --interval-ms.');
  }
  filename = await statusPath(filename);
  if (inspect) {
    const status = health(JSON.parse(await readFile(filename, 'utf8')));
    console.log(JSON.stringify(status, null, 2));
    process.exitCode = status.healthy ? 0 : 1;
    return;
  }
  const runner = createRunner({ secret: process.env.ARMATURE_JOB_SECRET,
    url: process.env.ONBOARDING_LOCAL_URL ?? LOCAL_URL, intervalMs,
    persist: async status => {
      const temporary = `${filename}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, filename);
    },
  });
  const shutdown = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown.abort());
  do {
    const status = await runner.run({ once });
    if (once) { process.exitCode = status.healthy ? 0 : 1; return; }
    await delay(intervalMs, undefined, { signal: shutdown.signal }).catch(() => {});
  } while (!shutdown.signal.aborted);
  await runner.stop();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Local retention runner stopped: check local configuration and status-file access. No remote action was attempted.');
    process.exitCode = 1;
  });
}
