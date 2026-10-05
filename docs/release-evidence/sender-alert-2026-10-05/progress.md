# Member notification sender authentication repair — 5 October 2026

## Diagnosis

Seven Cloud Scheduler executions returned HTTP 503 in the reviewed 24-hour window. Every failure matched an internal `claim_member_notifications` request rejected with HTTP 401 and PostgREST `PGRST303`. Neighboring claims succeeded with empty queues. The latest sender incident closed automatically at 09:31:20 IST, but that closure alone does not prove the intermittent cause was fixed.

Hosted PostgREST is v14.5. The upstream [changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md) records a sporadic issued-at-future JWT correction in v14.18. Token timing is a supported hypothesis; the historical response body was not retained, so its exact validation message is unconfirmed.

Read-only production health showed four accepted notifications and zero overdue, failed, unknown, expired-lease, unconfirmed-delivery or unmatched-receipt counts. Cleanup remains disabled. No member email was created or resent during diagnosis.

## Scope and status

- [x] Correlate Scheduler, function invocation and internal REST failure records.
- [x] Verify current alert closure and queue health.
- [x] Add one three-second retry only for the initial claim rejected with exact HTTP 401 / PGRST303, before any database claim or provider send.
- [x] Preserve persistent HTTP 503 failures, all existing alerts, provider idempotency, prepare/finish behavior and the sender deadline.
- [x] Add operational logs without raw error messages, tokens or recipient information.
- [x] Independent review: no blocking findings.
- [x] Tests: 58 sender assertions and 576 total tests passed.
- [ ] Merge after required CI checks.
- [ ] Deploy only the sender; preserve its authentication configuration and all other functions/settings.
- [ ] Verify the deployed source, subsequent normal scheduled execution and read-only queue health.

This is a bounded application mitigation, not a hosted PostgREST upgrade or proof that the provider issue can never recur. No retries were added for ambiguous network errors, later database mutations or email sends. Diagnostic evidence stays in the local task folder; rollback source is retained privately.
