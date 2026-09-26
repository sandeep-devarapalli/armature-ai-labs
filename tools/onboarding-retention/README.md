# Managed onboarding cleanup

Prepared, not deployed. Production inventory on 26 September 2026 contained only
202607260001–012 and202609020001; onboarding schema is not yet installed.

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
