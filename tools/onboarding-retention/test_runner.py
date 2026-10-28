import contextlib
from email.message import Message
import io
import json
import unittest
from unittest.mock import MagicMock, call, patch
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

    def test_http_status_is_logged_without_retrying_or_disclosing_response(self):
        for status in (401, 403, 500, 502, 503, 504):
            sensitive = 'private-object-path-and-secret'
            error = HTTPError(runner.ENDPOINT, status, sensitive, {}, io.BytesIO(sensitive.encode()))
            output = io.StringIO()
            with self.subTest(status=status), patch.dict(runner.os.environ, {'ONBOARDING_RETENTION_JOB_SECRET': SECRET}), \
                    patch.object(runner, 'build_opener') as factory, contextlib.redirect_stdout(output):
                factory.return_value.open.side_effect = error
                self.assertEqual(runner.main(), 1)
                factory.return_value.open.assert_called_once()
            self.assertEqual(json.loads(output.getvalue()), {'severity': 'ERROR',
                             'event': 'onboarding_retention_failed', 'reason': 'http_error', 'http_status': status})
            self.assertNotIn(sensitive, output.getvalue())
            self.assertNotIn(SECRET, output.getvalue())
            self.assertTrue(error.fp.closed)

    def platform_error(self, status=503, code=runner.DEGRADED_CODE):
        headers = Message()
        if code is not None:
            headers['Sb-Error-Code'] = code
        return HTTPError(runner.ENDPOINT, status, 'private-message', headers, io.BytesIO(b'private-body'))

    def test_identified_platform_rejection_recovers_after_bounded_backoff(self):
        output = io.StringIO()
        errors = [self.platform_error(), self.platform_error()]
        with patch.dict(runner.os.environ, {'ONBOARDING_RETENTION_JOB_SECRET': SECRET}), \
                patch.object(runner, 'build_opener') as factory, patch.object(runner.time, 'sleep') as sleep, \
                contextlib.redirect_stdout(output):
            factory.return_value.open.side_effect = [*errors, self.response(json.dumps(EMPTY).encode())]
            self.assertEqual(runner.main(), 0)
            self.assertEqual(factory.return_value.open.call_count, 3)
            self.assertEqual(sleep.call_args_list, [call(2), call(4)])
        logs = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([entry['retry'] for entry in logs[:-1]], [1, 2])
        self.assertTrue(all(entry['platform_error_code'] == runner.DEGRADED_CODE for entry in logs[:-1]))
        self.assertEqual(logs[-1], {'severity': 'INFO', 'event': 'onboarding_retention_verified', 'batches': 1, **EMPTY})
        self.assertNotIn('private', output.getvalue())
        self.assertNotIn(SECRET, output.getvalue())
        self.assertTrue(all(error.fp.closed for error in errors))

    def test_persistent_platform_rejection_still_fails_and_alerts(self):
        output = io.StringIO()
        with patch.dict(runner.os.environ, {'ONBOARDING_RETENTION_JOB_SECRET': SECRET}), \
                patch.object(runner, 'build_opener') as factory, patch.object(runner.time, 'sleep') as sleep, \
                contextlib.redirect_stdout(output):
            factory.return_value.open.side_effect = [self.platform_error() for _ in range(3)]
            self.assertEqual(runner.main(), 1)
            self.assertEqual(factory.return_value.open.call_count, 3)
            self.assertEqual(sleep.call_count, 2)
        final = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(final, {'severity': 'ERROR', 'event': 'onboarding_retention_failed',
                                'reason': 'http_error', 'http_status': 503, 'platform_error_code': runner.DEGRADED_CODE})

    def test_retry_budget_is_shared_across_batches(self):
        output = io.StringIO()
        with patch.object(runner, 'build_opener') as factory, patch.object(runner.time, 'sleep') as sleep, \
                contextlib.redirect_stdout(output):
            factory.return_value.open.side_effect = [self.platform_error(), self.response(json.dumps(FULL).encode()),
                  self.platform_error(), self.response(json.dumps(FULL).encode()), self.platform_error()]
            with self.assertRaises(runner.RetentionError):
                runner.drain(SECRET)
            self.assertEqual(factory.return_value.open.call_count, 5)
            self.assertEqual(sleep.call_count, 2)

    def test_unknown_or_misleading_platform_errors_never_retry(self):
        errors = [self.platform_error(code=code) for code in
                  (None, '', runner.DEGRADED_CODE + '-extra', 'EDGE_FUNCTION_ERROR', 'LOAD_FUNCTION_ERROR', 'private-header')]
        errors += [self.platform_error(status=status) for status in (401, 403, 429, 500, 502, 504)]
        errors += [self.platform_error(code=None), URLError('private-error')]
        for error in errors:
            with self.subTest(status=getattr(error, 'code', None)), patch.object(runner, 'build_opener') as factory, \
                    patch.object(runner.time, 'sleep') as sleep:
                factory.return_value.open.side_effect = error
                with self.assertRaises(runner.RetentionError):
                    runner.drain(SECRET)
                factory.return_value.open.assert_called_once()
                sleep.assert_not_called()

    def test_application_failure_after_rejection_is_not_hidden(self):
        for failure in [self.platform_error(code=None),
                        self.response(json.dumps({'examined': 1, 'deleted': 0, 'failed': 1}).encode()),
                        self.response(b'{}')]:
            output = io.StringIO()
            with patch.object(runner, 'build_opener') as factory, patch.object(runner.time, 'sleep') as sleep, \
                    contextlib.redirect_stdout(output):
                factory.return_value.open.side_effect = [self.platform_error(), failure]
                with self.assertRaises(runner.RetentionError):
                    runner.drain(SECRET)
                self.assertEqual(factory.return_value.open.call_count, 2)
                sleep.assert_called_once_with(2)

    def test_execution_deadline_remains_fatal_during_backoff(self):
        output = io.StringIO()
        with patch.dict(runner.os.environ, {'ONBOARDING_RETENTION_JOB_SECRET': SECRET}), \
                patch.object(runner, 'build_opener') as factory, \
                patch.object(runner.time, 'sleep', side_effect=runner.RetentionError('execution_timeout')), \
                contextlib.redirect_stdout(output):
            factory.return_value.open.side_effect = self.platform_error()
            self.assertEqual(runner.main(), 1)
            factory.return_value.open.assert_called_once()
        self.assertEqual(json.loads(output.getvalue().splitlines()[-1])['reason'], 'execution_timeout')

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
