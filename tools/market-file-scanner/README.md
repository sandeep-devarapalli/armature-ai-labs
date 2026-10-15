# Engineering attachment scanner

Separate service from the government-ID/profile-photo scanner. No model, OCR or document extraction service is involved. Only synthetic fixtures are used for verification.

Build from repository root:

```
docker build --platform linux/amd64 -f tools/market-file-scanner/Dockerfile -t MARKET_GATEWAY_IMAGE .
docker build --platform linux/amd64 -f tools/market-file-scanner/Dockerfile.clamav -t MARKET_CLAMAV_IMAGE .
```

Use `cloud-run.example.yaml` as the reviewed two-container service specification. Replace image placeholders with immutable digests, project/region, and the independent Secret Manager reference. Keep concurrency 1, gateway 1 GiB, antivirus 3 GiB, and maxScale 2. The gateway receives only authenticated, digest-bound requests. Keep Cloud Run IAM private. Grant the existing scanner-invoker service account run.invoker on this new service only. The Edge Function mints an identity token through the shared scannerIdentityToken helper and sends X-Serverless-Authorization alongside the independent bearer secret. MARKET_FILE_SCANNER_GOOGLE_CREDENTIALS_JSON may be configured separately or fall back to the existing ONBOARDING_SCANNER_GOOGLE_CREDENTIALS_JSON; credentials are mandatory for run.app destinations. Never reuse the ID-scanner bearer credential.

The antivirus startup script updates signatures, then starts clamd; health fails when signatures are over 72 hours old. The separate startup script runs freshclam continuously with twelve checks per day and NotifyClamd reloads; it exits if either scanner or refresher stops. Cloud Run may suspend background CPU while idle, so a resumed instance still fails closed if signatures are stale; a new instance refreshes before its scanner starts. No additional maintenance IAM account is required. Confirm actual authenticated `/health`, a valid PDF/image/CAD, ZIP, EICAR rejection, content mismatch, archive bomb, 50 MB boundary and failure quarantine before release. Set `MARKET_FILE_SCANNER_URL` to the HTTPS `/scan` route and `MARKET_FILE_SCANNER_SECRET` privately in Supabase; only then enable `MARKET_FILES_ENABLED`.

Parser acceptance is conservative. PDF scripts/actions/embedded files/encryption are rejected. OOXML macros, external relationships and embedded objects are rejected. ZIP entries have bounded count, nesting, inflated size and compression ratio and may contain only supported data formats. Images reuse strict structural validation (5 MB normalized image ceiling); other files have a 50 MB upload ceiling. Parser subprocess has a 512 MiB address-space limit, 15-second CPU limit and 20-second wall timeout. Antivirus failure never returns clean. No executable or HTML preview is supported.

`market-message-maintenance` needs a separate job secret and `MARKET_FILE_CLEANUP_ENABLED=true`; schedule daily. It deletes rejected and quarantined-over-one-day objects, not clean conversation files. Quarantine rejection is committed before Storage removal, so scanning cannot publish a file concurrently selected for deletion. Failed deletions stay eligible for retry.

Local evidence on 15 October: five format suites passed; real HTTP+fresh ClamAV passed seven cases including valid STEP/text, disguised HTML, nested script ZIP, EICAR and 6,291,450-byte text and the exact 52,428,800-byte boundary. The 50 MB scan took 1.225 seconds in this local run; this is not a hosted performance guarantee. Independent private Storage check verified upload, anonymous denial, signed download and actual expiry. Hosted deployment and signed-link integration were subsequently verified; see the evidence below.

Pinned PDF parser version was checked against https://pypi.org/project/pypdf/ (6.20.1, released 12 October 2026).

The production gateway uses Hypercorn h2c with Cloud Run end-to-end HTTP/2; HTTP/1 Cloud Run requests are capped at 32 MiB. An actual hosted transfer exposed the earlier 20-second upload deadline at 15.6 MB, so the gateway now permits a bounded 105-second body read with one concurrent request. The service deadline remains 120 seconds; parser limits are unchanged. The Edge upload reader permits 105 seconds and its scanner call 120 seconds. A client must allow the complete upload-and-scan interval.

Hosted scanner verification on 15 October passed eleven checks on revision `armature-market-file-scanner-00004-r4v`: private IAM, independent bearer, fresh antivirus, valid STEP/PNG/PDF/ZIP, digest mismatch, EICAR and disguised HTML rejection, and exact 52,428,800-byte upload (19.402 seconds in the final IPv4 run). Gateway digest `sha256:925dfb42030e8247e4bd3befe3a0499918c947a068a3a03824811c73b65eba7c`; antivirus digest `sha256:2f3303ca3415e42c8218657efe961c9df961c5ce7b38eee0ba00b743bfb40481`. Evidence: `docs/release-evidence/talent-marketplace-2026-10-15/scanner-hosted.json`. Direct scanner success does not establish the Edge upload capacity; the separate Edge integration subsequently passed at the application’s decimal 50 MB limit, including private signed-link expiry and block checks. See `files-hosted.json` alongside the scanner evidence.
