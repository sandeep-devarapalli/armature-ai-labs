import contextlib
import io
import json
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

import runner

SECRET = 'synthetic-retention-secret-000000000'
EMPTY = {'examined': 0, 'deleted': 0, 'failed': 0}
FULL = {'examined': 100, 'deleted': 100, 'failed': 0}


class RetentionTests(unittest.TestCase):
    def response(self, body, status=200, url=runner.ENDPOINT):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = status
        response.geturl.return_value = url
        response.read.return_value = body
        return response

    def test_fixed_endpoint_method_secret_and_bounds(self):
        response = self.response(json.dumps(EMPTY).encode())
        with patch.object(runner, 'build_opener') as factory:
            factory.return_value.open.return_value = response
            self.assertEqual(runner.request_batch(SECRET), EMPTY)
            req = factory.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, runner.ENDPOINT)
            self.assertEqual(req.method, 'POST')
            self.assertEqual(req.get_header('X-armature-job-secret'), SECRET)
            self.assertEqual(factory.return_value.open.call_args.kwargs, {'timeout': 15})
            self.assertIsInstance(factory.call_args.args[0], runner.NoRedirect)
            response.read.assert_called_once_with(runner.MAX_BODY + 1)

    def test_redirects_forbidden(self):
        self.assertIsNone(runner.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.example'))
        for response in [self.response(b'{}', 302), self.response(b'{}', url='https://evil.example')]:
            with patch.object(runner, 'build_opener') as factory:
                factory.return_value.open.return_value = response
                with self.assertRaisesRegex(runner.RetentionError, '^unexpected_response$'):
                    runner.request_batch(SECRET)

    def test_network_errors_never_expose_body_or_message(self):
        sensitive = 'private-object-path-and-secret'
        errors = [HTTPError(runner.ENDPOINT, 503, sensitive, {}, io.BytesIO(sensitive.encode())),
                  URLError(sensitive), TimeoutError(sensitive), OSError(sensitive)]
        for error in errors:
            with self.subTest(error=type(error).__name__), patch.object(runner, 'build_opener') as factory:
                factory.return_value.open.side_effect = error
                with self.assertRaises(runner.RetentionError) as caught:
                    runner.request_batch(SECRET)
                self.assertNotIn(sensitive, str(caught.exception))

    def test_invalid_body_and_counts(self):
        values = [None, [], {}, {**EMPTY, 'extra': 'sensitive'}, {**EMPTY, 'examined': True},
                  {**EMPTY, 'examined': 1.0}, {**EMPTY, 'deleted': -1},
                  {'examined': 101, 'deleted': 101, 'failed': 0}, {**EMPTY, 'examined': 1}]
        for body in [json.dumps(value).encode() for value in values] + [b'sensitive invalid json', b'x' * 4097]:
            with self.subTest(body=body[:80]), patch.object(runner, 'build_opener') as factory:
                factory.return_value.open.return_value = self.response(body)
                with self.assertRaises(runner.RetentionError):
                    runner.request_batch(SECRET)

    def test_empty_is_idempotent(self):
        with patch.object(runner, 'request_batch', return_value=EMPTY) as request:
            for _ in range(2):
                self.assertEqual(runner.drain(SECRET), {'batches': 1, **EMPTY})
            self.assertEqual(request.call_count, 2)

    def test_drains_bounded_batches(self):
        with patch.object(runner, 'request_batch', side_effect=[FULL, {'examined': 2, 'deleted': 2, 'failed': 0}]):
            self.assertEqual(runner.drain(SECRET), {'batches': 2, 'examined': 102, 'deleted': 102, 'failed': 0})
        with patch.object(runner, 'request_batch', return_value=FULL) as request:
            with self.assertRaisesRegex(runner.RetentionError, '^backlog_remaining$'):
                runner.drain(SECRET)
            self.assertEqual(request.call_count, 10)

    def test_failure_stops_without_retry(self):
        with patch.object(runner, 'request_batch', return_value={'examined': 2, 'deleted': 1, 'failed': 1}) as request:
            with self.assertRaisesRegex(runner.RetentionError, '^deletion_failed$'):
                runner.drain(SECRET)
            request.assert_called_once()

    def test_invalid_secrets_never_call_network(self):
        with patch.object(runner, 'request_batch') as request:
            for secret in ['', 'short', SECRET + '\n', SECRET + ' ', 'x' * 4097]:
                with self.assertRaisesRegex(runner.RetentionError, '^invalid_secret$'):
                    runner.drain(secret)
            request.assert_not_called()

    def test_main_logs_only_aggregate_or_fixed_error(self):
        for outcome, code, event in [(EMPTY, 0, 'onboarding_retention_verified'),
                                     (ValueError('private-id-path-secret'), 1, 'onboarding_retention_failed'),
                                     (runner.RetentionError('execution_timeout'), 1, 'onboarding_retention_failed')]:
            output = io.StringIO()
            with patch.object(runner, 'drain', side_effect=outcome if isinstance(outcome, Exception) else None,
                              return_value=outcome), patch.object(runner.signal, 'setitimer') as timer, contextlib.redirect_stdout(output):
                self.assertEqual(runner.main(), code)
                timer.assert_any_call(runner.signal.ITIMER_REAL, 180)
                timer.assert_any_call(runner.signal.ITIMER_REAL, 0)
            self.assertEqual(json.loads(output.getvalue())['event'], event)
            self.assertNotIn('private-id-path-secret', output.getvalue())

    def test_total_deadline_raises_fixed_error(self):
        with self.assertRaisesRegex(runner.RetentionError, '^execution_timeout$'):
            runner.deadline_expired(None, None)


if __name__ == '__main__':
    unittest.main()
