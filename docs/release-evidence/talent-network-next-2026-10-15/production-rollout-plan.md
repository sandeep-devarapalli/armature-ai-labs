# Production rollout preparation — 15 October 2026

Read-only preflight confirmed project `uxfhdfagrmaeyuaipaar`: 8,025 directory profiles, four auth accounts, no marketplace tables/functions/jobs, no market Edge Functions or dedicated market wakeup secrets. `supabase_realtime` publication exists; the inbox table is not yet present. `armature.local_market_simulator` is unset. Vault, pg_net and pg_cron exist.

## Migration ledger caveat

Recent ledger entries: 202610130001, 202610130002, 202610140002, 202610140003, 202610140004. Admin editing, claim declarations, profile photos and government-ID retention schema exist despite their migration versions not being in the ledger. Earlier release artifacts used explicit SQL transactions and explicit `supabase_migrations.schema_migrations` inserts through Management API. Do not run an unrestricted `db push`: it would attempt existing schema again. Reconcile unrelated ledger gaps separately after definition comparison; this release does not replay them.

Apply only, in this order:

1. 202610130005_market_projects.sql
2. 202610130006_market_messages.sql
3. 202610130007_market_message_delivery.sql
4. 202610150001_talent_portfolio.sql
5. 202610150002_market_message_readiness.sql
6. 202610150003_market_operations.sql
7. 202610150004_market_authorization.sql
8. 202610150005_market_conversation_labels.sql
9. 202610150006_market_wakeups.sql

Prepared transaction: `/private/tmp/network-rollout/migrations.sql`; source hashes: adjacent `migration-manifest.json`. Recreate if any source changes. It guards against an already-present/partially applied marketplace, applies all nine atomically, records exact source statements, reloads PostgREST and commits. Wakeup migration's inner transaction is removed only in this combined artifact; its schedules remain disabled at commit.

## Reviewed execution mechanism

The CLI is authenticated and its Management API read worked. Existing linked workdir is `/private/tmp/armature-guided-profile` (project ref verified). Commands below are a plan; production mutations have not been executed by this review.

```sh
supabase db query --linked --workdir /private/tmp/armature-guided-profile --file /private/tmp/network-rollout/migrations.sql -o json
supabase functions deploy market-message-files market-message-reminders market-message-maintenance --project-ref uxfhdfagrmaeyuaipaar --no-verify-jwt --use-api
supabase functions list --project-ref uxfhdfagrmaeyuaipaar -o json
```

Deploy exactly the three functions; never omit their names or use prune. Their internal authentication is mandatory: files validate the user's Auth token and participant RPC; workers validate purpose-bound HMAC or the legacy job secret. `verify_jwt=false` allows dedicated HMAC jobs and does not grant anonymous data access.

Set secrets through a mode-0600 env file outside the repository, then remove that temporary file. Do not print values or put secrets in command arguments:

```sh
supabase secrets set --project-ref uxfhdfagrmaeyuaipaar --env-file /private/tmp/market-release-private.env
```

Required configuration:

- `MARKET_FILES_ENABLED`: keep false until deployed scanner/readback succeeds, then true.
- `MARKET_FILE_SCANNER_URL`, `MARKET_FILE_SCANNER_SECRET`, `MARKET_FILE_SCANNER_GOOGLE_CREDENTIALS_JSON` (existing `ONBOARDING_SCANNER_GOOGLE_CREDENTIALS_JSON` is a supported fallback). Scanner IAM must grant only the service identity.
- `MARKET_MESSAGE_EMAIL_ENABLED`: initially false; true only after scoped verification. Existing `MEMBER_NOTIFICATIONS_RESEND_KEY` supplies delivery; sender is fixed in source.
- `MARKET_MESSAGE_WAKEUP_KEY` matching Vault `market_message_wakeup_key`.
- `MARKET_FILE_CLEANUP_WAKEUP_KEY` matching Vault `market_file_cleanup_wakeup_key`.
- `MARKET_FILE_CLEANUP_ENABLED`: initially false, then true after retention verification.
- Legacy `MARKET_MESSAGE_JOB_SECRET` and `MARKET_FILE_CLEANUP_SECRET` are optional when HMAC is configured. Never put them in pg_net headers.

Provision distinct random signing keys in Vault and matching Edge environment without returning values in SQL output. Wake jobs contain only a 30-second timestamp/signature and empty body. Five-minute reminder job: `market-message-reminders-every-five-minutes`; daily cleanup: `market-private-file-cleanup-daily` at `23 2 * * *` (cron timezone must be checked). Activate the exact jobs only after one signed wake returns expected results and saved settings are verified. Keep simulator unset and real payments disabled.

Frontend production uses existing main-branch GitHub workflow: tests/build, explicit Cloudflare `armature-lab` deploy and live release checks. Deploy backend first so new frontend routes do not meet missing RPCs. No synthetic directory profiles should be published.

## Actual hosted Realtime verification design

Run only after authorization to mutate disposable fixtures:

1. Create three disposable confirmed Auth accounts with unique reserved `.test` addresses via Auth admin API; sign in with real password grants. Do not send signup emails, create directory rows, or approve real identities.
2. Insert one isolated private active conversation for accounts A and B through an exact, scoped setup transaction. C is unrelated. Record generated fixture IDs privately. Keep messages younger than 15 minutes and email sending disabled for the test.
3. Use Supabase JS clients with each real access token and WebSocket Realtime subscriptions to `public.market_inbox_events`. B subscribes to its own recipient filter; C attempts B's filter and its own filter. Wait for `SUBSCRIBED` before triggering an event.
4. A sends one synthetic message through `market_send_message`. Require B to receive the matching conversation's INSERT/UPDATE; require C to receive no event in a bounded window. A's own event is the delivery control. REST/RLS reads alone do not satisfy this check.
5. Ban B through Auth admin API but retain B's pre-ban JWT/subscription. Trigger a new A message. Require A's event as the positive control and no event to B or C. Also confirm B's RPC access is denied. This tests authorization against current account state, not just token expiry.
6. Unsubscribe and close sockets; delete only exact fixture messages, read positions, inbox events, conversations and reminder rows in dependency order, then delete the exact disposable Auth accounts. No wildcard cleanup. Reconcile 8,025 profiles/four original accounts and empty fixture IDs afterward.

If WebSocket delivery cannot be established, report it unverified; successful table RLS and polling are insufficient. Keep identities, access tokens and credentials out of logs. Store only case outcomes, status events, counts and opaque fixture IDs in the evidence report.
