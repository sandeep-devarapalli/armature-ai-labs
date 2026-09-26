# Private onboarding image scanner

Authenticated binary POST `/scan`: PNG/JPEG only, `Content-Length` 1..5 MiB, `Authorization: Bearer <SCANNER_SECRET>`. Success 200 returns the normalized image with the original MIME; failure 422 means unsafe/invalid, 503 means no safe verdict (including stale signatures), 413 size limit, 401 unauthorized. Callers must reject every non-200 or unexpected content type. GET `/health` requires the same token and exposes only `ready`.

Raw bytes are scanned **before** Pillow is invoked. Full image verification/decode rejects malformed, animated, oversized (>16 million pixels or >8192 per side) images. A fresh pixel-only PNG/JPEG removes EXIF/comments/profiles, applies EXIF orientation, and the output is scanned again. Only normalized bytes may enter private storage. No document or request-body logging or persistence; no third-party scanning service receives uploads. ClamAV is defense in depth, not a guarantee against all malware.

## Local synthetic-only verification

Create a 32+ character secret in a mode0600 file **outside the repository** as `SCANNER_SECRET=...`, then:

```sh
docker compose --env-file /private/tmp/armature-scanner-local.env up -d --build
python3 -m venv /private/tmp/armature-scanner-venv
/private/tmp/armature-scanner-venv/bin/pip install -r requirements.txt
/private/tmp/armature-scanner-venv/bin/python -m unittest -v
```

Gateway binding: `127.0.0.1:55580`; ClamAV has **no host port**. The gateway has a separate ingress network so Docker can publish the loopback port. ClamAV has a separate update network for signature updates; restrict egress with production network policy. Its named volume stores signatures, never uploaded files. The ClamAV build pins the verified base digest; pin built gateway/sidecar digests before deploying.

