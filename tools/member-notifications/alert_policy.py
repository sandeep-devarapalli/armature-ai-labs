"""Recovery requires observed success and a clean execution window."""
WINDOW_MINUTES = 30
SELECTOR = ('"run.googleapis.com/job/completed_execution_count",'
            'monitored_resource="cloud_run_job",project_id="armature-booking-integration",'
            'location="asia-south1",job_name="member-notification-monitor"')


def count(result):
    return f'(sum(sum_over_time({{{SELECTOR},result="{result}"}}[{WINDOW_MINUTES}m])) or vector(0))'


QUERY = f'(({count("failed")} > bool 0) + ({count("succeeded")} == bool 0)) > 0'
CONDITION = {
    'displayName': 'Failed check or no successful check in 30 minutes',
    'conditionPrometheusQueryLanguage': {
        'query': QUERY, 'duration': '0s', 'evaluationInterval': '60s',
    },
}

DISPLAY_NAME = 'Armature background jobs - notification health'
DOCUMENTATION = {
    'subject': 'Armature background jobs: notification health check',
    'mimeType': 'text/markdown',
    'content': """The shared `member-notification-monitor` checks membership email, Builder Atlas
email and marketplace background jobs in `armature-booking-integration / asia-south1`.
This alert does not by itself mean the website or Supabase database is unavailable.

Open the latest Cloud Run execution logs for `member-notification-monitor`:
- `member_notifications_checked`: inspect `issue_codes` and nonzero counters.
- `market_worker_failed` / `market_worker_stale`: inspect `market_workers` for the
  exact job, HTTP status and requested/checked times. A missing HTTP status is not
  a successful request. `market-message-reminders-every-five-minutes` runs the
  marketplace reminder worker; `market-private-file-cleanup-daily` handles private
  file cleanup. Inspect that worker's bounded error diagnostics before retrying.
- `market_cleanup_backlog`: inspect pending marketplace file cleanup.
- `atlas_*`: inspect Builder Atlas notification processing and delivery reports.
- Other delivery/queue counters: inspect membership/auth email processing.
- `cleanup_overdue` / `cleanup_backlog`: inspect notification retention gates.
- `member_notifications_monitor_failed`: inspect its safe `error_code`; check
  configuration, endpoint availability or response schema. It is not proof of an
  email delivery failure.

Recovery requires at least one successful check and no failed executions in the
same 30-minute window. Metric ingestion and incident evaluation can add delay.
Missing telemetry remains unhealthy. Do not clear an incident by resending an
ambiguous message, deleting reports or disabling detection. Cleanup and payment
activation are separate approvals; this alert does not authorize either.""",
}
