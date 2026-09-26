# Managed retention production preparation — 26 September 2026

Scope: basic registration only. No paid membership, booking worker or payment activation.

## Deployed resources

- GCP project `armature-booking-integration`, region `asia-south1`.
- Cloud Run job `onboarding-retention`: one task, parallelism 1, retries 0, 210s timeout, 1 CPU / 512MiB.
- Pinned runner image `asia-south1-docker.pkg.dev/armature-booking-integration/onboarding-scanner/retention@sha256:11cbc8ecf52da09097530a61a1fb74060159cb4b5a732a26bb1ae9acc6f9a872`.
- Build `d034efee-a8f7-4f7a-ab97-f84140a87b42` succeeded. Existing `scanner-builder` identity and `armature-scanner-build-863263629225` bucket reused; no build IAM expanded. Default buckets failed source-read access and were not granted permissions.
- Dedicated runtime `onboarding-retention@armature-booking-integration.iam.gserviceaccount.com` reads only secret `onboarding-retention-job-secret`, pinned version 1.
- Dedicated `retention-scheduler` identity has `roles/run.invoker` on this job only. Cloud Scheduler `onboarding-retention-every-five-minutes` enabled after synthetic proof, cron `*/5 * * * *`, Asia/Kolkata. Uses OAuth to the fixed Cloud Run job run endpoint; no retry attempts.
- Failed execution alert `8951864961245942589` and missed-success-15m alert `550488926212386296` target existing hello mailbox channel `9791196239003809786`, with OPENED and CLOSED notifications.

## Verification

`python3 -W error::ResourceWarning -m unittest discover -s tools/onboarding-retention`: 10 passed.

No hosted deletion or operator notification delivery claimed yet. Controlled failure `onboarding-retention-zrn5p` completed at 17:43:45Z with exit1; aggregate log `onboarding_retention_failed` reason `http_error`. Read-only unauthenticated endpoint probe first confirmed HTTP404, and the parent held function deployment through this drill. Automatic approval initially blocked potentially destructive execution; it permitted the retry after missing-function evidence established there was no callable deletion endpoint. Saved secret reference remains version1. Waiting for the onboarding schema/function/secret before synthetic expiry tests and schedule enablement. A proposed invalid literal execution-env override was rejected by Cloud Run because the saved env is secret-backed; no execution was created and the saved secret reference stayed intact.

## Release gates still pending

- Hosted synthetic expiry/marker/idempotency/unexpired-survival checks passed, as detailed below.
- Observe both failure and missed-success emails and recovery, then verify real five-minute scheduler path.
- Reconcile expiry backlog separately from successful job executions.
- Provider backup retention is not proven by Storage object deletion; retain no staff-downloaded copies.

## Hosted deletion and idempotency proof

Independent live inventory read before execution established exactly two document rows, both owned by a synthetic `@example.test` user and matching the private fixture. Intake remained disabled. Both objects existed; only the sample photo was expired. No real member documents were present.

- `onboarding-retention-p4kfd` succeeded: examined1 / deleted1 / failed0 at17:46:45Z.
- Expired object is absent from the authoritative Storage list, unique cache-busted authenticated read returns400, and `deleted_at` is populated.
- Unexpired sample ID remains in Storage and returns200; deletion marker remainsnull.
- `onboarding-retention-wmnb5` succeeded: examined0 / deleted0 / failed0 at17:47:24Z, proving idempotency.
- Important limitation: a previously requested exact authenticated Storage URL briefly returned cached prior bytes after deletion. A cached200 is not evidence the origin object survives. Public document access must keep expiry checks and no-store responses; origin deletion does not prove immediate erasure from all caches/backups.
- The five-minute schedule was enabled only after these checks, then triggered through the real Scheduler identity for IAM-path verification.

The private fixture remains outside Git for final evidence and cleanup. No personal ID was used or logged.

## Operator notification evidence

Parent agent inspected the actual hello Google Workspace inbox in native Chrome: missed-success notification delivered23:14IST; failed-execution notification delivered23:18IST. Recovery emails not yet observed at this checkpoint. Both policies explicitly request OPENED and CLOSED notifications.

Scheduler-triggered execution `onboarding-retention-2spcv` completed successfully17:48:53Z. This verifies the deployed scheduler identity can invoke the bounded job; it is separate from a natural clock-triggered run.
