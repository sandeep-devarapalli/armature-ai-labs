# Armature member, booking, and check-in operations

This document is the production runbook for the Armature member PWA. Supabase
is authoritative for identity, membership, safety, resources, bookings, and
attendance. Google Calendar is an operational mirror only.

## Environments

Use separate Supabase projects for preview and production. The browser receives
only the project URL and publishable key:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SITE_URL=https://armaturelab.org
VITE_MEMBER_PLATFORM_ENABLED=false
VITE_COMPONENT_REQUESTS_ENABLED=false
VITE_GOOGLE_AUTH_ENABLED=false
```

Service-role credentials, kiosk enrollment secrets, SMTP credentials, and
Google credentials belong in Supabase project secrets. Never add them to Vite
variables, browser storage, GitHub, or Cloudflare Pages environment variables
that are exposed to the client bundle.

## Public-first release mode

The initial production release publishes the React public site while keeping
transactional member features closed. Keep `VITE_MEMBER_PLATFORM_ENABLED` and
`VITE_COMPONENT_REQUESTS_ENABLED` false. Hide sign-in and action entry points;
direct visits to member, booking, check-in, kiosk, admin, inventory-custody,
locker, toolkit, and request routes must render the shared opening-soon state.

Public project pages, components, Maker Desk descriptions,
anonymous resource availability, the member directory, ecosystem map, and
Building Vision remain available. A missing Supabase URL or key is a
configuration error in production, never permission to enter demo mode.
`VITE_DEMO_MODE=true` is restricted to local and automated test builds.

Migrations `202607260001` through `202607260012` are already applied to the
linked Supabase project and are immutable. Apply all future corrections through
new migrations. A frontend rollback never rewinds database history.

## Provisioning order

1. Create an India-region Supabase preview project.
2. Link the local repository with `supabase link --project-ref <preview-ref>`.
3. Apply migrations with `supabase db push`.
4. Deploy the approved kiosk, calendar, reminder, and ICS Edge Functions. Keep
   `component-request` undeployed until its separate gate below passes.
5. Add the frontend URL and `/auth/callback` to Supabase Auth redirect URLs.
6. Configure passwordless email OTP. Before the member-platform launch,
   configure Google OAuth and set
   `VITE_GOOGLE_AUTH_ENABLED=true` only after the Google provider is working;
   otherwise the live sign-in screen keeps Google disabled and directs members
   to email OTP.
7. Configure the `avatars` public bucket and the private operational buckets
   created by the migrations.
8. Add a staff role through an audited SQL/admin operation. Never grant staff
   access through editable user metadata.
9. Seed locations and resources, then confirm operating hours, capacity,
   certification requirements, buffers, and guest rules.
10. Deploy a Cloudflare Pages preview from `dist/` and complete the test gates
    before changing production.

## Google Workspace

Use `hello@armaturelab.org` as the public inbound mailbox for information and
membership enquiries. Keep calendar operations, reminders, and transactional
booking mail on a separate identity such as `bookings@armaturelab.org`.

- Create one private Google Calendar per reservable resource.
- Store each calendar identifier in the protected calendar link table.
- Keep Google service credentials in Supabase function secrets.
- Invite the responsible member as an attendee when policy allows.
- Treat external Google edits as observations. A retry or reconciliation run
  must restore the Supabase booking state.
- Use the generated ICS endpoint for members who do not use Google Calendar.

Recommended function secrets:

```text
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_WORKSPACE_SUBJECT
ARMATURE_JOB_SECRET
GOOGLE_SEND_UPDATES
REMINDER_WEBHOOK_URL
REMINDER_WEBHOOK_SECRET
REMINDER_FROM
ALLOWED_ORIGINS
```

## Auth and email

Enable Google OAuth and email OTP in Supabase Auth. Production OTP mail should
use a dedicated Armature Google Workspace sender through custom SMTP.

Members can enroll a TOTP authenticator from `/profile`. Operations actions
that alter attendance or kiosk enrollment require the resulting `aal2` session.
Public avatars upload to `{auth.uid()}/avatar` in the `avatars` bucket; the
bucket policy permits members to write only inside their own folder.

The approved redirect origins should contain only controlled Armature domains
and explicit local development URLs. Avoid wildcard production redirects.

Google sign-in remains disabled during the public-first release. Enable the
provider and `VITE_GOOGLE_AUTH_ENABLED` only after callback, account-linking,
error, and logout flows pass against the production Auth configuration.

## Component requests

Keep `VITE_COMPONENT_REQUESTS_ENABLED=false` and do not deploy the public
`component-request` function until all of these secrets and controls exist:

```text
APP_ORIGIN=https://armaturelab.org
ALLOWED_ORIGINS=https://armaturelab.org
TURNSTILE_SECRET_KEY
COMPONENT_REQUEST_FROM_EMAIL
COMPONENT_REQUEST_EMAIL_PROVIDER
RESEND_API_KEY or POSTMARK_SERVER_TOKEN
COMPONENT_REQUEST_RATE_LIMIT
```

The browser receives only `VITE_TURNSTILE_SITE_KEY`. Before enabling the flow,
test invalid, expired, replayed, and duplicate verification tokens; Turnstile
failure; email-provider failure; rate limiting; and requester-email privacy.

## Inventory and Maker Desk operations

Component inventory, lockers, consumables, and toolkit custody remain
non-transactional in the public-first release. Before enabling them, staff must
count and label physical stock, assign storage locations, create serialized
asset or toolkit tags, verify deposits and pricing, and test attendance-exit
blocking with audited overrides. Schedule private evidence deletion from
Storage and database rows using each record's `retain_until` value.

## Kiosk enrollment

Kiosks are staff-enrolled devices. Enrollment is a two-stage process:

1. A staff member creates a short-lived, one-use enrollment challenge.
2. The kiosk creates a device key and redeems the challenge on site.

Each attendance request includes the device identifier, timestamp, nonce,
request body hash, and device signature. The backend rejects unknown,
revoked, expired, replayed, or incorrectly signed requests.

Member QR codes contain a short-lived check-in intent, never a reusable member
credential. They expire after 60 seconds and may be redeemed once. Booking
eligibility, membership state, certifications, and the arrival window are
checked again during redemption.

## Calendar outbox

Confirmed booking writes enqueue idempotent create, update, or cancel messages.
The calendar sync function leases messages, performs the provider operation,
records the provider event identifier, and marks success or schedules a retry.

Monitor:

- oldest pending outbox item
- retries and terminal failures
- provider event deletion or drift
- bookings without calendar links
- duplicate delivery attempts

No calendar failure may roll back or silently alter a confirmed Supabase
booking.

## Staff controls

The protected operations routes expose the audited backend boundaries:

- `/admin/members`: decide applications and issue safety certifications.
- `/admin/resources`: open or close resources, replace base weekday hours, and
  create maintenance, closure, or staff-hold blocks.
- `/admin/bookings`: cancel confirmed reservations or mark elapsed bookings as
  no-show/completed with a required reason.
- `/admin/attendance`: review attendance and perform MFA-gated staff closure.
- `/admin/integrations`: inspect calendar delivery state and enroll kiosks.

Member booking details expose `reschedule_booking`; Postgres rechecks current
membership, certification, operating hours, horizon, and overlap constraints
before moving the reservation.

## Release gates

Before production promotion:

- Build from an exact reviewed and merged `main` commit with Node.js 22 and
  `npm ci`; rebuild production after Playwright so `dist/` cannot contain the
  demo E2E build.
- Reject production builds with `VITE_DEMO_MODE=true`, missing Supabase public
  values, or enabled member/request flags before their operational gates pass.
- SQL/RLS persona tests pass.
- Concurrent overlapping bookings prove exactly one winner.
- QR expiry, replay, wrong-kiosk, and duplicate-scan tests pass.
- Calendar create/update/cancel/retry tests pass.
- Authenticated and transactional responses are absent from Cache Storage.
- Light, dark, and sepia pass desktop and 390px visual checks.
- Signup, approval, booking, cancellation, check-in/out, kiosk, and staff flows
  pass in Playwright.
- Cloudflare preview returns the SPA shell for direct route navigation.
- `/sw.js` revalidates, the legacy service worker hands over cleanly, and no
  authenticated or transactional response enters Cache Storage.
- Every `public/project-images/` asset has a current provenance row in
  `BRAND-ASSETS.md`; entries marked `Verification required` receive explicit
  maintainer review before promotion.
- Supabase logs and integration outbox show no unexplained failures.

Promote the verified Cloudflare Pages artifact to `armaturelab.org`, purge stale
cache, and smoke-test `/`, `/projects`, project details, `/components`,
`/ecosystem`, `/building-vision`, opening-soon route guards, all three themes,
and 390px layouts. Keep the previous deployment available until these checks
and Supabase logs remain clean.

## Rollback

Keep the previous Cloudflare Pages deployment available until the new release
has passed live smoke checks. A frontend rollback does not revert database
migrations. Database changes must remain backward compatible until the previous
frontend is no longer a supported rollback target.
