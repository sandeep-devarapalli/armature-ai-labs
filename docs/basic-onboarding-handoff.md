# Basic onboarding — local backend foundation

26 September 2026. Branch `codex/secure-basic-onboarding`, based on preview commit `8643395`. This is a local synthetic-data backend implementation, not a member launch. The existing `/membership-preview` still uses in-memory fixtures. The separate development-only `/onboarding-local` page now connects to these endpoints with synthetic local accounts.

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

1. Private ClamAV scanning, full image decoding and metadata stripping are implemented and tested locally and on the private Cloud Run service after the owner resumed hosting. See the scanner README and progress note for exact revisions, IAM and synthetic evidence. Production Supabase identity integration and monitored signature maintenance must be fully verified before intake opens. Uploads fail closed without the scanner and current-revision notice acceptance. No real IDs or PDFs are accepted in this review.
2. Confirm guardian receiving mailbox and required email details; define evidence retention/access review and staff operational procedures. The code cannot verify ownership of the supplied LinkedIn URL or authenticity of an ID.
3. Before any real upload, deploy and monitor a recurring retention runner, independent of registration enablement. A local process scheduler is available and running for synthetic review; no production scheduler or persistent OS service is installed. Read access stops at expiry, but physical deletion happens on the next successful run; failures need alerts/reconciliation. Define backup/snapshot, logs, downloaded-copy and derivative handling. The local Storage API test proves original-object deletion only, not purge from provider backups or staff downloads.
4. Connect verified basic membership to paid access/check-in with server-side entitlements. Existing production membership/booking behavior is unchanged; this additive foundation is not the finished pass/equipment system.
5. Keep real prices, closure calendar, unresolved refund details and payment setup pending. Razorpay, including test mode, remains deferred during the LLP rename. No live migrations, deployment, email enablement or paid preview infrastructure were performed.

## Review

Independent source review found and prompted fixes for reservation-based retention timing, deletion starvation, a missing database gate and punctuation-only phone validation. It found no remaining concrete cross-user file access or self-approval bypass in the revised implementation. Review is not a production security certification. Runtime results and commit identifiers are recorded in `website-work-progress-2026-09-26.md`.


## Connected review and corrections — 26 September update

Open `http://127.0.0.1:4341/onboarding-local`. This uses a separate memory-only auth client, fixed to local API55421 and a Vite development/demo-only route. Supply only `VITE_ONBOARDING_LOCAL_ANON_KEY` plus `VITE_DEMO_MODE=true` when starting Vite; service/job keys never enter the client. Local sample login instructions are `/private/tmp/armature-onboarding-local/review-logins.txt`, and a synthetic PNG is beside them. Refreshing the browser requires signing in again. The original preview on4340 is preserved.

The UI supports actual local registration, private image upload/viewing, status refresh, independent staff approval/rejection and guardian evidence. Staff can request corrections for pending/rejected applications with a reason. All prior document copies expire immediately and enter cleanup. The owner resubmits validated details and fresh images. An incremented revision prevents stale staff screens from deciding the newer application; a new minor approval requires explicit guardian evidence again. Previous review/resubmission records remain read-only to clients. Approved basic membership is not reopened by this flow and still grants no paid access.

The local monitor runs with `scripts/run-onboarding-retention-local.mjs --status-file /private/tmp/armature-onboarding-local/retention-status.json --interval-ms 60000` and ARMATURE_JOB_SECRET in its process environment. The script defaults to five minutes; this review instance uses one minute. It refuses non-local URLs, drains bounded batches, prevents overlapping iterations, and writes a private atomic heartbeat/count/failure file. `node scripts/run-onboarding-retention-local.mjs --status --status-file ...` recalculates stale health (ten minutes) and exits nonzero when unhealthy; three consecutive failures also set alert. Alerts are local status/terminal output only, not email or an attended production monitor. Ctrl-C stops the process; it does not restart after a computer/app restart. The Supabase/function/Vite processes must also remain running. Real production cleanup still needs a managed scheduler, monitoring owner, backup policy and authorization.

Verification commands, all Node22:

