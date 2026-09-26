# Basic onboarding — local backend foundation

26 September 2026. Branch `codex/secure-basic-onboarding`, based on preview commit `8643395`. This is a local synthetic-data backend implementation, not a member launch. The existing `/membership-preview` still uses in-memory fixtures; it is not connected to these new endpoints.

## Implemented

- Separate free basic application: verified account email, name, phone with at least seven digits, personal LinkedIn URL and minimum age 16 using the India date. Authenticated applicants cannot edit identity or approval state directly. Basic approval never activates the existing paid `memberships` row.
- Private `onboarding-documents` bucket, PNG/JPEG only, maximum 5 MiB. One active reservation each for a photo and a government ID (PAN/Aadhaar/passport). Random object names contain no applicant name or ID number. No authenticated direct Storage permissions or public URLs.
- `onboarding-document` authenticates each upload/download; metadata lookup uses the caller's RLS permissions. Only the owner uploads; owner/admin/super_admin can download. Downloads are attachments with no-store and nosniff, not reusable signed links. Originals cannot be overwritten.
- Successful upload finalization records `storage.objects.created_at` and sets expiry 30 days later. Abandoned reservations expire after 30 days. Approval requires both actual unexpired, finalized objects. Finalization and staff decisions lock the same application before changing state.
- Independent admin review records a permanent decision. For a minor, approval additionally requires guardian sender email, a message reference and past receipt timestamp. This is a staff attestation that the guardian's permission email was reviewed; it is not an automated mailbox check.
- `onboarding-retention` requires a job secret. It claims at most 100 expired records, deletes actual objects through the Storage API, then records deletion only if the object is absent. Failed/crashed attempts become eligible after five minutes; newer records are not blocked behind failed records. Verification outcomes survive document cleanup. Late objects on previously deleted reservations remain eligible for cleanup.
- Database `onboarding_settings.enabled` defaults false and is service-only to change. Document endpoint also requires `ONBOARDING_ENABLED=true`. Retention has its separate `ONBOARDING_RETENTION_ENABLED=true` flag so closing registration need not stop cleanup. Nothing is enabled in production.

## Reproduction

Use Node22 and Docker. The dedicated stack is `/private/tmp/armature-onboarding-local`, project ID `armature-onboarding-local`, API `http://127.0.0.1:55421`, database55422. It was built by copying this branch's migrations, tests, functions and seed into a new local directory, changing config project_id and ports5432x to5542x. No linked project reference was copied. Never use `--linked` here or substitute the live database.

```
supabase db reset --local --workdir /private/tmp/armature-onboarding-local
supabase test db --workdir /private/tmp/armature-onboarding-local
supabase functions serve --workdir /private/tmp/armature-onboarding-local --env-file /private/tmp/armature-onboarding-local/functions.env
```

The untracked, mode0600 function environment contains a random local ARMATURE_JOB_SECRET plus ONBOARDING_ENABLED=true and ONBOARDING_RETENTION_ENABLED=true. Do not print or commit credentials. Local Supabase CLI services bind on network interfaces by default; use only synthetic data and stop the test stack when finished.

Run `scripts/test-onboarding-local.mjs` under Node22 with ONBOARDING_LOCAL_URL exactly `http://127.0.0.1:55421`, ONBOARDING_LOCAL_ANON_KEY and ONBOARDING_LOCAL_SERVICE_KEY from `supabase status --workdir /private/tmp/armature-onboarding-local -o json`, and the local ARMATURE_JOB_SECRET. Pass captured values directly into a child process environment, without printing them. The script refuses other URLs, creates confirmed synthetic accounts and one-pixel PNGs, verifies default-off state, temporarily enables local onboarding, tests the real endpoints, and deletes its synthetic fixtures and disables onboarding in `finally`. Its reviewer fixture uses only the fixed local Docker database because service-role API writes to staff_roles are intentionally unavailable. It does not send mail.

Existing checks: `npm test -- --run`, `npm run build`, and `npx playwright test tests/frontend/e2e/public-release-gates.spec.ts --project=chromium --project=mobile`.

## Required next steps before member use

1. Connect a gated registration/status screen and authenticated staff-review UI. Current UI preview remains a simulation; there is no production registration or notification workflow in this change.
2. Add an audited correction/reupload path. This first version locks submissions; rejected applicants cannot resubmit and a wrong image cannot be replaced before its slot expires. Do not enable real intake with this limitation.
3. Image checks currently validate MIME, size and signature, not complete decoding or malware. Add content decoding/scanning and define handling of invalid images before real IDs. No PDF or thumbnail generation is included.
4. Confirm guardian receiving mailbox and required email details; define evidence retention/access review and staff operational procedures. The code cannot verify ownership of the supplied LinkedIn URL or authenticity of an ID.
5. Before any real upload, deploy and monitor a recurring retention runner, independent of registration enablement. No scheduler was installed by this change. Read access stops at expiry, but physical deletion happens on the next successful run; failures need alerts/reconciliation. Define backup/snapshot, logs, downloaded-copy and derivative handling. The local Storage API test proves original-object deletion only, not purge from provider backups or staff downloads.
6. Connect verified basic membership to paid access/check-in with server-side entitlements. Existing production membership/booking behavior is unchanged; this additive foundation is not the finished pass/equipment system.
7. Keep real prices, closure calendar, unresolved refund details and payment setup pending. Razorpay, including test mode, remains deferred during the LLP rename. No live migrations, deployment, email enablement or paid preview infrastructure were performed.

## Review

Independent source review found and prompted fixes for reservation-based retention timing, deletion starvation, a missing database gate and punctuation-only phone validation. It found no remaining concrete cross-user file access or self-approval bypass in the revised implementation. Review is not a production security certification. Runtime results and commit identifiers are recorded in `website-work-progress-2026-09-26.md`.
