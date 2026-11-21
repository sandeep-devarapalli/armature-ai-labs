"""Run one booking-notice batch with the Cloud Run job's service identity."""

import json
import os
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def request(url, data=None, headers=None):
    with urlopen(Request(url, data=data, headers=headers or {}), timeout=25) as response:
        return json.load(response)


def post(url, data, headers):
    return request(url, json.dumps(data).encode(), {
        **headers, "Content-Type": "application/json",
    })


def send_batch():
    sender = os.environ["BOOKING_MAIL_ACCOUNT"]
    subject = os.environ["BOOKING_MAIL_SUBJECT"]
    endpoint = os.environ["BOOKING_NOTICE_ENDPOINT"]
    gateway_jwt = os.environ["BOOKING_NOTICE_GATEWAY_JWT"]
    job_headers = {
        "Authorization": f"Bearer {gateway_jwt}",
        "apikey": gateway_jwt,
        "x-armature-job-secret": os.environ["BOOKING_NOTICE_RUNNER_SECRET"],
    }
    access = request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
    )["access_token"]
    now = int(time.time())
    oauth = "https://oauth2.googleapis.com/token"
    claims = {
        "iss": sender, "sub": subject, "aud": oauth, "iat": now, "exp": now + 600,
        "scope": "https://www.googleapis.com/auth/gmail.send",
    }
    assertion = post(
        f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{sender}:signJwt",
        {"payload": json.dumps(claims)}, {"Authorization": f"Bearer {access}"},
    )["signedJwt"]
    token = request(oauth, urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion,
    }).encode())["access_token"]
    batch = post(endpoint, {"action": "claim"}, job_headers)
    counts = dict(sent=0, rejected=0, ambiguous=0, unsettled=0)
    for message in batch.get("messages", []):
        status, provider_id = "ambiguous", None
        try:
            result = post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                {"raw": message["raw"]}, {"Authorization": f"Bearer {token}"},
            )
            if isinstance(result.get("id"), str) and result["id"].isalnum():
                status, provider_id = "sent", result["id"]
        except HTTPError as error:
            if error.code in {400, 401, 403, 404, 413, 429}:
                status = "rejected"
        except (OSError, ValueError):
            pass
        try:
            settled = post(endpoint, {
                "action": "settle", "id": message["id"], "status": status, "providerId": provider_id,
            }, job_headers)
            counts[status if settled.get("settled") else "unsettled"] += 1
        except (OSError, ValueError):
            counts["unsettled"] += 1
    print(json.dumps(counts), flush=True)
    return int(any(counts[k] for k in ("rejected", "ambiguous", "unsettled")))


if __name__ == "__main__":
    try:
        raise SystemExit(send_batch())
    except HTTPError as error:
        print(f"Booking worker authorization or claim failed (HTTP {error.code})", flush=True)
        raise SystemExit(1)
    except (OSError, ValueError, KeyError):
        print("Booking worker configuration or request failed", flush=True)
        raise SystemExit(1)
