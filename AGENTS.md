# AGENTS.md

- GF-03 use confirmed, 12 September 2026: the user confirmed GF-03 is a bathroom. Label it `Bathroom` in current room presentation and remove sanitary-use verification holds. This confirms use only, not fixture positions, dimensions or services; preserve existing GF-01 access, model geometry and issued release files. Keep current naming corrections separate from immutable released service catalogs.
- Floor terminology correction, 12 September 2026: the current project covers only Ground floor (GF) and First floor (FF). Do not introduce a second floor or describe it as a missing deliverable. Preserve the fifteen included GF/FF room IDs; GF05 patio remains excluded.
- Room-view completion, 12 September 2026: add the eleven missing individual Blender previews using the saved R06 cumulative model without changing geometry, furniture, materials or model downloads. Camera-only crops may retain neighbouring context; shared joined-wall meshes must not be isolated by guessed room tags. Keep support/bathroom views schematic. Preserve the four existing detailed room previews and every released model/CAD asset; stage the updated webpage for user visual approval before publication.

- FF02 glass enclosure revision, 12 September 2026: the user supersedes C03/R05 steel/PUF panels and three windows with full-height clear glazing, dark aluminium cabin-style framing, and a glass roof with solar-control film/screening. Preserve the north/east existing masonry, FF03/FF04 access, enclosure footprint, curved outside balcony, furniture/equipment and all other rooms. Film is the provisional interpretation until the shade-screen choice is confirmed; no heat-rejection or structural claims. Build a separate C04/R06 Blender revision first, then coordinate the complete FF02 room and full-first-floor CAD from that saved source, correcting the R05 full-CAD/P01 mismatch. Preserve R05 and earlier bytes; verify native reopen, retained geometry, door travel, downloads and visible webpage. Overhead glass, aluminium profiles, support, drainage, sealing and film compatibility remain specialist design items, not fabrication specifications. S02 electrical estimates are not recalculated by this enclosure change.

- Building Vision simplification, 12 September: remove the four-principles section, earlier-concept dropdowns, agent/Codex/Claude workflow and prompt-template section, and verbose service/procurement warnings from the public page. Use a short current-layout introduction and building-views heading without a hardcoded 21-view claim. Keep historical image files and technical provenance in the archive, not as current public layouts; do not erase unresolved model constraints or present stale service estimates as current. The footer address is 1490, 11th Cross, 20th Main, 1st Sector, HSR Layout, Bengaluru – 560034, Karnataka.

## Project Scope

This folder is the Armature AI Labs member, booking, and check-in PWA plus the lab's
brand assets and planning documents.

- `src/`: React, Vite, and TypeScript application for `armatureailabs.com`.
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

- The canonical public website domain is `armatureailabs.com`. Do not substitute the legacy `armaturelab.org` domain or near-match domains.
- The canonical public information, membership, and brand-permissions mailbox is `hello@armatureailabs.com`; sending, receiving, SPF, and DKIM were verified on 8 September 2026. Keep `hello@armaturelab.org` working for existing contacts, but do not publish it as the public contact address. The booking, calendar-delegation and transactional sender identity is `bookings@armatureailabs.com` (decided 12 September 2026); the code and docs already point at it. Until Sandeep confirms that mailbox exists in the same Google Workspace and sends and receives, treat it as pending: do not enable the member platform, calendar sync or reminders in production against it, and keep `bookings@armaturelab.org` alive only as the legacy fallback for anything already configured with it.
- The commutator mark geometry in `brand/armature-lab/` is fixed; the exploded-A mark is retired.
- Keep the parent and lab identities separate. The larger parent plan is `Institute for Physical AI`; the lab identity is `Armature AI Labs - The Physical AI and Robotics Lab`.
- The current public site and asset pack style the lab name in lowercase. Preserve that capitalization in existing site copy and SVG text unless the user explicitly asks for a change.
- The home hero's visible wordmark must read lowercase `armature ai labs`. Do not shorten it, and preserve its existing type, size, spacing, and mark.
- Do not flatten the hierarchy into a vague umbrella name like "Armature Institute" unless the user explicitly asks.
- Keep HSR Layout, Bengaluru as the location signal unless the user gives a replacement.
- Light assets are the primary assets. Ink/dark variants are for dark surfaces.

## Source Of Truth

Keep these facts consistent across `src/`, `docs/`, and `README.md` when any of them change:

