# Basic onboarding notice acceptance

## Launch revision

The current notice is `2026-09-26-release-1`, introduced by additive migration
`202609260005_onboarding_launch_notice.sql`. Apply it after002/003/004. The original
`2026-09-26` rows remain valid historical evidence; the migration neither rewrites
their text/version nor backfills consent. New submissions, corrections, reservation,
finalization and review require current-revision launch acceptance. Applicants with
only the older notice must receive a correction request and explicitly resubmit.
The Edge upload guard and frontend constant use the same version. No paid access
is activated. The privacy page describes the actual provider roles, guardian mailbox,
portal-only staff rule and separate retention of non-image records. No automatic
deletion duration has been adopted for those other records; this is stated rather
than inventing a retention promise. Provider-wide erasure is not claimed.

## Original notice history

26 September 2026 — additive migration `202609260004_onboarding_notice.sql`.

The public `submit_basic_onboarding` and `resubmit_basic_onboarding` RPCs now require a fifth argument, `p_notice_version`, with the exact value `2026-09-26`. There is no default and the old four-argument public signatures no longer exist. Send this value only after the applicant explicitly accepts the displayed privacy notice; render an unchecked required control linked to `/privacy`. Do not insert acceptance on behalf of existing applicants.

Successful submission/resubmission atomically creates `onboarding_notice_acceptances(user_id, revision, notice_version, accepted_at)`. The authenticated user and resulting application revision come from the server; `accepted_at` is server time. Owners and admin/super-admin reviewers can read the record through RLS. Authenticated users and the service role cannot insert, update or delete acceptance rows directly. The service role has read access only. Prior acceptance remains when corrections advance the revision.

Reservation, finalization and review require acceptance of the current version for the application's current revision. Their public RPC arguments are unchanged. They lock the application before checking, so a concurrent correction/resubmission cannot change revision between the check and operation. Private implementation functions are not executable by anon, authenticated or service roles. Existing records without acceptance are not backfilled: staff may request corrections and the owner must resubmit with explicit acceptance. Neither acceptance nor basic approval grants paid access.

The document Edge Function must also check current-revision acceptance **before** scanning or writing Storage bytes. Finalization rejects an unaccepted upload, but does not itself prevent a service-role caller from writing bytes beforehand.

Verification: local synthetic database only; migration applied atomically using `docker exec -i supabase_db_armature-onboarding-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/202609260004_onboarding_notice.sql`. No reset or production migration. Tests `012_basic_onboarding.sql`, `013_onboarding_corrections.sql` and `014_onboarding_notice.sql` passed 32, 29 and 23 assertions. Each ran in its own rollback transaction; the runner loaded pgTAP and temporarily set the gate false inside that transaction, preserving the running review fixtures/gate. Initial test invocation lacked pgTAP; loading it inside each transaction fixed the test harness. Logs are `/private/tmp/armature-onboarding-local/012_basic_onboarding-notice.log`, `013_onboarding_corrections-notice.log` and `014_onboarding_notice-notice.log`.

The direct local SQL application does not add a Supabase migration-history record; account for that before invoking CLI migration-up on this existing local stack. New/fresh databases apply the migration normally. No real personal data was used.
