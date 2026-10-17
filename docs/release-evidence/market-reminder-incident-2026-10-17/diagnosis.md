# Marketplace reminder incident — 17 October 2026, afternoon

## Confirmed findings

This is a different failing component from the morning Auth-confirmation receipt classifier. The latest screenshot reported the combined monitor policy at 15:35 IST / 10:05 UTC.

- Cloud Run execution `member-notification-monitor-rkntm`, created 10:00:12 UTC, failed at 10:00:23 UTC. Its aggregate log at 10:00:21 UTC had `market_worker_failed=1`, `attention=true`, and all other actionable counts zero, including `unmatched_receipts=0`.
- Supabase API Gateway log `961297db-0e3d-4c52-9e47-33289af0ea80`: POST `/rest/v1/rpc/market_process_reminders` returned HTTP 401 at 15:30:01 IST. User agent identifies the Supabase Edge runtime. Only status/path/timing were inspected; no credential values were extracted.
- pg_net response 4876, created 10:00:00.263388 UTC: HTTP 503, symbolic body error `workflow_reminders_failed`, no transport error and no timeout. The reminder worker maps any error from its initial database RPC to this generic response.
- Subsequent normal requests at 10:05 UTC (request 4877) and 10:10 UTC (request 4880) returned HTTP 200. At 10:10:26 UTC the reminder health row recorded status 200 and response_failed=false. The daily file-cleanup worker also remained healthy.
- The shared monitor had succeeded throughout the preceding listed executions from 07:15 through 09:45 UTC. The query at 10:11 UTC correctly remained firing with one recent failed sample and one prior successful sample. The next scheduled monitor check is 10:15 UTC / 15:45 IST; this was not yet observed in this investigation.

## Boundaries and uncertainty

No production state, worker, alert policy, email, or recipient was changed. Database inspection used read-only transactions and direct status tables. `public.market_worker_health()` performs updates and was deliberately not invoked for diagnosis. No worker was manually triggered.

The exact reason for HTTP 401 is not retained by this worker. PostgREST's last-hour error view returned no results. Do not label this PGRST303, an expired key, clock skew or a provider outage without evidence. The known earlier membership sender mitigation only retries an exact initial-claim 401/PGRST303 signature; the marketplace worker has no equivalent diagnostic/retry handling.

The email subject's `__missing__` comes from a summed PromQL result without resource labels. It is not evidence that the database or project is missing. The existing generic policy name obscures that this monitor also checks marketplace workers.

## Recommended focused follow-up

1. Add bounded, non-secret diagnostic status/error codes for the marketplace worker's initial RPC; never log tokens, request bodies, member details or raw provider responses.
2. Reuse a single bounded retry only for a confirmed pre-execution authentication rejection, with tests proving later mutations and ambiguous provider sends are not retried.
3. Give the combined alert a descriptive title and runbook linking each actionable counter to its worker. Preserve genuine failure detection and successful-check recovery requirements.
4. Observe the normal scheduled monitor recovery. Alert closure should follow the clean 30-minute metric window and Google evaluation delay, not a manual close.

## Reproducible read-only commands

- `gcloud run jobs executions list --job=member-notification-monitor --project=armature-booking-integration --region=asia-south1 --limit=12`
- `gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="member-notification-monitor" AND labels."run.googleapis.com/execution_name"="member-notification-monitor-rkntm"' --project=armature-booking-integration --limit=20`
- Read `private.market_worker_health` joined to `cron.job` and `net._http_response` for job, status and timing only. Do not read request headers or Vault.
- Temporary SQL files: `/private/tmp/armature-afternoon-worker-current.sql`, `/private/tmp/armature-afternoon-http.sql`.
