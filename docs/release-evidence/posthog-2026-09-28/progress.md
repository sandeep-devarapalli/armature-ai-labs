# PostHog setup — 28 September 2026

## Authorized scope
Public-page analytics and anonymous registration step counts. Explicit optional browser consent; no replay, autocapture, identity linkage, form values or document contents. Payments and other release gates unchanged.

## Project and configuration
- Chrome Armature profile (browser 2), signed-in PostHog account hello@armatureailabs.com.
- Existing project 632827, US Cloud. Public write-only token stored as GitHub variable VITE_POSTHOG_KEY; not a personal API credential.
- Project discard-IP setting enabled and verified after reload. Replay off. Autocapture switched off; verify persistence during final check.
- SDK 1.434.16 pinned. Consent only persists preference; measurement identity is memory-only. before_send reconstructs events from allowed fields. Private paths never create pageview events. Registration enum counts successful details save, photo upload, ID upload and final submission, once per milestone per browser runtime/consent period. These are not authoritative membership totals or persistent cross-device funnels.
- Consent withdrawal retires SDK transport before shutdown, because this SDK can otherwise flush/retry queued requests after opt-out. Internal transport compatibility is protected by pinned-version real-SDK regression tests; rerun these for any upgrade.

## Evidence before release
- Node 22.23.2; npm test: 41 files, 355 tests passed.
- npm run build with analytics enabled: TypeScript, build, artifact and SEO checks (156 public pages).
- npm run audit:production: clean; npm run audit:all run.
- CUA Chrome preview at 127.0.0.1:4355: dark-theme consent banner, settings dialog, opt-in and withdrawal inspected.
- One local preview pageview received and inspected in PostHog Activity. Properties: canonical homepage URL/path, temporary distinct_id, geoIP disabled, person-profile processing false, token and server timestamps. No account/person fields. This test event is not a production visitor.
- Consent tests cover declined/default-off, withdrawal/cross-tab preference and route exclusion. Core tests intercept the actual SDK payload and cover stripped URL query/hash, restricted enums, invalid configuration, init races and failed-request retry withdrawal.

## Release
Pending PR checks, squash merge, production workflow and live event read-back. No database migration required.

## Production preflight correction
PR #100 merged as 5e6c5c6d4ecdd70d79c505307f39edcf1f4d4fb0 after required checks passed. Main workflow 36402075124 then stopped before deployment: the analytics-enabled mobile fixture revealed that the fixed consent banner covered Building Vision controls. The follow-up puts mobile consent in normal document flow before main; visitors can use the site without deciding. Analytics-enabled production browser tests now run before merge using a synthetic token, with an explicit undecided-consent regression. Existing service-worker coverage remains enabled.

Project display name is Armature AI Labs; Asia/Kolkata reporting timezone and disabled autocapture are verified. Dashboard 2143789 provides pageviews and documents the four registration_step values; no fake membership submission was sent. Final live read-back remains required after the corrected release.
