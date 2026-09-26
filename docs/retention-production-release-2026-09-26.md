# Managed retention production preparation — 26 September 2026

Scope: basic registration only. No paid membership, booking worker or payment activation.

## Deployed resources

- GCP project `armature-booking-integration`, region `asia-south1`.
- Cloud Run job `onboarding-retention`: one task, parallelism 1, retries 0, 210s timeout, 1 CPU / 512MiB.
- Pinned runner image `asia-south1-docker.pkg.dev/armature-booking-integration/onboarding-scanner/retention@sha256:11cbc8ecf52da09097530a61a1fb74060159cb4b5a732a26bb1ae9acc6f9a872`.
- Build `d034efee-a8f7-4f7a-ab97-f84140a87b42` succeeded. Existing `scanner-builder` identity and `armature-scanner-build-863263629225` bucket reused; no build IAM expanded. Default buckets failed source-read access and were not granted permissions.
- Dedicated runtime `onboarding-retention@armature-booking-integration.iam.gserviceaccount.com` reads only secret `onboarding-retention-job-secret`, pinned version 1.
- Dedicated `retention-scheduler` identity has `roles/run.invoker` on this job only. Schedule not yet created.
- Failed execution alert `8951864961245942589` and missed-success-15m alert `550488926212386296` target existing hello mailbox channel `9791196239003809786`, with OPENED and CLOSED notifications.

## Verification

`python3 -W error::ResourceWarning -m unittest discover -s tools/onboarding-retention`: 10 passed.

No hosted deletion or operator notification delivery claimed yet. Controlled failure `onboarding-retention-zrn5p` completed at 17:43:45Z with exit1; aggregate log `onboarding_retention_failed` reason `http_error`. Read-only unauthenticated endpoint probe first confirmed HTTP404, and the parent held function deployment through this drill. Automatic approval initially blocked potentially destructive execution; it permitted the retry after missing-function evidence established there was no callable deletion endpoint. Saved secret reference remains version1. Waiting for the onboarding schema/function/secret before synthetic expiry tests and schedule enablement. A proposed invalid literal execution-env override was rejected by Cloud Run because the saved env is secret-backed; no execution was created and the saved secret reference stayed intact.

## Release gates still pending

- Verify actual synthetic expired-object absence, deletion audit timestamp, idempotency, and unexpired survival with intake disabled.
- Observe both failure and missed-success emails and recovery, then verify real five-minute scheduler path.
- Reconcile expiry backlog separately from successful job executions.
- Provider backup retention is not proven by Storage object deletion; retain no staff-downloaded copies.
