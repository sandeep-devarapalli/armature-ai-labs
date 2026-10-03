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
        self.assertFalse(self.run_check(BASE)['attention'])

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

    def test_no_redirect(self):
        self.assertIsNone(monitor.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.test'))


if __name__ == '__main__':
    unittest.main()
