# Notification confirmation repair: local verification

Date: 17 October 2026. Checkout: `/private/tmp/armature-auth-alert-recovery`.
No production database access, emails, provider resends or delivery-report deletions were used for these tests.

## JavaScript and webhook checks

- Node 22.22.2: `/private/tmp/node-v22.22.2-darwin-arm64/bin/node`.
- Command: `PATH=/private/tmp/node-v22.22.2-darwin-arm64/bin:$PATH npm test -- tests/frontend/member-notification-events.test.js --maxWorkers=2`.
- Result: **58 tests passed**, 1 file, 1.23 seconds.
- Both exact Auth subjects are exercised across all three allowed sender formats. Tests verify actual synthetic HMAC signatures, reject tampering, require the signed Armature project marker, keep unknown sender/subject reports unclassified and propagate persistence failures for provider retry.
- Root full-suite command: `npm test -- --maxWorkers=2`, run via Node 22.23.3/npm 10.
- Full-suite result: **775 tests passed across 68 files**, 37.30 seconds. Raw output: `/private/tmp/armature-auth-alert-tests.log`.

## Database checks

First ran `node scripts/test-network-migration-replay.mjs`. It creates a fresh database from the local Supabase image, copies only platform schema, disables cron execution and uses Docker `network:none`.

- **70 immutable migrations replayed successfully**, including `202610170001_auth_confirmation_receipts.sql`.
- **19 existing network/marketplace/notification suites passed**.
- Evidence: `/private/tmp/armature-network-replay-1792212740007/result.json` and `replay.log`.

The expanded database tests initially exposed missing test-harness setup: Vault needs the installed `pgsodium` library preloaded, while the full suite needs the committed synthetic `supabase/seed.sql`. A second disposable container supplied both. No existing application container was restarted.

- Disposable container: `armature-network-replay-1792212882899`.
- Image: `public.ecr.aws/supabase/postgres:15.8.1.085`.
- Network: `none`; cron execution disabled.
- Local replay driver: `/private/tmp/armature-notification-full-replay.mjs` (the existing replay script with `pgsodium` added to preload and the full database-test directory selected).
- Replayed all 70 migrations, then applied `supabase/seed.sql` and ran each SQL file in `supabase/tests/database` through `psql -v ON_ERROR_STOP=1`, treating any pgTAP `not ok` result as failure.
- **32 of 36 full database suites passed**. See baseline caveats below; this is not an all-green full database result.
- Raw evidence: `/private/tmp/armature-network-replay-1792212882899/database-regressions.log` and `seed.log`.

| Relevant suite | Passed assertions |
|---|---:|
| 017 member notifications | 57 |
| 018 delivery | 56 |
| 019 operations | 32 |
| 026 general notifications | 15 |
| 027 immediate wakeup | 13 |
| 031 Atlas wakeup | 13 |
| 034 Atlas delivery | 54 |
| 035 Auth receipt classification | 56 |
| 036 synthetic notification resolution | 25 |

The Auth suite adds confirmation-specific sent-first/delivered-first ordering, duplicate receipt handling, evidence preservation, wrong sender/subject, conflicting event IDs, sent without delivery and negative outcomes before/after delivery. Existing sign-in, member/Atlas ownership, privacy/privilege and reconciliation guards also pass. Failed, bounced, complained and suppressed confirmation events remain actionable even when a delivered event exists.

## Baseline caveats

Seven assertions fail in four unrelated suites in this synthetic environment:

- `003_service_boundaries.sql`: one maintenance-execution privilege assertion.
- `004_operations_controls.sql`: two anonymous RPC execution privilege assertions.
- `005_component_inventory.sql`: two request-RPC privilege assertions and one inventory access error-message assertion.
- `016_member_avatars.sql`: one direct deletion permission assertion.

Each failing suite was rerun with the **prior classifier function and prior one-subject table constraint restored inside a rolled-back transaction**. The same seven failures remain. Therefore they were not introduced by this repair. This comparison does not establish whether their underlying baseline issue is stale test expectations, platform-harness grants or a separate application defect; investigate separately without describing the full database suite as passed.

Baseline output: `/private/tmp/armature-network-replay-1792212882899/baseline-failures.log`.

## Remaining release verification

Apply the compatible migration before deploying the webhook. Historical reconciliation must use exact verified provider metadata with `operator_verified` evidence; it must not fabricate signed-webhook evidence. Confirm live unknown-receipt counts and genuine negative-outcome handling, then verify a real scheduled successful monitor execution and the revised recovery policy. Local tests alone do not establish production recovery.
