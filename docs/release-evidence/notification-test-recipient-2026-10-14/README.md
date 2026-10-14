# Synthetic notification incident — 14 October 2026

Cloud Run executions began reporting failure at 16:15 IST. The 22:30 run reported `member_notifications_checked`, `attention: true`, `unmatched_receipts: 4`; every other actionable count was zero. The apparent recovery emails reflect the failure metric leaving the alert window, not successful subsequent execution.

Resend and the database matched one synthetic photo-release registration message: one sent report and three delivery-delay reports. The release check created a confirmed account with a reserved `.test` address; automatic registration mail reached the provider, and later account cleanup removed its outbox correlation. No customer delivery failure was identified. Exact provider evidence and recipient hash are retained privately in the database, not in this public report.

## Repair

- Block reserved destinations before preparation or external delivery. Validate the active lease in a service-only RPC; never-attempted records become suppressed, while earlier ambiguous attempts remain unknown and actionable.
- Retain raw receipt records. A database-operator-only resolution records exact provider identity, reserved recipient domain/hash, subject, reviewer, time and evidence. Only positively resolved synthetic providers are excluded from unmatched alerts.
- Preserve alert policy, schedules, real-recipient sending, payment gates and all other health counters.

## Validation

- 86 sender tests passed, including zero provider calls for reserved destinations and normal-domain false positives.
- 25 isolated database checks passed: permissions, lease/state protection, exact-provider resolution, raw receipt retention and real failures still actionable.
- Existing auth receipt regression: 43 checks passed. Independent review found no blockers.
- Migration004 applied atomically with migration history; sender deployed and downloaded source exactly matched the checked source.
- Exact synthetic provider resolved privately: four raw receipts retained, one audit record, all actionable health counters zero.
- Scheduled Cloud Run execution `member-notification-monitor-6fc4q` at 22:45 IST completed successfully with exit code0. No manual worker execution or email resend.
