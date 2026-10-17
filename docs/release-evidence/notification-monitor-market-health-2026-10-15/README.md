# Notification monitor repair

15 October 2026: new failed-execution alerts were generated repeatedly for the Cloud Run member-notification-monitor. The Python monitor accepted only legacy/Atlas health schemas, while the maintenance endpoint now includes marketplace health. The strict validator rejected the expanded response.

Repair accepts the third complete schema with bounded worker metadata and three validated aggregate counters, retaining malformed-response rejection and real failure alerts. All 11 Python tests passed.

Cloud Build 6c5e1709-a19e-41ea-99de-2715362919d7 succeeded. Existing job image changed to notification-monitor@sha256:9e5c324eb6009ecd8d33077f4abf2507484d5c4fdbf4e6e5209adf5799988dda in the existing asia-south1 repository. Identity, secret bindings, schedule, alert policy and cleanup controls unchanged.

The natural 07:30 UTC / 13:00 IST run logged member_notifications_checked at 07:30:14.510534Z, attention=false, dry_run=true, all membership/Atlas/marketplace actionable counters zero, and exit(0) at 07:30:14.554275Z. This verifies scheduled execution after the repair; no extra maintenance probe or email resend was performed. Existing failure incidents can resolve after their metric window clears.

A direct secret-backed maintenance probe was blocked by automatic review and was not executed. Verification used the existing natural schedule and aggregate Cloud Run logs instead.