- `npm test -- --run` — 131 passed.
- `node --test tests/scripts/onboarding-retention.node.mjs` — 7 passed (network/error sanitization, batches, overlap, stale detection and recovery). Filename intentionally differs from Vitest's pattern.
- `supabase test db --workdir /private/tmp/armature-onboarding-local` — 285 assertions across13 suites passed, including29 correction checks. Run while the local gate is off and other fixture suites are stopped. Database and browser fixtures mutate the same local gate and must run sequentially.
- `node scripts/test-onboarding-local.mjs` with captured local credentials —36 actual-storage checks passed.
- `npx playwright test --config playwright.onboarding-local.config.ts` with local service key in the Node test process —4 adult/minor desktop/mobile correction-to-approval flows passed. User/API secrets are never stored in test source. UI image views, guardian fields, status/review history, three themes and no horizontal overflow/page exceptions verified. No Browser skill was available; existing Playwright tests were used, followed by in-app browser readback and console inspection.
- `npm run build` and `npx playwright test tests/frontend/e2e/public-release-gates.spec.ts --project=chromium --project=mobile` — build/artifacts passed;13 browser checks passed/1 intentional skip. `/onboarding-local` is absent in production just like `/membership-preview`.

Real local monitor probes also verified a denied job credential produces unhealthy status, a valid retry recovers, and the continuously running scheduler physically deleted a synthetic expired object while recording deletion. This is local-only evidence, not a claim about production scheduling/backups. Four synthetic preview items remain: applicant, reviewer and two unexpired sample images, plus the expired reservation's deletion record. No real membership data or outbound messages were used.

Evidence in `/private/tmp/armature-onboarding-local`: `ui-tests.log`, `db-corrections-tests.log`, `storage-current.log`, `frontend-current.log`, `build-current.log`, `release-current.log`, `retention-status.json`. Screenshots: `/private/tmp/armature-onboarding-panel-chromium.png` and `/private/tmp/armature-onboarding-panel-mobile.png`; full-page and reviewer variants are adjacent. Commit/review tracking is in the main progress note.

## Hosted cleanup preparation (undeployed)

Scanner hosting has resumed; managed retention is not yet deployed. Keep real intake disabled. The existing local retention process is not a production schedule. Use a dedicated scheduled runner for the onboarding-retention endpoint, a separate restricted runtime identity and Secret Manager credentials. Run every five minutes, drain bounded batches, fail the job if any deletion fails, and record only aggregate counts and timestamps in operational logs. Do not log names, document paths, tokens or image data.

Before enabling intake, configure both failed-execution alerts and a missed-success heartbeat alert, nominate the operator who receives them, and verify forced-failure and recovery delivery. Use synthetic expired objects to verify actual Storage deletion, the audit marker, repeat-run idempotency and cleanup while intake is disabled. A successful HTTP invocation alone is insufficient. Backup/snapshot retention and staff-downloaded copies need their own documented policy; object deletion does not prove those copies are gone.

The scanner service and its maintenance job are separate from retention. No production retention process is deployed. The public privacy page is live, but real intake remains closed until the launch gates above pass.

## Independent basic-registration release

The source audit confirms migrations202609260002/003/004 depend on core auth/staff/storage, not the team migration. Prepare a focused release from currentmain instead of merging the entire PR73→78→79 stack. Bring the shared age helper with the onboarding components. Inventory live migrations and apply only the reviewed onboarding subset with database and function gates false; never blindly dbpush this stacked checkout.

Before opening: verify real-domain email login/callback and an independent staff reviewer; document the guardian receiving mailbox/procedure; finalize retained verification/history, guardian evidence, provider backups/logs and staff-copy handling. Amend the planned-intake privacy copy and immutable notice version together. Add basic-on/paid-off browser checks before enabling VITE_BASIC_ONBOARDING_ENABLED; retain paid/team/booking-worker gates false. Existing public-gate tests intentionally prove onboarding stays closed.

## Confirmed operator procedures

Staff review IDs only inside the protected portal, without downloading or retaining copies. After 30-day upload deletion retain only the verification result. Guardians of applicants aged16–17 email hello@armatureailabs.com with the member name and registered email, guardian name/relationship and explicit permission. Owner confirmed both on26September2026. Provider backup and guardian-message retention still need their own documented procedure.

Provider backup check,26September2026: the live project reports seven completed daily
physical database backups and PITR disabled. Supabase documents that database backups
contain Storage metadata, not uploaded objects, and restoring a database backup does
not restore a deleted Storage object: https://supabase.com/docs/guides/platform/backups .
This establishes the database-backup boundary, not a verified provider-wide erasure
SLA. Restore procedures must reconcile metadata with actual Storage objects and keep
intake disabled until access/retention checks pass again.

## Approved membership reviewers

The owner authorised both hello@armatureailabs.com and sandeep@armatureailabs.com
as membership-approval admins on26September2026. A fresh exact-email live auth
lookup found neither website account. Both must complete verified website sign-in
before admin access can be granted to their actual auth user IDs. Do not create
accounts or grant roles from email aliases alone; do not grant super_admin.
The independent-review rule still prohibits approving one's own application.

