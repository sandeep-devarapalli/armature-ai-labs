# Focused reminder diagnostics and recovery release

## Changes and limits

- Initial `market_process_reminders` RPC retries once after 3 seconds only on HTTP 401 / PGRST303 with no result data. The observed incident retained HTTP 401 but not its exact PostgREST code; that historical cause remains unknown.
- Every reminder RPC has an 8-second deadline and safe structured operation/status/error/attempt logging. Returned and thrown timeout/transport failures are distinguished without recording raw messages.
- Claim, preparation, completion and ambiguous provider outcomes are never retried by the new helper. Existing provider idempotency and lease checks remain intact.
- The monitor logs validated exact worker status/times and explicit issue codes. The alert gets a static subject and worker-oriented runbook; its condition, clean 30-minute recovery window, channel and missing-success policy remain unchanged.
- No database migration, recipient change, cleanup activation, payment change or test email.

## Local verification

Node 22.22.2; isolated checkout `/private/tmp/armature-auth-alert-recovery`.

- `node scripts/test-market-message-reminders.mjs`: 27 synthetic checks passed, including recovery, repeated rejection, nonmatching errors, ambiguous sends, later-operation failures and redaction.
- `node scripts/test-market-wakeup.mjs`: 20 signed-wakeup checks passed.
- `python3 -m unittest discover -s tools/member-notifications -p 'test_*.py'`: 19 passed.
- `npm test`: 783 tests / 68 files passed.
- `npm run build`: passed, including asset and SEO checks.
- `git diff --check`: passed. Independent scoped review found and resolved the SDK returned-error timeout path, then passed.

## Release acceptance

Require passing hosted frontend/browser/database CI, squash merge, deployed function source comparison, pinned monitor-image/configuration comparison, policy readback with unchanged conditions/strategy/channel, and a natural successful scheduled check. Record execution IDs, commit and deployment evidence after release. A successful test does not guarantee absence of future provider/network failures; diagnostics and failure detection must stay enabled.
