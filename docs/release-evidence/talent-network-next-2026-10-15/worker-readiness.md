# Marketplace worker readiness — 15 October 2026

Production project: `uxfhdfagrmaeyuaipaar`.

- Three activation flags independently checked against SHA256(false) before initial worker test; no secret values printed.
- Initial signed reminder request 3584: HTTP 200, workflow_notices 0, email_enabled false. Initial cleanup 3585: disabled 503. Anonymous reminder 401.
- After explicit daily chat-upload cleanup approval, attachment rows and candidates both 0; cleanup enabled. Anonymous cleanup 401; signed request 3587 HTTP 200, removed 0.
- Exact five-minute reminder and daily cleanup jobs activated. Cron timezone GMT; cleanup schedule 02:23 GMT / 07:53 IST. First natural reminder run 04:30 UTC succeeded, HTTP 200.
- Daily natural run still pending; its signed manual invocation passed. Cleanup only targets rejected chat uploads and quarantined uploads older than one day. Clean files, photos and government ID storage are untouched; audit rows retained.
- Migration 202610150007 applied atomically with ledger; maintenance worker deployed with additive aggregate health checks. All prior and new health counters zero at 04:30 UTC. Health detects HTTP errors, missing responses, stale schedules and cleanup backlog, without storing response bodies, headers or secrets. Startup grace: reminder 15 minutes, cleanup 26 hours.
- Local tests: 11 SQL checks, 32 maintenance unit tests. Missing prior HTTP response remains failed across the next wake until a successful response is observed. New SQL suite added to CI and replay harness.
- Unread-email flag remains false at this checkpoint; activation requires fixture cleanup and sender checks. Inbox delivery to a real recipient has not been tested.

Health access: Admin/Super admin or service role only; ordinary members and anonymous users denied. Two private aggregate records, no chat or identity content. Wake functions remain scheduler-owner only (not browser/service RPCs). Source migration body hash matches the production ledger. Email remains disabled; root owns later activation after fixture cleanup.
