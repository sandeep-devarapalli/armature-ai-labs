# Signup-confirmation tracking and truthful recovery

17 October 2026. Owner authorised repair, tests and production release.

The shared webhook and protected database recorder recognised only `Your sign-in link`.
A delivered `Confirm your email address` message therefore left two unmatched reports
and repeated failing quarter-hour checks. Live logs and exact provider correspondence
confirmed the cause. No recipient, login token or email body is retained here.

## Change

- Add the exact confirmation subject to both classifier layers and private constraint.
- Preserve signature, project and sender checks, duplicates, ownership and negative delivery reports.
- Replace the five-minute failure-only alert with equal30-minute failure/success windows:
  any failure OR no successful check. Recovery therefore requires actual success plus
  a clean window. Keep the independent45-minute missing-success policy.
- Reconcile only the verified historical provider using operator evidence, retaining receipts.
- Keep payment, recipients, sending and cleanup settings unchanged.

## Checks

- Independent source review: no blockers.
- Alert timeline tests pass for repeated failures, silence, old success then failure,
  healthy schedules and recovery. Live PromQL validation attached: current failures
  remain active; a historical clean interval returns no firing series.
- First historical healthy assumption at08:15UTC proved incorrect: a real08:00UTC
  failure was still inwindow. Query correctly fired;08:35UTC had failure0/success2.
- Database/webhook and full regression results: see testing.md when complete.

## Release order and evidence to complete

Passing CI and squash merge; compatible migration; webhook deployment/source check;
exact historical reconciliation; normal scheduled healthy execution; alert query and
policy readback; actual recovered incident. Until recorded below, release is unfinished.
