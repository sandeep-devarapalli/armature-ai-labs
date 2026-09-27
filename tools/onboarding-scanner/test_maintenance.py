import base64
import copy
import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
import maintenance as job


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.service = {
            'name': job.RESOURCE, 'etag': 'etag-1', 'uri': 'https://scanner-abc.a.run.app',
            'template': {'annotations': {'existing.example/key': 'keep'}, 'containers': [
                {'image': 'registry/scanner@sha256:' + 'a' * 64}]},
            'traffic': [{'type': 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', 'percent': 100}],
            'latestCreatedRevision': 'revision-old', 'latestReadyRevision': 'revision-old',
        }
        self.calls = []
        self.failed_operation = self.bad_revision = self.poll = False

    def api(self, url, method='GET', payload=None):
        self.calls.append((url, method, payload))
        if 'secretmanager.' in url:
            return {'payload': {'data': base64.b64encode(b'x' * 40).decode()}}
        if method == 'PATCH':
            self.current = copy.deepcopy(self.service)
            self.current['template']['annotations'] = copy.deepcopy(payload['template']['annotations'])
            self.current['latestCreatedRevision'] = 'revision-new'
            self.current['latestReadyRevision'] = 'revision-old' if self.bad_revision else 'revision-new'
            self.current['trafficStatuses'] = [{'revision': 'revision-new', 'percent': 100}]
            return {'name': f'projects/{job.PROJECT}/locations/{job.REGION}/operations/op1', 'done': False}
        if '/operations/' in url:
            return {'done': True, 'error': {'message': 'sensitive'}} if self.failed_operation else {'done': not self.poll}
        return copy.deepcopy(getattr(self, 'current', self.service))

    def run_refresh(self, health=None):
        with patch.object(job, 'api', side_effect=self.api), patch.object(job, 'metadata', return_value='identity-token'), patch.object(job, 'request', return_value=health or {'ready': True}) as request, patch.object(job.time, 'sleep'):
            result = job.refresh('1')
        return result, request

    def test_preserves_map_and_narrow_update(self):
        result, request = self.run_refresh()
        self.assertEqual(result, 'revision-new')
        url, method, payload = next(c for c in self.calls if c[1] == 'PATCH')
        self.assertTrue(url.endswith('?updateMask=template.annotations'))
        self.assertEqual(payload['etag'], 'etag-1')
        self.assertEqual(set(payload['template']), {'annotations'})
        self.assertEqual(payload['template']['annotations']['existing.example/key'], 'keep')
        self.assertNotIn(job.REFRESH_KEY, self.service['template']['annotations'])
        self.assertEqual(request.call_args.args[0], 'https://scanner-abc.a.run.app/health')
        self.assertEqual(request.call_args.args[1]['X-Serverless-Authorization'], 'Bearer identity-token')

    def test_secret_version_required_and_pinned(self):
        with patch.object(job, 'api') as api:
            for value in ('', 'latest', '../2', '0', '1?alt=json'):
                with self.subTest(value=value), self.assertRaisesRegex(job.MaintenanceError, 'invalid_secret_version'):
                    job.refresh(value)
            api.assert_not_called()

    def test_rejects_unsafe_urls(self):
        for uri in ('http://scanner.run.app', 'https://run.app.attacker.test', 'https://scanner.run.app@evil.test', 'https://scanner.run.app/path', 'https://scanner.run.app:443', 'https://scanner.run.app?token=x'):
            with self.subTest(uri=uri), self.assertRaises(job.MaintenanceError):
                job.scanner_uri(uri)

    def test_rejects_unpinned_or_fixed_traffic_before_patch(self):
        for change in ('image', 'traffic'):
            with self.subTest(change=change):
                old = copy.deepcopy(self.service)
                if change == 'image':
                    self.service['template']['containers'][0]['image'] = 'registry/scanner:latest'
                else:
                    self.service['traffic'][0]['type'] = 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION'
                with self.assertRaises(job.MaintenanceError):
                    self.run_refresh()
                self.assertFalse(any(c[1] == 'PATCH' for c in self.calls))
                self.service = old

    def test_failed_operation_aborts_without_secret_access(self):
        self.failed_operation = True
        with self.assertRaisesRegex(job.MaintenanceError, '^operation_failed$'):
            self.run_refresh()
        self.assertFalse(any('secretmanager.' in c[0] for c in self.calls))

    def test_unready_revision_aborts(self):
        self.bad_revision = True
        with self.assertRaisesRegex(job.MaintenanceError, 'revision_not_verified'):
            self.run_refresh()

    def test_failed_health_is_not_success(self):
        with self.assertRaisesRegex(job.MaintenanceError, 'unhealthy_scanner'):
            self.run_refresh({'ready': False})

    def test_operation_timeout(self):
        self.poll = True
        with patch.object(job.time, 'monotonic', side_effect=[0, 481]), self.assertRaisesRegex(job.MaintenanceError, 'operation_timeout'):
            self.run_refresh()

    def test_failure_log_does_not_include_exception_secret(self):
        output = io.StringIO()
        with patch.object(job, 'refresh', side_effect=ValueError('private-key')), redirect_stdout(output):
            self.assertEqual(job.main(), 1)
        self.assertIn('scanner_refresh_failed', output.getvalue())
        self.assertNotIn('private-key', output.getvalue())


if __name__ == '__main__':
    unittest.main()
