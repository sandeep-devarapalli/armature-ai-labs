# Armature AI Labs Supabase Backend

This directory is the authoritative backend for Armature AI Labs membership, resource
booking, attendance, and operational calendar mirroring.

## Security Model

- Every table exposed through `public` has RLS enabled.
- Anonymous access is limited to `public_member_profiles`,
  `public_resources`, `public_resource_hours`,
  `public_resource_certifications`, and `list_availability`.
- Approved public profiles never expose email, phone, emergency contact,
  certifications, bookings, or attendance.
- Staff authority comes only from `staff_roles`. User metadata and profile
  fields cannot grant privileges.
- Member writes that affect membership, booking, certification, check-in, or
  attendance use security-definer RPCs with a fixed empty `search_path`.
- Exclusive bookings and resource blocks share `resource_reservations`. Its
  GiST exclusion constraint rejects overlapping `[start,end)` ranges at the
  database layer, including concurrent requests.
- Kiosk QR tokens are random, stored only as SHA-256 hashes, expire after 60
  seconds, and are redeemed once.
- Kiosk scan requests require an enrolled P-256 device key, a signature, a
  timestamp within 30 seconds, and a unique nonce.
- Google and service-role credentials are Edge Function secrets. No credential
  is stored in a public table or returned to a client.

## Migrations

- `202607260001_core_schema.sql`: enums, tables, indexes, constraints, triggers.
- `202607260002_security_and_views.sql`: RLS, safe views, grants, role helpers.
- `202607260003_atomic_rpcs.sql`: required member, staff, booking, and check-in
  RPCs plus internal outbox and kiosk operations.
- `202607260004_storage_and_maintenance.sql`: Storage policies, immutable
  audit events, reminders, no-show handling, auto-close, and worker recovery.
- `202607260005_public_resource_zone.sql`: safe public projection of each
  resource's floor zone.
- `202607260006_operations_controls.sql`: audited weekly-hours updates and
  staff booking cancellation, completion, and no-show controls.
- `202607260007_component_inventory.sql`: component catalog, offers, requests,
  inventory locations, checkout, cabinet events, RLS, and atomic inventory RPCs.
- `202607260008_component_inventory_app_contracts.sql`: public catalog
  projections and application-facing inventory contracts.
- `202607260009_maker_services.sql`: locker subscriptions, bench-stock orders,
  portable toolkit custody, coarse public catalogs, and attendance safeguards.
- `202607260010_maker_services_catalog_seed.sql`: three locker sizes, fourteen
  small-parts lines, and five complete toolkit templates. Physical stock stays
  unavailable until staff counts and labels real units.
- `202607260011_maker_services_contract_alignment.sql`: aligns toolkit
  identifiers and contents with the web catalog and rejects mismatched locker
  sizes during staff assignment.
- `202607260012_3d_printer_procurement.sql`: adds listing rating snapshots and
  seeds three fixed-bookable FDM printers, dated offers, and project mappings.

Migrations `202607260001` through `202607260012` have already been applied to
the linked project. Treat these files as immutable production history. Fixes
must be additive migrations; do not edit, reorder, squash, or replay them
against production.

The required public RPCs are:

`submit_application`, `list_availability`, `create_booking`,
`reschedule_booking`, `cancel_booking`, `create_checkin_intent`,
`decide_membership`, `issue_certification`, and `create_resource_block`.

`staff_override_attendance` is an additional audited RPC. It requires a
protected operations/admin role, an `aal2` Supabase session, and a reason.
`set_resource_hours` and `staff_set_booking_status` are audited operations RPCs
used by the protected staff screens.

## Local Development

Requirements: Supabase CLI, Docker Desktop, and PostgreSQL `psql`.

```sh
supabase start
supabase db reset
supabase test db supabase/tests/database
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  supabase/tests/concurrent_booking.sh
```

Generate frontend database types after a migration change:

```sh
supabase gen types typescript --local
```

The migrations publish the maker-desk catalog without inventing stock counts or
prices. Staff must add physical lockers with an `offering_slug`, counted
consumable lots, and tagged toolkit kits before those offers become available.

The seed creates the HSR Layout location, safety certifications, sixteen
builder pods, electronics benches, fabrication equipment, robot cells, the
GPU systems, six Jetson kits, vision benches, a mobile robot bay, and the demo
floor. It does not create staff accounts or calendar links.

## Edge Function Secrets

Set secrets with `supabase secrets set --env-file <owner-only-file>`. Never
commit that file.

All functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS` (comma-separated production and controlled preview origins)

Scheduled functions:

- `ARMATURE_JOB_SECRET`: high-entropy credential supplied in the
  `x-armature-job-secret` header.

Google Calendar (`calendar-sync`):

- `GOOGLE_SERVICE_ACCOUNT_JSON`: complete Google service-account JSON.
- `GOOGLE_WORKSPACE_SUBJECT`: delegated Workspace identity, currently the
  transitional `bookings@armaturelab.org` mailbox.
- `GOOGLE_SEND_UPDATES`: `all` by default; use `none` only for controlled
  testing.

The Workspace administrator must grant domain-wide delegation to the service
account for `https://www.googleapis.com/auth/calendar`. Create one private
calendar per reservable resource, share it with the delegated identity, and
insert its ID into `calendar_links`. Supabase remains authoritative: create,
update, and cancel deliveries overwrite external edits.