Reviewer bootstrap update,26September2026: following explicit owner confirmation,
the sandeep@ website identity was created through the supported Auth Admin API
with email_confirm=false. The supplied member details were saved to a private
profile (is_public=false); contact details are intentionally omitted from Git.
Read-back confirmed unverified email, pending membership and no staff role.
No sign-in/invitation email was sent because the production callback remains gated.
After verified sign-in, assign the previously authorised ordinary admin role;
do not bypass identity review or activate paid access. hello@ remains uncreated.
This supersedes the earlier zero-account observation for sandeep@ only.

## Google and email sign-in setup —26September2026

Google Auth Platform created for Armature AI Labs in armature-booking-integration,
external/testing, support/developer hello@. Owner explicitly approved policy
acceptance and the sign-in-only OAuth web client. Client ID:
863263629225-f59eddpr7vvo0ij7pi07uca1hea1ag5p.apps.googleusercontent.com .
Origin https://armatureailabs.com; callback
https://uxfhdfagrmaeyuaipaar.supabase.co/auth/v1/callback .
Supabase Google provider enabled and matching client ID read back through the
Management API; credential never committed and temporary secret file deleted.
Live authorization-start check returned302 to accounts.google.com with expected
client/callback and email/profile scopes. This is not end-to-end sign-in proof.
Frontend basic/Google flags stay false; Google app remains testing, with no test
users configured yet. No Gmail/Calendar scopes or delegated identities reused.

Supabase email provider enabled, signup allowed, confirmation required. SMTP is
not configured. Owner chose a separate transactional service rather than Workspace
SMTP. Resend setup opened for owner signup; no paid plan, credential, domain change
or message sent. Needs verified sending domain, restricted sending key, SMTP
configuration, actual sign-in email/callback verification and provider limits review.
Provider guide: https://resend.com/docs/send-with-supabase-smtp .

Google sign-in returns the Workspace primary hello@ identity. The sandeep@ alias
can use email sign-in; never automatically merge or grant admin based on alias
assumptions. Both reviewer emails are owner-authorised, but grant only after
verified account identity.

Code fixes: callback provider errors take precedence over cached sessions and
session promise failures show recovery; Google/email requests share pending state.
Node22:144unit tests passed,14focused auth tests passed,build/154SEO passed,
2desktop/mobile basic-on/paid-off checks passed. First full-suite attempt hit
managed-worktree Vite cache sandbox EPERM; rerun with filesystem permission passed.
No live login, public launch, admin grant or payment activation performed.

## Resend domain preparation —26September2026

Owner completed Resend signup; armatureailabs team verified in dashboard. Created
mail.armatureailabs.com (domain ID ac65aa50-729f-4844-ad44-b512b80b8db2), Tokyo
ap-northeast-1, sending only; receiving remains off. It is not DNS-verified yet.
Exact dashboard DNS requirements (names relative to armatureailabs.com):

- TXT resend._domainkey.mail: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDiTgabGFvesC3JxPsHWvdSdGhj9iMKHnpBwr2x0mNVIFOoHUIDFz3KH9sY/MmVk4cA46ThOzulYN4UtsYCG4Yx9GR9MWHaS75Nw8yPd2CUkr5Su7ZoIqhy5zfaahqQHWYP18Uo/hYbqkTMyt+vzNhfY8opp0UH0SrYbOANF1RsdwIDAQAB
- CNAME rsend.mail: rsend-apne1.forge.rmta.net, DNS-only
- CNAME send.mail: send.forge.rmta.net, DNS-only

Do not add the dashboard's optional root _dmarc p=none suggestion without reviewing
the domain-wide policy. No DNS records were changed. Public lookup confirms
Cloudflare nameservers and root MX1smtp.google.com; required new records absent.
Cloudflare CLI identity sandeep.devarapalli@live.com has zone-read but no DNS-write
scope. Work Chrome Cloudflare is signed out; owner login requested in open tab.
Do not broaden CLI credentials merely to avoid this handoff.

No Resend key created: Sending access selector offered only All domains while
verification is unfinished. Create a domain-restricted sending key after verification,
then store it securely in Supabase SMTP. Disable click/open tracking before auth
mail tests (creation form showed click tracking checked but disabled; inspect final
domain settings). Preserve existing Workspace routing, do not enable receiving,
and do not mark email sign-in ready until delivery and callback tests succeed.
Reference for the new CNAME-style requirements: https://resend.com/docs/dashboard/domains/manage-domains .

### Browser access correction — 26 September 2026