- 3,500 sq ft lab footprint: the gross built-up figure for ground plus first floor at HSR 1490, backed by the 12 September 2026 CAD measurement (about 2,460 sq ft of enclosed rooms plus about 560 sq ft of balconies and terrace; walls, stair, first-floor void and entrance passage make up the rest; the GF-05 patio is excluded).
- Two floors, fifteen modelled rooms. Public room programme and carpet areas live in `src/pages/HomePage.tsx` (`roomProgramme`) and must match `src/data/buildingRoomServices.json` names. Ground: GF-10 commons 385, GF-09 lounge and presentation hall 300, GF-01 cabin 235, GF-08 balcony café 205, GF-04 kitchen 190, GF-02 reception 90, GF-07 booth 45, GF-03 + GF-06 washrooms 100. First: FF-04 landing and gallery 410, FF-06 twin cabins 350, FF-02 workshop terrace 260, FF-03 cabins 230, FF-06 balcony 100, FF-01 + FF-05 washrooms 125 (all sq ft, nearest 5).
- The earlier single-floor concept (ten zones, sixteen builder pods, nine cameras) is retired from the public home page. It survives only in the historical financial docs under `docs/`; do not reintroduce those counts as current facts.
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
- Do not advertise or list a dedicated indoor flight enclosure as a site zone, member resource, service, project-testing location, or planning item unless the user explicitly restores it.
- In the building-vision presentation, the photos previously labelled `Main café hall`, `Café flex room`, and `Lower stair landing` show the basement or basement access and must stay excluded unless the user explicitly restores basement scope. Do not infer floor labels from image appearance when the user has supplied the floor mapping.
- In the building-vision presentation, photo `18` is the first room inside the main entrance on the ground floor. Treat it as reception, visitor check-in, and a compact Armature AI Labs goodies store—not as a second-floor meeting room—and keep it immediately after the frontage in presentation order.
- The preserved `/building-vision` concept set is exactly the 21 PNGs numbered `00` through `20` in `/Users/dev/Downloads/Armature Lab Building rework project/Armature Lab Building rework v2/`, mirrored under `public/building-vision/rework-v2/`. Render those historical views once, in numeric order, separately from versioned native model views. Do not restore or mix in the legacy `/before/` and `/after/` assets unless the user explicitly changes the set.
- In the building-vision frontage concept, provide shaded outdoor café seating with freestanding, weighted umbrellas only. Keep the entrance route, stairs, gate, trees, drainage and cycle parking clear; do not imply fixed shade structures or structural work.
- In the wide building-vision street approach, use a shallow illuminated lightbox reading `HSR FOUNDERS` / `CLUB` on the existing boundary wall, plus a separate slim programmable LED information strip. Keep both signs modest, within the existing wall profile, clear of the gate and footpath, and do not turn either into a billboard, pylon or structural wall addition. The closer frontage view may retain the separate Armature AI Labs entrance identity.
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
  clearly attributed Armature AI Labs reference illustration.
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

- Building Vision authority correction, 10 September 2026: use the latest user-approved Blender design first, coordinated CAD second, and illustrative/concept photos third. Align conflicting presentation images to the approved Blender layout rather than altering models to fit older images. Preserve original site photos and prior concepts; label edited images as proposals, not photographs of completed work or surveyed evidence. Record the source release and review geometry, furniture counts, doors, stair/void access and partition paths before promoting a replacement. Unissued office/workshop drafts do not supersede the approved release, and photo alignment does not authorize publication or unresolved design decisions.