Reminders (`retry-reminders`):

- `REMINDER_WEBHOOK_URL`: server-side email delivery endpoint.
- `REMINDER_WEBHOOK_SECRET`: bearer credential for that endpoint.
- `REMINDER_FROM`: defaults to the transitional `bookings@armaturelab.org`
  mailbox until a replacement sender is configured and verified.

The webhook receives an idempotency key, recipient, template name, and booking
data. It should deliver through the approved Google Workspace sender or the
lab's transactional email provider. Supabase Auth custom SMTP is configured
separately in the project dashboard for OTP and account email.

Public component requests (`component-request`):

- `APP_ORIGIN`: `https://armatureailabs.com`.
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile server secret.
- `COMPONENT_REQUEST_FROM_EMAIL`: verified transactional sender.
- `COMPONENT_REQUEST_EMAIL_PROVIDER`: `resend` or `postmark`.
- `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`: selected provider credential.
- `COMPONENT_REQUEST_RATE_LIMIT`: optional hourly email/IP limit, default `5`.

The public browser receives only `VITE_TURNSTILE_SITE_KEY`. The Edge Function
validates Turnstile, applies the atomic rate limit, creates a private pending
request, and emails a one-use 24-hour verification link. Requester email and
token material never appear in the published request view.

The function and its frontend action remain disabled for the public-first
release. Do not deploy or expose the action until Turnstile, a verified Resend
or Postmark sender, `APP_ORIGIN`, rate limits, allowed origins, and token
expiry/replay tests are complete. `VITE_COMPONENT_REQUESTS_ENABLED=false` is
the production default until that gate is signed off.

## Generated type review

`src/types/database.ts` was reviewed statically against migrations
`202607260007` through `202607260012`. It contains their public tables, views,
RPCs, enums, maker-service contracts, and the rating fields added to
`component_offers`; no missing generated public object was found in that
review. This is not a substitute for generation from a clean local reset.
Before merging schema work, run `supabase db reset`, regenerate with
`supabase gen types typescript --local`, and review the diff. Do not generate
types from production or use a destructive remote reset.

## Function Operations

Deploy:

```sh
supabase functions deploy kiosk --no-verify-jwt
supabase functions deploy calendar-sync --no-verify-jwt
supabase functions deploy retry-reminders --no-verify-jwt
supabase functions deploy booking-ics --no-verify-jwt
# Only after the Turnstile/email release gate:
supabase functions deploy component-request --no-verify-jwt
```

JWT verification is disabled at the gateway because each function implements a
more specific boundary:

- `kiosk` validates either a member/staff JWT, a one-use enrollment token, or
  an enrolled device signature depending on the action.
- `calendar-sync` and `retry-reminders` require `ARMATURE_JOB_SECRET`.
- `booking-ics` validates the bearer token and authorizes the booking owner or
  operations staff.
- `component-request` validates Turnstile and uses service-role RPCs for the
  private create/verify flow. Its public responses are always `no-store`.

Schedule `calendar-sync` every minute and `retry-reminders` every minute using
Supabase Cron or an external scheduler. Store the job secret in the scheduler's
secret store. Do not put it in a query string.

### Kiosk Signing Contract

The kiosk signs this UTF-8 string with ECDSA P-256 and SHA-256:

```text
<unix timestamp in milliseconds>
<random nonce>
POST
/functions/v1/kiosk
<lowercase SHA-256 hex of the exact JSON request body>
```

It sends the base64url signature in `x-kiosk-signature`, along with
`x-kiosk-device-id`, `x-kiosk-nonce`, and `x-kiosk-timestamp`. The private key
should be non-exportable WebCrypto key material held by the kiosk browser.

Enrollment is a three-step operation:

1. An `aal2` operations/admin user calls `kiosk` with
   `{"action":"create_enrollment", ...}`.
2. The kiosk generates its local P-256 key pair and calls
   `{"action":"redeem_enrollment","token":"...","public_key_jwk":{...}}`.
3. Subsequent scans call `{"action":"scan","token":"member-qr-token"}` with the
   signed headers above.

An `aal2` operations/admin user can revoke an enrolled device with
`{"action":"revoke_device","device_id":"...","reason":"..."}`.

## Production Checklist

1. Link the intended Supabase project and review `supabase db diff` before
   pushing migrations.
2. Configure custom SMTP for OTP email. Enable Google OAuth and
   `https://armatureailabs.com/auth/callback` only before the member-platform
   launch, after its production flow tests pass.
3. Create the first staff role through a reviewed SQL/admin operation. Never
   expose staff-role mutation to member clients.
4. Configure private resource calendars and `calendar_links`.
5. Set Edge Function secrets, deploy functions, and configure schedules.
6. Schedule deletion of `inventory_evidence` objects and rows after
   `retain_until`; routine evidence is 30 days and flagged evidence is 180 days.
7. Run the pgTAP suite and real two-connection concurrency test.
8. Review RLS with anonymous, pending, active, suspended, staff, kiosk, and
   service-role personas before production traffic.