Use generated synthetic images and the harmless standard [EICAR test string](https://www.eicar.org/download-anti-malware-testfile/) only. Test a clean PNG/JPEG (200), EICAR (422), EICAR appended to PNG (422), malformed/truncated PNG (422), wrong token (401), unavailable daemon (503), and clean normalization without metadata. Do not use real applicant documents for tests. The unit suite uses mocked verdicts; only the separate real integration check establishes ClamAV connectivity/detection.

## Resource and availability contract

One concurrent decode/scan, eight bounded HTTP handlers, 15-second body deadline, 20-second deadline per ClamAV exchange, 5MiB input/output. Gateway limit512MiB; local ClamAV3GiB. Concurrency rejects immediately with503 instead of accumulating file buffers. This bounds memory exposure; production latency/RSS remain to be measured on the chosen hosting. PNG reencoding can exceed5MiB and is deliberately rejected. The Docker container runs the gateway unprivileged, read-only, with no capabilities. Stdlib HTTP is private-only: put authenticated HTTPS/IAM ingress in front of it for production; never expose this local port publicly.

## Cloud Run on-demand deployment caveats

Use a gateway and ClamAV sidecar in **one** private Cloud Run service, IAM-authenticated invocation, Secret Manager for the independent bearer token, concurrency1, bounded max instances and request timeout. Set `CLAMD_HOST=127.0.0.1` for the sidecar. Bind the gateway to its8080 ingress port; never expose3310. The service needs enough memory for both containers (ClamAV signatures dominate). The local Compose file is not a production deployment manifest.

Scale-to-zero means cold starts must load/download signature databases, potentially taking minutes. An immutable image containing a recent signature snapshot plus startup update avoids depending on an empty persistent disk; Cloud Run's writable filesystem is ephemeral and in memory. Readiness must remain false until fresh signatures are loaded. `VERSION` timestamp must be UTC (both containers TZ=UTC) and at most72h old; malformed/future dates fail closed. Startup and Cloud Run startup probe timeouts must allow the actual measured startup time.

With request-based CPU throttling, a background freshclam process cannot be assumed to run reliably while idle. Either use instance-based CPU with understood billing, refresh on startup and before readiness/requests via a coordinated updater, or rebuild/redeploy fresh signature snapshots on a monitored schedule. **Do not** launch a permanently idle updater and claim signatures stay current. Scale-to-zero still requires a startup freshness gate; the current gateway already refuses stale signatures, but does not itself fetch updates. Define an operator/alert for stale or unavailable scanners and retention job failures before collecting real IDs.

References: [ClamAV daemon protocol and usage](https://docs.clamav.net/manual/Usage/Scanning.html), [Pillow image API](https://pillow.readthedocs.io/en/stable/reference/Image.html). Pillow12.3.0 was verified against the official PyPI package metadata during implementation. Production hosting, image digests, signature refresh mechanism and measured sizing must be verified before release.

## Verified local evidence (26 September 2026)

- 12 unittest cases passed (Pillow12.3.0, macOS Python3.14); Docker gateway Python3.13, same Pillow pin.
- Real ClamAV1.5.4 with fresh database28135: clean synthetic512px PNG200 (0.018s), standalone EICAR422 (0.006s), PNG plus trailing EICAR422 (0.004s), malformedPNG422 (0.008s), wrong bearer401. These single-request timings are smoke evidence, not throughput/tail-latency claims.
- Stopping the actual daemon produced health503; restarted afterwards. Initial stale loaded signatures also produced503, demonstrating fail-closed freshness.
- ClamAV did **not** detect trailing EICAR after PNG IEND itself. Strict image container-end checks reject trailing payloads; the normalized output cannot retain such data. This is not a claim that ClamAV detects every embedded threat.
- Docker startup updater raced the clamd socket: database updated, notification failed and old signatures remained loaded. A local `zRELOAD` loaded the update. Production startup must sequence update before clamd and wait for fresh readiness.
- Local idle container usage after scan: gateway15.91MiB/512MiB; ClamAV976.7MiB/3GiB. Not peak-memory evidence. ClamAV amd64 emulated on Apple Silicon; no production sizing claim.
- Resolved official ClamAV image digest: `sha256:0e31ce089574268aefa0b543767d66b70240ab51ed49eec53e07f18d5629d817`. Python3.13-slim build digest: `sha256:7c61056e61ac89e852de05f3dc6fa51a6dd2181797bceed46aa725dd7cb2cd3b`.

Cloud Run operational references checked: [CPU allocation](https://docs.cloud.google.com/run/docs/configuring/services/cpu), [container runtime contract](https://docs.cloud.google.com/run/docs/container-contract), [multiple containers/startup order](https://docs.cloud.google.com/run/docs/configuring/services/containers).

## Edge adapter and sequenced startup

`onboarding-document` requires `ONBOARDING_SCANNER_URL` (full `/scan` URL) and `ONBOARDING_SCANNER_SECRET`. Missing configuration returns503 and never writes an unscanned image. HTTPS is required; HTTP is permitted only when `ONBOARDING_SCANNER_LOCAL=true`, Supabase's configured hostname is exactly `kong`, and the scanner hostname is on the explicit local allowlist. Redirects are disabled, the entire request/response has a60s abort deadline, and the normalized response is bounded to5MiB with exact matching image MIME/magic. Uploaded original bytes never reach Storage. Existing historical local fixture uploads are not retroactively re-scanned.

For the isolated local stack, the gateway is additionally attached to `supabase_network_armature-onboarding-local`; URL `http://armature-onboarding-scanner-gateway-1:8080/scan`. The ephemeral secrets remain outside Git. The real narrow integration command is `node tools/onboarding-scanner/check_edge.mjs` under Node22; it hard-checks API55421, creates/removes only its own synthetic user, and restores the prior enabled gate. It must run sequentially with other DB tests, not while changing migrations.

`Dockerfile.clamav` now pins the verified base digest and runs as the ClamAV user. `clamav-start.sh` runs foreground one-shot `freshclam` **to successful completion before** starting foreground `clamd`. Failed updates prevent listener startup; no background update/socket-notification race remains. The local daemon has bounded scan size/time, flags exceeded scan limits, and uses memory-backed temporary space. The composed stack passed clean/EICAR/malformed/auth smoke after this change.

This sequence is suitable for a Cloud Run sidecar startup, but does not refresh a continuously warm instance's signatures. Gateway freshness still rejects stale signatures after72h. Production must arrange monitored daily signature image refresh/revision rollout or an active-request-safe updater; a cold-start-only updater is not a long-lived refresh strategy. IAM invocation also needs a short-lived Cloud Run identity token (e.g. `X-Serverless-Authorization`) in addition to the application's bearer secret; do not make the service public to avoid that requirement.

26Sep local Edge integration: truncatedPNG422 and trailing-EICAR PNG422 each left no Storage object and no uploaded_at. Clean PNG201 created/finalized its normalized object. Test account/objects removed and previous onboarding enabled value restored. Adapter unit tests:7 passed. No real IDs used.

## Prepared Cloud Run artifacts — NOT deployed

The user explicitly deferred hosting while billing is unavailable. `cloud-run.example.yaml` and `cloudbuild.example.yaml` are review templates only. Project, region, image digests and secret version are unresolved placeholders. Proposed region `asia-south1` must be confirmed against project/service availability and data handling requirements. No cloud resources, service-account keys or IAM grants were created.

After hosting is separately resumed, the operator would create a dedicated Artifact Registry repository, runtime identity, independent invoker identity and Secret Manager bearer secret using approved project/billing. Give runtime identity only access to that secret; give the invoker only `roles/run.invoker` on this service. Do not reuse the booking-email domain-wide-delegated service account. Prefer workload identity federation for the external Supabase caller; otherwise separately assess authentication rather than creating a long-lived key by default. The current Edge adapter intentionally has no Cloud Run identity-token implementation and cannot invoke an IAM-private service yet.

Prepared build/release command sequence (not executed):

```sh
# In this directory, using the approved project and a unique reviewed tag:
gcloud builds submit --project="$SCANNER_PROJECT" --config=cloudbuild.example.yaml --substitutions="_REGION=$SCANNER_REGION,_TAG=$SCANNER_TAG" .
# Resolve each pushed image digest; replace all template placeholders and pin the
# reviewed Secret Manager version in a separate generated manifest.
gcloud run services replace /private/tmp/scanner-reviewed.yaml --project="$SCANNER_PROJECT" --region="$SCANNER_REGION"
gcloud run services add-iam-policy-binding armature-onboarding-scanner --project="$SCANNER_PROJECT" --region="$SCANNER_REGION" --member="serviceAccount:$SCANNER_INVOKER" --role=roles/run.invoker
```

No `allUsers`/`allAuthenticatedUsers` invoker binding is allowed. `ingress: all` only permits the external HTTPS network path for Supabase; IAM must still deny unauthenticated invocation. Test that anonymous invocation is denied and independent invoker plus application bearer succeeds using synthetic files. The startup probes are TCP coordination only; authorized `/health` must additionally report fresh signatures before enabling the app. Add a reviewed refresh/monitoring schedule before release; deployment templates alone do not satisfy this gate. Measure cold startup against240s probe budget and adapter60s request budget (cold-start time can exceed it); decide on retry/user messaging or warm minimum only from measurements and approved cost tradeoffs.

After consent migration004, the Edge handler checks caller-visible acceptance for the application's **current revision** and notice2026-09-26 before reading/scanning/uploading bytes. The narrow real integration additionally removes only its synthetic user's acceptance after reservation: POST403 and no Storage object, then restores acceptance and verifies scanner success/rejections. This passed against local migration004 without resetting review fixtures.
