import copy
import io
import json
import unittest
from unittest.mock import patch
import monitor

BASE = {'attention': False, 'cleanup': {'dry_run': True, 'history': 0, 'receipts': 0, 'remaining': False}, 'health': {**{k: 0 for k in monitor.COUNTS}, 'sending_enabled': False, 'cleanup_enabled': False, 'last_cleanup_at': None, 'cleanup_overdue': False}}


class Response(io.BytesIO):
    status = 200
    def geturl(self):
        return monitor.ENDPOINT


class Tests(unittest.TestCase):
    def run_check(self, result):
        response = Response(json.dumps(result).encode())
        with patch('monitor.build_opener') as opener:
            opener.return_value.open.return_value = response
            value = monitor.check('x' * 32)
            request = opener.return_value.open.call_args.args[0]
            self.assertIsNone(request.data)
            self.assertEqual(request.full_url, monitor.ENDPOINT)
            return value

    def test_healthy_dry_run(self):
        result = self.run_check(BASE)
        self.assertFalse(result['attention'])
        self.assertEqual(result['issue_codes'], [])

    def test_exact_legacy_schema_is_accepted_during_rollout(self):
        data = copy.deepcopy(BASE)
        for key in monitor.ATLAS_COUNTS:
            del data['health'][key]
        self.assertFalse(self.run_check(data)['attention'])
        data['health']['unmatched_receipts'] = 1
        data['attention'] = True
        self.assertTrue(self.run_check(data)['attention'])

    def test_partial_atlas_schema_is_rejected(self):
        for key in monitor.ATLAS_COUNTS:
            with self.subTest(key=key):
                data = copy.deepcopy(BASE)
                del data['health'][key]
                with self.assertRaisesRegex(ValueError, 'invalid_health'):
                    self.run_check(data)

    def test_each_actionable_signal(self):
        for key in monitor.COUNTS - {'held', 'history_due'}:
            with self.subTest(key=key):
                data = copy.deepcopy(BASE)
                data['health'][key] = 1
                data['attention'] = True
                self.assertTrue(self.run_check(data)['attention'])

    def test_held_and_dry_run_due_do_not_alert(self):
        data = copy.deepcopy(BASE)
        data['health']['held'] = 100
        data['health']['history_due'] = 100
        self.assertFalse(self.run_check(data)['attention'])

    def test_bad_schema_counts_and_attention(self):
        cases = []
        for key in monitor.COUNTS:
            for value in (-1, True, '1', None, 0.5):
                data = copy.deepcopy(BASE)
                data['health'][key] = value
                cases.append(data)
        data = copy.deepcopy(BASE)
        data['health']['recipient'] = 'do-not-log@example.test'
        cases.append(data)
        data = copy.deepcopy(BASE)
        data['attention'] = True
        cases.append(data)
        for data in cases:
            with self.assertRaises(ValueError):
                self.run_check(data)

    def market_result(self):
        data = copy.deepcopy(BASE)
        data['health'].update({k: 0 for k in monitor.MARKET_COUNTS})
        data['health']['market_workers'] = [dict(job=job, active=True, requested_at='2026-10-15T07:00:00+00:00', status=200, checked_at=None) for job in sorted(monitor.MARKET_JOBS)]
        return data

    def test_market_health_and_each_actionable_counter(self):
        self.assertFalse(self.run_check(self.market_result())['attention'])
        for key in monitor.MARKET_COUNTS:
            data = self.market_result()
            data['health'][key] = 1
            data['attention'] = True
            result = self.run_check(data)
            self.assertTrue(result['attention'])
            self.assertEqual(result['market_workers'], data['health']['market_workers'])
            self.assertEqual(result['issue_codes'], [key])

    def test_worker_failure_identifies_exact_job_without_extra_fields(self):
        data = self.market_result()
        data['health']['market_workers'][0]['status'] = 401
        data['health']['market_worker_failed'] = 1
        data['attention'] = True
        result = self.run_check(data)
        self.assertEqual(result['issue_codes'], ['market_worker_failed'])
        self.assertEqual(result['market_workers'][0]['status'], 401)
        self.assertEqual(result['market_workers'][0]['job'], sorted(monitor.MARKET_JOBS)[0])
        data['health']['market_workers'][0]['body'] = 'secret recipient'
        with self.assertRaisesRegex(ValueError, 'invalid_health'):
            self.run_check(data)

    def test_cleanup_issue_codes_respect_dry_run(self):
        data = copy.deepcopy(BASE)
        data['cleanup']['remaining'] = True
        self.assertEqual(self.run_check(data)['issue_codes'], [])
        data['cleanup']['dry_run'] = False
        data['health']['cleanup_overdue'] = True
        data['attention'] = True
        self.assertEqual(self.run_check(data)['issue_codes'], ['cleanup_overdue', 'cleanup_backlog'])

    def test_partial_or_malformed_market_schema(self):
        for key in monitor.MARKET_COUNTS | {'market_workers'}:
            data = self.market_result()
            del data['health'][key]
            with self.assertRaises(ValueError):
                self.run_check(data)
        for field, value in [('job', 'unknown'), ('job', []), ('active', 1), ('status', True), ('status', 600), ('requested_at', 'invalid'), ('checked_at', 42)]:
            data = self.market_result()
            data['health']['market_workers'][0][field] = value
            with self.assertRaises(ValueError):
                self.run_check(data)
        data = self.market_result()
        data['health']['market_workers'][1] = data['health']['market_workers'][0]
        with self.assertRaises(ValueError):
            self.run_check(data)
        for value in [-1, True, '1', None]:
            data = self.market_result()
            data['health']['market_worker_failed'] = value
            with self.assertRaises(ValueError):
                self.run_check(data)
        data = self.market_result()
        data['health']['market_worker_failed'] = 1
        with self.assertRaisesRegex(ValueError, 'invalid_attention'):
            self.run_check(data)

    def test_missing_secret_never_requests(self):
        with patch('monitor.build_opener') as opener:
            with self.assertRaises(ValueError):
                monitor.check('')
            opener.assert_not_called()

    def test_failure_logs_no_diagnostics_or_secret(self):
        with patch('monitor.check', side_effect=RuntimeError('secret recipient')), patch('sys.stdout', new_callable=io.StringIO) as output:
            self.assertEqual(monitor.main(), 1)
            self.assertNotIn('secret', output.getvalue())
            self.assertNotIn('recipient', output.getvalue())

    def test_failure_log_codes_are_bounded(self):
        for error, code in [(ValueError('invalid_health'), 'invalid_health'),
                            (ValueError('secret recipient'), 'unexpected_error'),
                            (TimeoutError('secret recipient'), 'monitor_timeout'),
                            (monitor.URLError('secret recipient'), 'network_error')]:
            with self.subTest(code=code), patch('monitor.check', side_effect=error), patch('sys.stdout', new_callable=io.StringIO) as output:
                self.assertEqual(monitor.main(), 1)
                record = json.loads(output.getvalue())
                self.assertEqual(record['error_code'], code)
                self.assertNotIn('secret', output.getvalue())
                self.assertNotIn('recipient', output.getvalue())

    def test_no_redirect(self):
        self.assertIsNone(monitor.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.test'))


if __name__ == '__main__':
    unittest.main()
