# Signup-confirmation tracking and truthful recovery

17 October 2026. Owner authorised repair, tests and production release.

The shared webhook and protected database recorder recognised only `Your sign-in link`.
A delivered `Confirm your email address` message therefore left two unmatched reports
and repeated failing quarter-hour checks. Live logs and exact provider correspondence
confirmed the cause. No recipient, login token or email body is retained here.

## Change

- Add the exact confirmation subject to both classifier layers and private constraint.
- Preserve signature, project and sender checks, duplicates, ownership and negative delivery reports.
- Replace the five-minute failure-only alert with equal 30-minute failure/success windows:
  any failure OR no successful check. Recovery therefore requires actual success plus
  a clean window. Keep the independent 45-minute missing-success policy.
- Reconcile only the verified historical provider using operator evidence, retaining receipts.
- Keep payment, recipients, sending and cleanup settings unchanged.

## Checks

- Independent source review: no blockers.
- Alert timeline tests pass for repeated failures, silence, old success then failure,
  healthy schedules and recovery. Live PromQL validation attached: current failures
  remain active; a historical clean interval returns no firing series.
- First historical healthy assumption at 08:15 UTC proved incorrect: a real 08:00 UTC
  failure was still in window. Query correctly fired; 08:35 UTC had failure 0/success 2.
- Database/webhook and full regression results: see testing.md when complete.

## Release order and evidence to complete

Passing CI and squash merge; compatible migration; webhook deployment/source check;
exact historical reconciliation; normal scheduled healthy execution; alert query and
policy readback; actual recovered incident. Until recorded below, release is unfinished.

## Release preparation

- PR #141 passed frontend/database CI and was squash-merged as `8fbfda85aa1e4ef492ca35dea4fc3fc3897b6b28` to preserve the already-deployed marketplace monitor compatibility fix.
- PR #145 was merged with that main revision; both README additions were retained.
- Combined Python monitoring/alert suite: 15 tests passed. Final JavaScript suite: 783 tests, 68 files passed. Build passed.
- Old failure policy remains enabled. Its CLOSED notification prompt was temporarily removed before migration; OPENED remains enabled, and the separate missing-success policy is unchanged. Restore CLOSED only after a genuine successful check and verification that obsolete incidents are closed.
- Pre-repair snapshot at 05:04:08 UTC: unmatched receipts 2, all other actionable membership counters zero, sending enabled, cleanup disabled. Exact two receipt fingerprint `8a3a8d46cdf6601d6270bc6cba283f0f`; settings fingerprint `c5475a69144d53a0cb74d97ad091f2a4`.
