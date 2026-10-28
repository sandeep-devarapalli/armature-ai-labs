# Managed onboarding cleanup

Cloud Run job and five-minute schedule deployed on 26 September 2026 after hosted
synthetic deletion and idempotency checks passed. Operator failure, missed-success and recovery emails were
verified in the hello inbox. See `docs/retention-production-release-2026-09-26.md` for
resource identifiers, pinned image and verification evidence. Intake remains gated.

The runner calls only the fixed onboarding-retention endpoint. Inject
ONBOARDING_RETENTION_JOB_SECRET from its own Secret Manager secret and configure
the same dedicated value in Supabase. There is no booking-credential fallback.
The runtime needs access only to this secret; it needs no database, scanner,
Gmail, or service-account key permissions. Keep secret values out of shell arguments.

Deploy the reviewed onboarding migration subset with intake disabled before
installing the function. Keep ONBOARDING_RETENTION_ENABLED independent from
ONBOARDING_ENABLED and the database/frontend intake gates.

Build this directory; deploy a pinned image as a Mumbai Cloud Run job with one
task, parallelism1, retries0, timeout210seconds, 1CPU/512MiB. Use a dedicated
scheduler identity with invoke permission on this job only. Schedule every five
minutes. Do not enable the schedule before a synthetic hosted deletion succeeds.

Alert hello@armatureailabs.com on failed executions and no successful execution
for15minutes. Verify both notification deliveries, restore the job after a
controlled failure, then verify scheduled recovery. Use the existing scanner
monitoring patterns with the retention job's exact resource filters.

The runner bounds a run to180seconds and10batches of100. An empty claim does not
prove an empty backlog: failed claims have a five-minute lease. Successful-run
metrics are execution health, not a deletion-SLA proof. Reconcile aggregate
expired-object counts separately; never log document paths or personal data.

Before real intake, prove physical deletion and deletion timestamps using
synthetic expired objects while intake is off; repeat for idempotency and confirm
unexpired objects survive. Provider backups and staff-downloaded copies require
separate procedures. Do not describe object deletion as erasure of all copies.

Tests: python3 -W error::ResourceWarning -m unittest discover -s tools/onboarding-retention

HTTP failure logs include the numeric status code, but never response bodies,
URLs or exception messages. The sole retryable error is HTTP503 with the exact
`sb-error-code: SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED` header: Supabase rejected
the request before function execution. Allow at most two retries across the whole
run with 2s/4s backoff inside the existing 180s deadline. Log only that recognized
constant, HTTP status and retry number. Exhaustion remains a failed execution.

Do not retry generic gateway/network errors or application/deletion failures:
the function may already have claimed documents whose five-minute leases hide
them from an immediate retry. Confirm recovery using natural scheduled successes
and aggregate overdue-document/cleanup-queue counts.

The 28 October 2026 alert was a 503 platform rejection in 11ms, with no function,
execution or deployment IDs. Its recorded `sb_error_code` matches this recovery
path. Supabase documents the code as its runtime health check rejecting incoming
connections: https://status.supabase.com/incidents/f258dnpx3ss2 . This handles the
identified provider failure; it does not repair the provider infrastructure or
establish the cause of separately recorded network failures.
