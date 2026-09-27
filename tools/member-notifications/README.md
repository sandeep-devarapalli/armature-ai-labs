# Notification operations — prepared, not deployed

The owner approved 30-day notification history and unmatched-webhook retention on 27 September 2026. This is separate from verification-document retention. No job, alert, secret, provider webhook or delivery activation is created by these files.

## Policy

- Remove completed send history 30 days after completion. An accepted send is complete only with a terminal delivery outcome: delivered, failed, bounced, complained or provider-suppressed. Remove never-released held events after 30 days from creation; they never become a sendable backlog.
- Retain unknown outcomes and accepted messages without a terminal receipt for reconciliation; alert after 24 hours for unconfirmed acceptance. Do not erase or resend an ambiguous outcome automatically.
- Remove receipts after 30 days from receipt time when they have no remaining active notification. Keep receipts attached to unresolved records until resolved. An old event received again starts a new receipt window.
- Retain blocked-address records. Minimal deduplication markers retain event identity, account UUID, event kind/template version, provider ID and SHA-256 address digest, until either linked account is deleted. These are **pseudonymous metadata, not anonymous data**. They prevent replay of archived events and preserve late-complaint suppression without retaining the original address in history. They do not contain names, message bodies, IDs, reasons or document links.
- Each execution handles at most 100 eligible history records and 100 receipt records. Busy records are skipped for a later run. No notifications are sent by maintenance.

## Three independent cleanup gates

1. Endpoint `MEMBER_NOTIFICATIONS_MAINTENANCE_ENABLED` must equal `true`; default disabled.
2. `MEMBER_NOTIFICATIONS_CLEANUP_APPLY` must equal `true`; otherwise dry run.
3. `member_notification_settings.cleanup_enabled` must be true; default false. The database rejects mutation otherwise.

Use a separate random `MEMBER_NOTIFICATIONS_MAINTENANCE_SECRET` (32–256 characters) in the caller and endpoint secrets. Do not reuse the sender credential or auth SMTP key. Store it in the deployment secret manager; never source, logs or chat. The endpoint accepts authenticated POST **without a request body**. Requests cannot select an endpoint, recipient, batch size or cleanup mode.

The monitor's fixed endpoint is the notification-maintenance Edge Function in the existing Supabase project. `python3 tools/member-notifications/monitor.py` makes one request, bounds its response, validates only aggregate fields and stops after 45 seconds. Unit tests mock HTTP. Do not run it against production until the endpoint and operating gates are reviewed and released.

## Monitoring design for the controlled pilot

Proposed cadence: one run every 15 minutes, one task at a time, maximum 60-second task timeout and no automatic provider-send retries from this job. Start in dry run; inspect counts before enabling cleanup. This cadence is preparation only; no scheduler exists yet.

| Signal | Threshold / action |
|---|---|
| Monitor execution failure | Nonzero exit; inspect job/HTTP/configuration failure |
| Pending send overdue | Available for more than 15 minutes; inspect sender, do not send manually |
| Expired send lease | Lease elapsed; inspect bounded retry worker |
| Unknown outcome | Any; reconcile with provider using protected service tooling, never blindly resend |
| Failed send | Any; investigate recipient/provider failure |
| Unconfirmed delivery | Accepted more than 24 hours ago with no terminal receipt |
| Unmatched receipt | Received more than one hour ago and no active or archived provider match |
| Cleanup overdue | Cleanup enabled but no successful run in 26 hours |
| Cleanup backlog | Mutating batch leaves eligible work; continue next scheduled run and investigate sustained growth |

Held messages and dry-run deletion candidates alone do not trigger an incident. `member_notification_health()` exposes aggregate counts only, available to the service worker and current Admin/Super admin accounts. The runner emits `member_notifications_checked` (INFO/WARNING) or `member_notifications_monitor_failed` (ERROR), with no addresses or secrets. Warning conditions exit nonzero so a future job execution alert can detect them.

Before provisioning, connect a verified alert destination, configure incident opening/resolution rather than repeated identical messages, and test a synthetic failure plus missing-success condition (45 minutes for the proposed cadence). Endpoint logs alone cannot detect a job that never runs. Verify an actual alert receipt before calling monitoring operational. Existing scanner and document-retention jobs are separate and unchanged.

## Release checklist

- Review stacked PRs and complete CI. Validate Deno/hosted runtime and authenticated dry-run response.
- Confirm minimal-marker exception, unresolved-record handling, cadence and chosen alert destination in the release review.
- Provision the separate secret and a paused job. Configure alerts disabled first; verify their selectors and permissions.
- Exercise synthetic missed-run, failed-request, warning, healthy and recovery cases; record actual alert delivery.
- Inspect dry-run counts, then enable cleanup gates only after explicit production authorization.
- Pilot recipients, notification sending, provider webhooks and inbox/reply verification still require their own activation steps. No pilot participants have been selected.

## Local checks

`npm test` executes maintenance-handler tests using the real job-secret helper and mocked database calls. `python3 -m unittest discover -s tools/member-notifications -v` checks the runner without network access. Migration 011 and SQL test 019 run only against the isolated local database during preparation. `supabase/tests/concurrent_notification_operations.sh` proves cleanup races, and CI includes all three notification concurrency scripts.
