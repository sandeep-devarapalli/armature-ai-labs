# Armature AI Labs - The Physical AI and Robotics Lab

Website: [armatureailabs.com](https://armatureailabs.com)

Contact during the domain transition: [hello@armaturelab.org](mailto:hello@armaturelab.org)

React/Vite member, booking, maker-desk inventory, and check-in PWA for the
physical AI and robotics lab in HSR Layout, Bengaluru.

## Application

- `src/`: public catalog, member booking/inventory, staff, and kiosk routes.
- `public/`: PWA icons, Cloudflare headers, and credited project media.
- `supabase/`: schema, RLS, atomic booking RPCs, seed data, database tests, and
  Edge Functions for verified component requests, kiosk, calendar, reminders,
  and ICS.
- `site/`: legacy static site retained for reference and rollback only.

The application preserves the light, dark, and sepia modes. Supabase is
authoritative for accounts, membership approvals, certifications, resources,
bookings, attendance, component requests, stock, checkouts, lockers,
consumable pickup orders, and toolkit rentals. Google Calendar is a one-way
operational mirror.

## Local development

Use Node.js 22.22.2 or another version allowed by `package.json`:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Only public Supabase configuration belongs in `VITE_*` variables. Enable
`VITE_GOOGLE_AUTH_ENABLED` only after the provider is configured. The Turnstile
site key is public; keep its secret, request-email provider credentials,
database, service-role, Google, SMTP, reminder, and kiosk credentials
server-side.

The first production release is public-first:

```text
VITE_MEMBER_PLATFORM_ENABLED=false
VITE_COMPONENT_REQUESTS_ENABLED=false
VITE_GOOGLE_AUTH_ENABLED=false
```

The public site, projects, component catalog, Maker Desk
catalog, ecosystem map, member directory, and Building Vision remain visible.
Member, booking, check-in, kiosk, admin, inventory-custody, locker, toolkit, and
component-request actions must render the shared opening-soon state while their
flag is false. Demo mode is test-only and must be enabled explicitly with
`VITE_DEMO_MODE=true`; missing Supabase values must never enable demo behavior
in a production build.

Useful checks:

```bash
npm test
npm run build
supabase start
supabase test db supabase/tests/database
supabase/tests/concurrent_booking.sh
```

See [member-booking-pwa-operations.md](docs/member-booking-pwa-operations.md)
for provisioning, kiosk, Google Workspace, release, and rollback procedures.

## Release source of truth

- Migrations `202607260001` through `202607260012` have already been applied to
  the linked Supabase project. They are immutable; any correction must use a
  new migration.
- The `component-request` function source is present but remains disabled until
  Turnstile and a verified Resend or Postmark sender are configured.
- Deploy only a fresh production build from a reviewed, merged `main` commit.
  Never deploy the demo build or the preserved `site/` directory.
- Production builds materialize React shell files for the historical
  `/projects/` and `/building-vision/` directory URLs so a Direct Upload
  replaces their legacy static objects as well as serving the SPA fallback.
- The React entrypoint removes the preserved static site's `armature-v16`
  Cache Storage entry so returning visitors cannot retain legacy pages after
  reaching the new application.
- Production promotion requires frontend, SQL/RLS, concurrency, PWA-cache,
  direct-route, responsive-theme, and live smoke checks. The previous
  Cloudflare Pages deployment remains the rollback target until those checks
  pass.
- Keep the Cloudflare zone's Browser Cache TTL set to `Respect Existing
  Headers`. HTML must revalidate, while fingerprinted `/assets/*` files may be
  cached as immutable.
- Post-deploy smoke checks must confirm a built JavaScript asset returns `200`
  with a JavaScript content type, a missing `/assets/*.js` path returns a
  non-HTML `404` with `no-store`, and a representative deep route returns the
  revalidating HTML shell.

## brand/
The finalized commutator identity lives in `brand/armature-lab/`, with SVG
sources and PNG exports for the mark, wordmark, lockups, icons, and favicon.
Older Exploded-A files remain in `brand/` as retired historical assets.
The public `/branding` route serves its preserved-filename downloads from
`public/brand/armature-lab/` and the complete pack from
`public/brand/armature-lab-assets.zip`; keep both synchronized with the source set.

## linkedin/
Company page assets. Banner 2256x382 (2x retina for 1128x191), logo 800x800.
Light versions are the primary.

## docs/
Financial model and phased capex plan, re-baselined to the 3,500 sq ft plan:
ten zones, sixteen builder pods, nine cameras, ~Rs 7.65 lakh monthly cash opex,
and the full revenue stream set (memberships, pods, tenants, workshops,
programs, data centre builds, on-prem services). Matches the calculator on the
site's Financials page. Planning estimates, not quotes.

The [Circuit Digest electronics project index](docs/circuit-digest-electronics-project-index.md)
is a dated, source-linked catalog for discovering lab builds by practical lane,
platform signal, and minimum safety review gate.

## Placeholders still open

- Rs [rate] pricing on membership, certification, locker, consumable, toolkit,
  and deposit cards

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[DESIGN.md](DESIGN.md) before opening a pull request.

## License

Source code and documentation are licensed under the
[Apache License 2.0](LICENSE). The Armature AI Labs name and identity assets are
reserved; see [BRAND-ASSETS.md](BRAND-ASSETS.md) for the boundary.
