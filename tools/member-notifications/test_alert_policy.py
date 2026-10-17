import unittest
from alert_policy import CONDITION, DOCUMENTATION, DISPLAY_NAME, QUERY, WINDOW_MINUTES


def firing(events, now):
    # Sparse DELTA samples: absence must not be mistaken for a successful check.
    recent = [result for minute, result in events if now - WINDOW_MINUTES < minute <= now]
    return 'failed' in recent or 'succeeded' not in recent


class RecoveryTests(unittest.TestCase):
    def test_persistent_failures_and_stopped_job_never_recover(self):
        for events in ([], [(0, 'failed')], [(-15, 'succeeded'), (0, 'failed')],
                       [(minute, 'failed') for minute in range(0, 121, 15)]):
            for minute in range(0, 151):
                self.assertTrue(firing(events, minute))

    def test_success_is_required_after_failure(self):
        events = [(0, 'failed'), (15, 'succeeded'), (30, 'succeeded')]
        self.assertTrue(firing(events, 29))
        self.assertFalse(firing(events, 30))
        self.assertTrue(firing(events, 60))  # silence becomes unhealthy again

    def test_healthy_schedule_and_same_bucket_failure(self):
        self.assertFalse(firing([(0, 'succeeded'), (15, 'succeeded')], 29))
        self.assertTrue(firing([(0, 'failed'), (0, 'succeeded')], 10))
        self.assertTrue(firing([(0, 'failed'), (0, 'succeeded')], 30))

    def test_alert_subject_identifies_service_without_missing_resource_labels(self):
        self.assertIn('Armature background jobs', DISPLAY_NAME)
        self.assertIn('Armature background jobs', DOCUMENTATION['subject'])
        self.assertNotIn('${', DOCUMENTATION['subject'])
        self.assertLessEqual(len(DOCUMENTATION['subject'].encode()), 255)
        for detail in ('market_worker_failed', 'market_workers', 'issue_codes',
                       'member_notifications_monitor_failed', '30-minute window'):
            self.assertIn(detail, DOCUMENTATION['content'])

    def test_query_contract(self):
        self.assertEqual(QUERY.count('[30m]'), 2)
        self.assertEqual(QUERY.count('or vector(0)'), 2)
        self.assertTrue(QUERY.endswith(') > 0'))  # zero series must be filtered out
        self.assertIn('result="failed"', QUERY)
        self.assertIn('result="succeeded"', QUERY)
        self.assertEqual(CONDITION['conditionPrometheusQueryLanguage']['evaluationInterval'], '60s')


if __name__ == '__main__':
    unittest.main()