- Building Vision now includes versioned Blender-derived 3D, full-floor native CAD downloads and room-by-room CAD extracts plus a separately labelled proposed service schedule. After any verified model change, follow `docs/building-model-publication.md` to regenerate affected exports, review room services and publish the page together. Preserve the 21-image concept set. Do not silently publish draft/private-office geometry, count proposed sockets as installed, relabel ground/first floor as first/second, or imply local file saves automatically update the website.
- Building Vision R05, 12 September 2026: FF02 workshop terrace published with the C03 steel-frame insulated-panel enclosure and lab layout as a labelled proposal (Sandeep's decisions: steel frame + PUF panels; opaque roof with a polycarbonate skylight strip, not a glass roof; enclose the north part, keep the curved balcony; three modest windows; roof fall to the west guard; 1.5-ton AC; one GPU workstation and two printers; UPS back to 3 kVA). R05 retains every R04/R03 asset by bytes, keeps the R04 full first-floor CAD download and adds the room-level `ff02-enclosure.FCStd`/`.step`. The P01 glazed-frame study is superseded; never describe R05 as a structural, weatherproofing or fabrication design or as approved. Native sources stay in `output/ff02-enclosure-r05/` and are never edited in place; the next model change is R06 with a new directory and pins. S03 (services) is still to be published: it must carry the 3 kVA UPS, 1.5-ton FF-02 AC, one GPU and two printers, and lab points re-placed inside the enclosed room.
- Electrical and setup plan S02, 12 September 2026: `public/building-models/s02/` and `src/data/buildingElectricalS02.json` are the current service authority (three-phase 10 kW, 7 cabins on 0.8-ton splits, hall on 2 × 1.5-ton, lab equipment in FF-02 once enclosed, 3 kVA UPS ~2 h for GPUs/printers/network/hall AV, one inverter per floor, 10 PoE cameras, at least three access doors per floor). It is a planning estimate for a licensed contractor, not a certified design or installed record; symbol positions are indicative and derived from the published R03/R04 CAD. S01 numbers are historical only. Never edit `s02/` files in place: publish a new revision ID with a fresh manifest, keep `scripts/check-electrical-plan.mjs` passing, and keep the design case at or below 8 kW against the 10 kW supply. See `docs/building-model-publication.md`.
- Building Vision R03 private staging, 11 September 2026: retain the verified FF04/FF06 selected native proposals with GF01 cabin A P01, FF02 workshop P01, FF03 two-/four-person cabins P01 and FF06 balcony B02. The user approved public GitHub native CAD downloads as an eventual destination but directed that R03 stay private until door details are revised. This hold does not authorize door-geometry changes; do not publish on export checks alone. R02 was an unpublished local checkpoint, not a previous public release. FF04 has two four-table islands, the selected cabin enlargement, a left cabin slider, a left curved two-leaf stair slider and the right outward-right cabin door; the all-sliding alternative is not selected. FF06 uses revised A: two four-person cabins, dedicated lower-cabin balcony access, outward doors and retained cupboard/dresser/mirror. Replace only superseded proposal geometry, not preserved architecture or original sources. Keep R01 and all six R01 detail renders unchanged; the old FF04 central-door render is historical, not the R03 arrangement. Preserve all 21 older concepts. S01 service numbers are historical and insufficient for the new room programmes; never present them as recalculated capacity. Native save/reopen, exact source matching and visual/public-release gates remain required; model positions do not certify occupied use or installation.
- Before public model uploads, inspect compressed CAD/Blender metadata and PNG text chunks for private local paths. Sanitize public copies only, preserve original sources, verify geometry/materials/object membership and native reopen, and record separate source/public hashes. Do not push earlier unsanitized commits into public history. A local preview or an HTTP 200 HTML fallback is not proof that downloadable files are live; verify production bytes against the release manifest.
- Historical P01 audit: 36 door/frame component overlaps prevented publication of that proposal. Preserve this failed evidence privately; exact-source and fresh-reopen checks alone do not establish collision-free doors, occupied access or hardware feasibility. The later P03 authority below permits a separately verified sliding-entrance revision, not relabelling P01 as repaired.
- Later authority, 11 September 2026: after the P02 H1 corridor-loss finding, the user explicitly allowed sliding doors and requested publishing the revised designs and updating the webpage. This supersedes the earlier outward-door selection and private-release hold for the verified new revision only. Use the additive P03 sliding-entrance source after independent motion, bearing-contact, aperture and corridor checks; do not publish failed P01/P02 trials as current designs. Preserve the openings, cupboard, cabin furniture, balcony and stair/guard geometry, existing left FF04 slider and corrected S1/S2 curved system. Public native copies must contain the verified current design without private failed-trial history or local-path metadata; original cumulative sources remain preserved. Source/public hashes, native reopen, actual viewer/download QA and production byte checks remain mandatory. Keep unverified occupied-use and hardware-design limits visible; this is not construction or occupancy approval.
- FF03 four-person entrance revision, 12 September: the user explicitly requests a sliding door for the pictured four-seat cabin, with Blender, matching CAD and webpage updates. This supersedes only that cabin's outward-door requirement. Preserve its west opening, fixed partitions, cupboard, all six FF03 tables/chairs, the two-person cabin door, FF05 inward shared access and the current R03 other-room work. Test compact sliding leaves against actual parking space, retained furniture, frames, handles and continuous travel; do not move the separate unconfirmed exterior opening. Issue an additive revision, retaining originals and the occupied-seat/cupboard limitations. Door hardware remains a planning proposal, not a selected or engineered product.

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
