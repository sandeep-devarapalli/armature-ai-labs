# AGENTS.md

## Project Scope

This folder is the Armature member, booking, and check-in PWA plus the lab's
brand assets and planning documents.

- `src/`: React, Vite, and TypeScript application for `armaturelab.org`.
- `public/`: PWA icons, route fallback, and project media.
- `supabase/`: database migrations, RLS/RPC tests, seed data, and Edge Functions.
- `tests/`: frontend and browser tests.
- `site/`: preserved legacy static site; do not deploy it over the React app.
- `brand/armature-lab/`: finalized identity; older files in `brand/` are retired and retained for history.
- `linkedin/`: company page logo and banner assets.
- `docs/`: financial model and phased capex plan.
- `README.md`: application setup, deploy notes, and known open placeholders.
- `DESIGN.md`: visual system and design consistency rules for site and asset changes.

Use Node.js 22 and the committed npm lockfile. Supabase is authoritative for
identity, approvals, resources, bookings, attendance, and integration state.

## Brand And Naming Rules

- The canonical public website and email domain is `armaturelab.org` (singular). Do not substitute `armaturelabs.org`.
- The canonical public information and membership mailbox is `hello@armaturelab.org`. Keep private booking-calendar and transactional identities separate.
- The commutator mark geometry in `brand/armature-lab/` is fixed; the exploded-A mark is retired.
- Keep the parent and lab identities separate. The larger parent plan is `Institute for Physical AI`; the lab identity is `Armature - The Physical AI and Robotics Lab`.
- The current public site and asset pack style the lab name as lowercase `armature`. Preserve that styling in existing site copy and SVG text unless the user explicitly asks for capitalization changes.
- Do not flatten the hierarchy into a vague umbrella name like "Armature Institute" unless the user explicitly asks.
- Keep HSR Layout, Bengaluru as the location signal unless the user gives a replacement.
- Light assets are the primary assets. Ink/dark variants are for dark surfaces.

## Source Of Truth

Keep these facts consistent across `src/`, `docs/`, and `README.md` when any of them change:

- 3,500 sq ft lab footprint.
- Ten zones.
- Sixteen dedicated builder pods.
- Nine cameras.
- Phase 1 launch capex around Rs 50 lakh.
- Full build capex around Rs 75 lakh.
- Monthly cash opex around Rs 7.65 lakh.
- Break-even depends mainly on 2 to 3 company tenants plus members, pods, workshops, programs, and data-centre builds.

The financial docs are planning estimates, not quotes or financial advice. Do not remove that caveat. If current vendor prices, tariff rates, or legal/financial claims matter, verify them live before treating them as current.

## Placeholder Policy

Known placeholders are intentional until the user supplies final values:

- `Rs [rate]` or `[rate]` pricing on membership, equipment, pods, and certification cards.
- The preserved `site/` implementation still contains legacy founder, photo,
  and CTA placeholders; they are not part of the React production surface.

Do not invent final prices, founder names, URLs, or photos. If the user supplies
real values, update the React source and then remove or edit the matching
placeholder note in `README.md`.

## Editing Rules

