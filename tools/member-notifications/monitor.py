"""Prepared notification monitor; no job is provisioned by this script."""
import json
import os
import signal
import sys
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

ENDPOINT = 'https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/member-notification-maintenance'
COUNTS = {'held', 'queue_overdue', 'expired_leases', 'unknown', 'failed', 'delivery_unconfirmed', 'unmatched_receipts', 'history_due'}


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
    if not isinstance(health, dict) or set(health) != COUNTS | {'sending_enabled', 'cleanup_enabled', 'last_cleanup_at', 'cleanup_overdue'}:
        raise ValueError('invalid_health')
    if any(type(health[k]) is not int or health[k] < 0 for k in COUNTS) or any(type(health[k]) is not bool for k in ('sending_enabled', 'cleanup_enabled', 'cleanup_overdue')):
        raise ValueError('invalid_health')
    if health['last_cleanup_at'] is not None and not isinstance(health['last_cleanup_at'], str):
        raise ValueError('invalid_health')
    attention = bool(health['cleanup_overdue'] or any(health[k] for k in COUNTS - {'held', 'history_due'}) or (not cleanup['dry_run'] and cleanup['remaining']))
    if type(result['attention']) is not bool or result['attention'] != attention:
        raise ValueError('invalid_attention')
    return {'attention': attention, 'dry_run': cleanup['dry_run'], 'history': cleanup['history'], 'receipts': cleanup['receipts'], **{k: health[k] for k in sorted(COUNTS)}, 'cleanup_overdue': health['cleanup_overdue']}


def deadline_expired(signum, frame):
    raise TimeoutError('monitor_deadline')


def main():
    previous = signal.signal(signal.SIGALRM, deadline_expired)
    signal.setitimer(signal.ITIMER_REAL, 45)
    try:
        result = check(os.environ.get('MEMBER_NOTIFICATIONS_MAINTENANCE_SECRET', ''))
        print(json.dumps({'severity': 'WARNING' if result['attention'] else 'INFO', 'event': 'member_notifications_checked', **result}), flush=True)
        return 1 if result['attention'] else 0
    except Exception:
        print(json.dumps({'severity': 'ERROR', 'event': 'member_notifications_monitor_failed'}), flush=True)
        return 1
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


if __name__ == '__main__':
    sys.exit(main())
