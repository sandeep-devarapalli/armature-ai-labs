import base64
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

PROJECT = 'armature-booking-integration'
REGION = 'asia-south1'
SERVICE = 'armature-onboarding-scanner'
RESOURCE = f'projects/{PROJECT}/locations/{REGION}/services/{SERVICE}'
RUN = 'https://run.googleapis.com/v2/'
METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/'
REFRESH_KEY = 'armatureailabs.com/signature-refresh'


class MaintenanceError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, headers, method='GET', payload=None, raw=False):
    data = None if payload is None else json.dumps(payload).encode()
    req = Request(url, data=data, headers=headers, method=method)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with build_opener(NoRedirect()).open(req, timeout=30) as response:
            body = response.read(1024 * 1024 + 1)
            if len(body) > 1024 * 1024:
                raise MaintenanceError('response_too_large')
            return body.decode() if raw else json.loads(body)
    except HTTPError as error:
        raise MaintenanceError(f'http_{error.code}') from None
    except (URLError, TimeoutError, ValueError, UnicodeError):
        raise MaintenanceError('request_failed') from None


def metadata(path, raw=False):
    return request(METADATA + path, {'Metadata-Flavor': 'Google'}, raw=raw)


def api(url, method='GET', payload=None):
    token = metadata('token')['access_token']
    return request(url, {'Authorization': 'Bearer ' + token}, method, payload)


def scanner_uri(value):
    parts = urlsplit(value)
    if (parts.scheme != 'https' or not parts.hostname
            or not re.fullmatch(r'[a-z0-9-]+\.([a-z0-9-]+\.)?run\.app', parts.hostname)
            or parts.username or parts.password or parts.port
            or parts.path not in ('', '/') or parts.query or parts.fragment):
        raise MaintenanceError('invalid_scanner_uri')
    return value.rstrip('/')


def validate_service(service):
    if service.get('name') != RESOURCE or service.get('reconciling'):
        raise MaintenanceError('unexpected_service_state')
    if not service.get('etag'):
        raise MaintenanceError('missing_etag')
    containers = service.get('template', {}).get('containers', [])
    if not containers or any(not re.search(r'@sha256:[0-9a-f]{64}$', c.get('image', '')) for c in containers):
        raise MaintenanceError('unpinned_images')
    traffic = service.get('traffic', [])
    if len(traffic) != 1 or traffic[0].get('type') != 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST' or traffic[0].get('percent') != 100:
        raise MaintenanceError('non_latest_traffic')
    scanner_uri(service.get('uri', ''))


def refresh(secret_version, timeout=480):
    if not re.fullmatch(r'[1-9][0-9]*', secret_version):
        raise MaintenanceError('invalid_secret_version')
    deadline = time.monotonic() + timeout
    service = api(RUN + RESOURCE)
    validate_service(service)
    annotations = dict(service['template'].get('annotations', {}))
    annotations[REFRESH_KEY] = datetime.now(timezone.utc).isoformat() + '-' + uuid.uuid4().hex
    payload = {'name': RESOURCE, 'etag': service['etag'], 'template': {'annotations': annotations}}
    operation = api(RUN + RESOURCE + '?updateMask=template.annotations', 'PATCH', payload)
    name = operation.get('name', '')
    prefix = f'projects/{PROJECT}/locations/{REGION}/operations/'
    if not name.startswith(prefix) or not re.fullmatch(r'[A-Za-z0-9_-]+', name[len(prefix):]):
        raise MaintenanceError('invalid_operation')
    while not operation.get('done'):
        if time.monotonic() >= deadline:
            raise MaintenanceError('operation_timeout')
        time.sleep(min(5, max(0, deadline - time.monotonic())))
        operation = api(RUN + name)
    if 'error' in operation:
        raise MaintenanceError('operation_failed')
    current = api(RUN + RESOURCE)
    validate_service(current)
    revision = current.get('latestCreatedRevision')
    if (not revision or revision == service.get('latestCreatedRevision')
            or current.get('latestReadyRevision') != revision
            or current['template'].get('annotations', {}).get(REFRESH_KEY) != annotations[REFRESH_KEY]
            or current['template'].get('containers') != service['template'].get('containers')):
        raise MaintenanceError('revision_not_verified')
    statuses = current.get('trafficStatuses', [])
    revision_id = revision.rsplit('/', 1)[-1]
    if len(statuses) != 1 or statuses[0].get('revision') not in (revision, revision_id) or statuses[0].get('percent') != 100:
        raise MaintenanceError('revision_not_serving')
    uri = scanner_uri(current['uri'])
    secret = api(f'https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/onboarding-scanner-bearer/versions/{secret_version}:access')
    try:
        bearer = base64.b64decode(secret['payload']['data'], validate=True).decode()
    except (KeyError, ValueError, UnicodeError):
        raise MaintenanceError('invalid_secret') from None
    if len(bearer) < 32 or '\n' in bearer or '\r' in bearer:
        raise MaintenanceError('invalid_secret')
    identity = metadata('identity?' + urlencode({'audience': uri, 'format': 'full'}), raw=True)
    health = request(uri + '/health', {'Authorization': 'Bearer ' + bearer, 'X-Serverless-Authorization': 'Bearer ' + identity})
    if health != {'ready': True}:
        raise MaintenanceError('unhealthy_scanner')
    return revision


def main():
    try:
        revision = refresh(os.environ.get('SCANNER_SECRET_VERSION', ''))
        print(json.dumps({'severity': 'INFO', 'event': 'scanner_refresh_verified', 'revision': revision}), flush=True)
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error, MaintenanceError) else 'unexpected_failure'
        print(json.dumps({'severity': 'ERROR', 'event': 'scanner_refresh_failed', 'reason': reason}), flush=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
