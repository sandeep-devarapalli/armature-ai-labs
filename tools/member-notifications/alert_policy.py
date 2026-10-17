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
