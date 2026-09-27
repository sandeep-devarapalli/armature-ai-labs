import json
import os
import signal
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

ENDPOINT = 'https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/onboarding-retention'
MAX_BATCHES = 10
BATCH_SIZE = 100
MAX_BODY = 4096


class RetentionError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_batch(secret):
    request = Request(ENDPOINT, data=b'{}', method='POST', headers={
        'Content-Type': 'application/json', 'x-armature-job-secret': secret,
    })
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            if response.status != 200 or response.geturl() != ENDPOINT:
                raise RetentionError('unexpected_response')
            body = response.read(MAX_BODY + 1)
            if len(body) > MAX_BODY:
                raise RetentionError('response_too_large')
            result = json.loads(body)
    except HTTPError as error:
        error.close()
        raise RetentionError('http_error') from None
    except (URLError, TimeoutError, OSError, ValueError, UnicodeError):
        raise RetentionError('request_failed') from None
    if (not isinstance(result, dict) or set(result) != {'examined', 'deleted', 'failed'}
            or any(type(value) is not int or not 0 <= value <= BATCH_SIZE for value in result.values())
            or result['deleted'] + result['failed'] != result['examined']):
        raise RetentionError('invalid_counts')
    return result


def drain(secret):
    if not isinstance(secret, str) or len(secret) < 32 or len(secret) > 4096 or any(c.isspace() for c in secret):
        raise RetentionError('invalid_secret')
    totals = {'batches': 0, 'examined': 0, 'deleted': 0, 'failed': 0}
    for _ in range(MAX_BATCHES):
        batch = request_batch(secret)
        totals['batches'] += 1
        for name in batch:
            totals[name] += batch[name]
        if batch['failed']:
            raise RetentionError('deletion_failed')
        if batch['examined'] < BATCH_SIZE:
            return totals
    raise RetentionError('backlog_remaining')


def deadline_expired(signum, frame):
    raise RetentionError('execution_timeout')


def main():
    previous = signal.signal(signal.SIGALRM, deadline_expired)
    signal.setitimer(signal.ITIMER_REAL, 180)
    try:
        totals = drain(os.environ.get('ONBOARDING_RETENTION_JOB_SECRET', ''))
        print(json.dumps({'severity': 'INFO', 'event': 'onboarding_retention_verified', **totals}), flush=True)
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error, RetentionError) else 'unexpected_failure'
        print(json.dumps({'severity': 'ERROR', 'event': 'onboarding_retention_failed', 'reason': reason}), flush=True)
        return 1
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


if __name__ == '__main__':
    sys.exit(main())
