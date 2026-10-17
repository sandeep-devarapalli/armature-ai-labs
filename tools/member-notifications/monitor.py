"""Prepared notification monitor; no job is provisioned by this script."""
from datetime import datetime
import json
import os
import signal
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

ENDPOINT = 'https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/member-notification-maintenance'
LEGACY_COUNTS = {'held', 'queue_overdue', 'expired_leases', 'unknown', 'failed', 'delivery_unconfirmed', 'unmatched_receipts', 'history_due'}
ATLAS_COUNTS = {'atlas_queue_overdue', 'atlas_expired_leases', 'atlas_unknown', 'atlas_failed', 'atlas_delivery_failed', 'atlas_delivery_unconfirmed'}
COUNTS = LEGACY_COUNTS | ATLAS_COUNTS
MARKET_COUNTS = {'market_worker_failed', 'market_worker_stale', 'market_cleanup_backlog'}
MARKET_JOBS = {'market-message-reminders-every-five-minutes', 'market-private-file-cleanup-daily'}
HEALTH_FIELDS = {'sending_enabled', 'cleanup_enabled', 'last_cleanup_at', 'cleanup_overdue'}
ERROR_CODES = {'invalid_configuration', 'unexpected_response', 'response_too_large', 'request_failed', 'invalid_response', 'invalid_cleanup', 'invalid_health', 'invalid_attention'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(secret):
    if not isinstance(secret, str) or not 32 <= len(secret) <= 256 or any(c.isspace() for c in secret):
        raise ValueError('invalid_configuration')
    request = Request(ENDPOINT, method='POST', headers={'x-armature-job-secret': secret})
    try:
        with build_opener(NoRedirect()).open(request, timeout=25) as response:
            if response.status != 200 or response.geturl() != ENDPOINT:
                raise ValueError('unexpected_response')
            raw = response.read(8193)
            if len(raw) > 8192:
                raise ValueError('response_too_large')
            result = json.loads(raw)
    except HTTPError as error:
        error.close()
        raise ValueError('request_failed') from None
    if not isinstance(result, dict) or set(result) != {'attention', 'cleanup', 'health'}:
        raise ValueError('invalid_response')
    cleanup, health = result['cleanup'], result['health']
    if not isinstance(cleanup, dict) or set(cleanup) != {'dry_run', 'history', 'receipts', 'remaining'}:
        raise ValueError('invalid_cleanup')
    if any(type(cleanup[k]) is not int or not 0 <= cleanup[k] <= 100 for k in ('history', 'receipts')) or any(type(cleanup[k]) is not bool for k in ('dry_run', 'remaining')):
        raise ValueError('invalid_cleanup')
    if not isinstance(health, dict) or set(health) not in (LEGACY_COUNTS | HEALTH_FIELDS, COUNTS | HEALTH_FIELDS, COUNTS | MARKET_COUNTS | HEALTH_FIELDS | {'market_workers'}):
        raise ValueError('invalid_health')
    counts = COUNTS | MARKET_COUNTS if 'market_workers' in health else COUNTS if set(health) == COUNTS | HEALTH_FIELDS else LEGACY_COUNTS
    if 'market_workers' in health:
        workers = health['market_workers']
        if not isinstance(workers, list) or len(workers) != len(MARKET_JOBS):
            raise ValueError('invalid_health')
        seen = set()
        for worker in workers:
            if not isinstance(worker, dict) or set(worker) != {'job', 'active', 'requested_at', 'status', 'checked_at'}:
                raise ValueError('invalid_health')
            job = worker['job']
            if not isinstance(job, str) or job not in MARKET_JOBS or job in seen or type(worker['active']) is not bool:
                raise ValueError('invalid_health')
            seen.add(job)
            if worker['status'] is not None and (type(worker['status']) is not int or not 100 <= worker['status'] <= 599):
                raise ValueError('invalid_health')
            for field in ('requested_at', 'checked_at'):
                value = worker[field]
                if value is not None:
                    if not isinstance(value, str) or len(value) > 40:
                        raise ValueError('invalid_health')
                    try:
                        if datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is None:
                            raise ValueError('invalid_health')
                    except ValueError:
                        raise ValueError('invalid_health') from None
    if any(type(health[k]) is not int or health[k] < 0 for k in counts) or any(type(health[k]) is not bool for k in ('sending_enabled', 'cleanup_enabled', 'cleanup_overdue')):
        raise ValueError('invalid_health')
    if health['last_cleanup_at'] is not None and not isinstance(health['last_cleanup_at'], str):
        raise ValueError('invalid_health')
    attention = bool(health['cleanup_overdue'] or any(health[k] for k in counts - {'held', 'history_due'}) or (not cleanup['dry_run'] and cleanup['remaining']))
    if type(result['attention']) is not bool or result['attention'] != attention:
        raise ValueError('invalid_attention')
    issues = sorted(k for k in counts - {'held', 'history_due'} if health[k])
    if health['cleanup_overdue']:
        issues.append('cleanup_overdue')
    if not cleanup['dry_run'] and cleanup['remaining']:
        issues.append('cleanup_backlog')
    result = {'attention': attention, 'issue_codes': issues, 'dry_run': cleanup['dry_run'], 'history': cleanup['history'], 'receipts': cleanup['receipts'], **{k: health[k] for k in sorted(counts)}, 'cleanup_overdue': health['cleanup_overdue']}
    if 'market_workers' in health:
        result['market_workers'] = health['market_workers']
    return result


def deadline_expired(signum, frame):
    raise TimeoutError('monitor_deadline')


def main():
    previous = signal.signal(signal.SIGALRM, deadline_expired)
    signal.setitimer(signal.ITIMER_REAL, 45)
    try:
        result = check(os.environ.get('MEMBER_NOTIFICATIONS_MAINTENANCE_SECRET', ''))
        print(json.dumps({'severity': 'WARNING' if result['attention'] else 'INFO', 'event': 'member_notifications_checked', **result}), flush=True)
        return 1 if result['attention'] else 0
    except Exception as error:
        code = 'monitor_timeout' if isinstance(error, TimeoutError) else 'network_error' if isinstance(error, URLError) else str(error) if type(error) is ValueError and str(error) in ERROR_CODES else 'unexpected_error'
        print(json.dumps({'severity': 'ERROR', 'event': 'member_notifications_monitor_failed', 'error_code': code}), flush=True)
        return 1
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


if __name__ == '__main__':
    sys.exit(main())