Owner directed Cloudflare and Supabase administration to the Sandeep Chrome profile (sandeep.devarapalli@gmail.com). Existing GitHub sign-in succeeded for both. Cloudflare shows the correct armatureailabs.com zone under the existing live.com account; Supabase shows armature-lab / uxfhdfagrmaeyuaipaar. The DNS zone contains six records, including Workspace MX/SPF/DKIM. Prepared the Resend DKIM form without saving; explicit browser-time approval for the three sending-subdomain records is pending. No DNS changes, Resend key creation, or SMTP configuration yet.

### Resend DNS applied — 26 September 2026

Owner approved all three DNS records. At turn start the DKIM TXT was already present; verified its exact value and added the two CNAME records with DNS-only/Auto TTL. Public dig queries resolve all three expected values. Resend reports DNS verified and return-path Verified; overall domain, DKIM and regional sending CNAME remain Pending during provider verification. Existing Google Workspace MX/SPF/DKIM were preserved. Tracking configuration has no tracking subdomain configured; no tracking domain was added. API key creation currently offers only All domains, so cancelled without creating a broad key. Next approval required at the browser action: create a Sending access key scoped to mail.armatureailabs.com and store it in Supabase SMTP. SMTP and public registration remain unchanged; no messages sent.

### Initial DMARC record — 26 September 2026

Owner requested DMARC to prevent spoofing. Added a single TXT at _dmarc.armatureailabs.com: `v=DMARC1; p=none; rua=mailto:hello@armatureailabs.com`, TTL Auto. Confirmed exact value through authoritative DNS (dante.ns.cloudflare.com) and Cloudflare UI. This is monitoring only, not anti-spoofing enforcement. Follow Google staged rollout guidance (https://support.google.com/a/answer/10032473): inspect aggregate reports and verify aligned Workspace and Resend deliveries before progressing to quarantine/reject. Resend authentication SMTP delivery is not yet tested. No forensic reports or third-party reporting recipient configured; existing MX/SPF/DKIM unchanged. Remaining requirement: enforcement must not be described as complete.

### Resend SMTP connected — 26 September 2026

Owner explicitly approved restricted key creation and Supabase storage. Resend domain mail.armatureailabs.com now Verified (DKIM and both CNAME records Verified). Created key b2b40b41-168c-4224-a4b8-738e0c6e7c39 with Sending access limited to that domain. Stored secret through Supabase Management API; no secret retained in repository or chat. SMTP host smtp.resend.com, port 465, user resend, sender Armature AI Labs <no-reply@mail.armatureailabs.com>. Initial PATCH with numeric port returned HTTP 400; string port succeeded. GET read-back matched all non-secret settings; email autoconfirm remains false and Google provider remains enabled. TLS SMTP login returned 235 without sending a message. Restricted temporary secret file deleted and browser one-time secret view closed. This proves configuration and credential authentication only, not recipient delivery or end-to-end sign-in. Frontend gates unchanged. Next: controlled auth delivery/callback test, Google test-user flow, then basic-registration release checks. DMARC remains monitoring-only until delivery alignment/reports are checked.

### Real authentication tests — 26 September 2026

Started Node22 local preview on localhost:5173 with live Supabase Auth, basic onboarding/Google enabled locally only and paid/component gates false. First confirmation email to the owner arrived in Workspace inbox; Gmail Show original reported SPF PASS, DKIM PASS for mail.armatureailabs.com, DMARC PASS. Found callback mismatch: existing allowlist paths omitted the next query parameter, so Supabase substituted site_url. Added only exact http://localhost:5173/auth/callback?next=%2Fonboarding and https://armatureailabs.com/auth/callback?next=%2Fonboarding, preserving prior entries. Second email contained the correct local callback; clicked owner confirmation and observed signed-in sandeep@armatureailabs.com at /onboarding. Signed out, then Google OAuth with hello@armatureailabs.com requested name/profile picture/email only and returned successfully to /onboarding signed in as hello@. These remain separate identities; no admin roles or paid membership granted.

Onboarding still fails on missing public.basic_onboarding_applications in live schema: expected release blocker, not a completed registration test. No application or ID uploaded. Public registration stays gated. Evidence screenshots /private/tmp/armature-email-auth-tested.png and /private/tmp/armature-google-auth-tested.png. Google consent currently displays the Supabase project hostname rather than Armature brand; branding/public audience readiness must be checked before public release. Inbox also displayed scanner-signature-refresh failure alerts (21:42) and missing-success alert (21:38); not yet investigated, so verify current maintenance job health before allowing ID uploads. DMARC enforcement still requires aggregate-report review and Workspace outgoing alignment evidence.
