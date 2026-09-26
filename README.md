# Armature AI Labs - The Physical AI and Robotics Lab

Website: [armatureailabs.com](https://armatureailabs.com)

Contact: [hello@armatureailabs.com](mailto:hello@armatureailabs.com)

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

The lab is pre-launch; enquiries only (confirmed 17 September 2026). The current
seven-cabin layout is a plan, not an installed or bookable capacity. Do not
advertise the retired sixteen-pod or fifty-person event concepts.

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
- Production builds prerender the same React public pages, including component
  references, with route-specific metadata and a generated `sitemap.xml`.
  Public canonical URLs use trailing slashes. No authenticated data is fetched
  during prerendering. Explicit operational routes use the anonymous, noindex
  client shell; unrecognized URLs use a real `404.html` response.
- Prerendering runs before service-worker generation so its HTML revision is
  current. Keep `npm run check:pages-runtime` passing: it checks private-route
  rewrites, public HTML, retired redirects, real 404s and missing chunk behavior.
  `npm run check:release-artifacts` validates every sitemap document and keeps
  immutable building assets pinned.
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
  revalidating prerendered HTML page. Submit the sitemap to Google Search Console
  and Bing Webmaster Tools only after the live XML and release checks pass.

## brand/
The earlier commutator identity lives in `brand/armature-lab/`, with SVG
sources and PNG exports for the mark, wordmark, lockups, icons, and favicon.
Older Exploded-A files remain in `brand/` as retired historical assets.
The current editorial identity lives in `brand/armature-ai-labs/editorial-2026-09/`,
mirrored at `public/brand/editorial-2026-09/`. The public `/branding` route serves
its light/dark SVGs, PNGs, social formats and complete ZIP. Keep both copies
synchronized. Earlier downloads under `public/brand/armature-lab/` and
`public/brand/armature-lab-assets.zip` remain available for existing links.

## linkedin/
Preserved earlier company-page assets. Current LinkedIn company covers,
personal banners, logos and link previews are in the editorial pack's
`social/linkedin/` directory; its manifest records dimensions and source guidance.

## docs/
The [Armature AI Labs positioning note](docs/armature-ai-labs-positioning.md)
records the lab's training, prototyping, community and future-city ambitions.
Planned equipment and future locations are not described as already operating.

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