- Make small, focused edits. Prefer editing existing files over creating new ones.
- In the building-vision presentation, the photos previously labelled `Main café hall`, `Café flex room`, and `Lower stair landing` show the basement or basement access and must stay excluded unless the user explicitly restores basement scope. Do not infer floor labels from image appearance when the user has supplied the floor mapping.
- In the building-vision presentation, photo `18` is the first room inside the main entrance on the ground floor. Treat it as reception, visitor check-in, and a compact Armature goodies store—not as a second-floor meeting room—and keep it immediately after the frontage in presentation order.
- The canonical `/building-vision` visual set is exactly the 21 PNGs numbered `00` through `20` in `/Users/dev/Downloads/Armature Lab Building rework project/Armature Lab Building rework v2/`, mirrored under `public/building-vision/rework-v2/`. Render those views once, in numeric order, and do not restore or mix in the legacy `/before/` and `/after/` assets unless the user explicitly changes the set.
- In the building-vision frontage concept, provide shaded outdoor café seating with freestanding, weighted umbrellas only. Keep the entrance route, stairs, gate, trees, drainage and cycle parking clear; do not imply fixed shade structures or structural work.
- In the wide building-vision street approach, use a shallow illuminated lightbox reading `HSR FOUNDERS` / `CLUB` on the existing boundary wall, plus a separate slim programmable LED information strip. Keep both signs modest, within the existing wall profile, clear of the gate and footpath, and do not turn either into a billboard, pylon or structural wall addition. The closer frontage view may retain the separate armature entrance identity.
- In building-vision rooms where the existing photograph shows marble flooring, retain the marble and its border pattern, showing repair, cleaning and polishing only. This specifically includes `Window café lounge` and `Existing kitchen`. Do not replace it visually or in copy with LVT, vinyl, terrazzo, tile or another floor finish unless the user explicitly asks.
- Keep every visible staircase in the building-vision concepts white or a very pale warm grey, including treads, risers, sides and undersides. Do not add rainbow risers or adjacent decorative colour blocks; retain the existing railing geometry and finish unless the user explicitly asks for a change.
- Keep the building-vision contributor section practical: include the verified public GitHub repository, direct links to `AGENTS.md` and `DESIGN.md`, the relevant local source paths, and an accessible copy-prompt control with visible success or failure feedback. Verify the links and clipboard interaction before handoff.
- Read `DESIGN.md` before visual, layout, asset, or site copy changes.
- Keep the existing React/Vite/TypeScript stack. Do not add another framework or
  state layer for a narrow change.
- Preserve the PWA rules in `vite.config.ts`: authenticated Supabase, Edge
  Function, booking, check-in, calendar, and availability traffic must remain
  network-only and must not be served stale.
- Never place a service-role key, SMTP credential, Google credential, database
  password, or kiosk secret in a `VITE_*` variable.
- Applied Supabase migrations are immutable. Add a new migration for schema
  changes, keep every exposed table under RLS, and regenerate
  `src/types/database.ts` after the linked schema changes.
- Staff authority belongs in `staff_roles`, never editable profile metadata.
- For procurement or pricing pages, keep INR as the primary displayed currency. Use USD/EUR only in brackets as source or reference pricing.
- Keep docs and calculator numbers aligned. If a financial assumption changes in one place, check all related site tables, calculator defaults, docs, and README notes.
- Preserve the current asset filenames unless the user asks for a rename.
- Do not reuse one project-card cover for different projects unless the shared
  system is the subject of both cards. Prefer distinct official media, then a
  clearly attributed Armature reference illustration.
- Keep the site's light, dark, and sepia modes structurally identical. Theme
  work must use the shared CSS-variable system, persist the visitor's choice,
  and remain consistent across public, member, staff, and kiosk routes.
- Preserve the home hero's animated canvas kernel wavefront and subtle commutator
  motion. Verify the canvas changes over time unless reduced motion is requested.
- When migrating or substantially editing a public page, compare it with the
  preserved `site/` version first. Keep useful operational sections, diagrams,
  workflows, attribution, and revenue context unless they are intentionally
  superseded or documented as legacy-only.
- Avoid unrelated redesign, copy expansion, or cleanup.
- Before reporting that a hosting, DNS, database, or admin integration is unavailable, check the active plugin and tool registry. Cloudflare and Supabase plugins may be available for programmatic infrastructure work.
- Namecheap registrar automation can use the personal `namecheap-mcp` skill backed by `johnsorrentino/mcp-namecheap`. Keep nameserver writes disabled by default and require explicit approval before enabling or calling them.
- If the user corrects agent behavior, update this file so the correction is captured for future work.

## Validation Checklist

Use the narrowest checks that match the edit:

- For site copy, placeholder, or CTA changes, inspect the known placeholders:
  `rg -n "\\[rate\\]|\\[Founder name\\]|href=\"#\"" README.md src`
- For frontend changes, run `npm test` and `npm run build`.
- For database changes, reset locally, run
  `supabase test db supabase/tests/database`, and run
  `supabase/tests/concurrent_booking.sh`.
- For service-worker changes, inspect the generated `dist/sw.js` and confirm
  transactional/authenticated traffic is absent from Cache Storage.
- For visual or interaction changes, run `npm run dev` or `npm run preview`.
- For design changes, confirm palette, typography, layout, and placeholders still follow `DESIGN.md`.
- For theme changes, verify light, dark, and sepia modes at desktop and 390px.
- For auth, booking, kiosk, or PWA changes, run the relevant Playwright flows.
