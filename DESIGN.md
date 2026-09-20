# DESIGN.md

- Selected homepage layout, 20 September 2026: option 03 Integrated backdrop, using the microplate scanner in muted T2. Keep the text readable on the left and the instrument on the right; stack the film below the copy on phones. This replaces the glass-pickup hero and split layout in the local preview. The user authorized completing the supporting placements and publishing the combined update on 20 September 2026. Deploy only the checked final revision; the earlier glass-hero release is superseded.

## Approved editorial revision — 13 September 2026

Square logo exports also include pure-black (`#000000`) backgrounds with all-white artwork, as requested on 19 September 2026. Label the existing `#111110` square variants charcoal. This additional export palette does not change website theme colours or the circular mark geometry.

Footer option A is approved: finish the shared site footer with a complete, full-width `Armature AI Labs` wordmark in the existing bold display face, monochrome in every theme. Scale it with its container; do not crop, wrap or replace the existing mark, contacts, navigation and license information above it.

Hyperlink accent: the user selected Copper (option C). Use `#995600` on light surfaces with `#784400` on hover; use `#D99A50` on dark surfaces with `#EAB779` on hover. Sepia uses deeper Copper `#784400` / `#603600` for readable links on its darker paper panels. Apply shared tokens to navigation, linked titles, citations, downloads and footer contacts; preserve monochrome branding and high-contrast filled button labels. Retain inline underlines and visible keyboard focus. This is a link accent, not a logo or background recolour.

For the approved public release, the user-selected editorial system supersedes the older visual tokens below: exact `Armature AI Labs` casing, fixed monochrome circular commutator, Helvetica Neue/Helvetica/Arial bold display and wordmark, and self-hosted Space Mono for prose and controls. Use true white (#fff), neutral near-black (#111110), restrained secondary grey and hairline borders. Dark mode uses #111110 surfaces and white text. Sepia remains an optional reading preference with the same structure. Keep all existing home-page sections and operational routes. Use the approved T2 Field of touch treatment: a calm point lattice in muted source colours, with pause control, offscreen/hidden pausing and reduced-motion stills. Keep the circular logo stationary. Model renders remain unfiltered and labelled as designs. See `docs/editorial-rollout.md` for scope and copy retention.

## Design Intent

Armature AI Labs should feel like a real lab floor: precise, physical, useful, and quietly ambitious. The design should avoid generic AI startup polish, vague futurism, and decorative marketing gloss. It should make robotics, fabrication, compute, and safety feel inspectable.

The first screen should make the lab identity obvious: the lowercase `armature ai labs` hero wordmark, the commutator mark, HSR Layout, Bengaluru, and the physical lab offer.

## Brand Hierarchy

- The visible wordmark uses lowercase `armature ai labs`.
- Formal lab identity: `Armature AI Labs - The Physical AI and Robotics Lab`.
- Parent plan: `Institute for Physical AI`.
- Do not collapse the parent institute and lab floor into one vague brand.
- If both institute and lab surfaces are present, the institute carries the broader research identity and Armature AI Labs carries the working-floor identity.

## Visual Language

Use the current site as the source of truth.

- The site supports light, dark, and sepia reading modes through one shared component system.
- Light remains the primary brand presentation: paper-like and technical.
- Dark uses near-black workshop surfaces with warm text and keeps saffron, brick, and moss as operational accents.
- Sepia uses a restrained drafting-paper palette with deep brown ink; it must not become a flat beige wash.
- Dark/ink feature sections remain darker than the surrounding page in every mode.
- The mark is the commutator (eight rounded segments, saffron live pair at 3 and 9, ink shaft); geometry is fixed and lives in `brand/armature-lab/`; never rotate it; saffron only on the live pair; all-ink on saffron backgrounds.
- Prefer grids, measured lines, diagrams, tables, chips, boards, and floor-plan language.
- Use real lab/equipment/photo assets when available. Until then, reserved photo slots must remain clearly marked as placeholders.
- Avoid generic gradient hero art, blob backgrounds, glossy SaaS cards, stock-office imagery, or abstract AI smoke.

## Color System

Use existing `src/styles.css` CSS variables unless the user asks for a palette change.

- Ink: `#0A1220`
- Ink secondary: `#142036`, `#1F2D48`
- Paper: `#FFFEFA`
- Panel: `#FFFFFF`
- Cream/tan: `#F2E6CC`, `#E8D7B3`, `#D6BF92`
- Saffron accent: `#E89A2C`
- Saffron wash/deep: `#F4C56E`, `#B97516`
- Brick warning/industrial accent: `#C44A2A`
- Moss success/ops accent: `#3F5430`
- Text greys: `#3A4655`, `#6B7585`, `#9AA1AC`

Do not turn the site into a one-color theme. Saffron is an accent, not a background wash.

Theme behavior:

- Keep content, layout, calculator logic, project data, and navigation identical in all three modes.
- Use the existing CSS variables and semantic surface tokens instead of duplicating page markup.
- Persist an explicit visitor choice in `localStorage` under `armature-theme`.
- When no valid choice exists, load dark mode regardless of the system preference. Apply the saved preference before first paint, and retain functional theme controls when storage is unavailable. Sepia remains an explicit choice.
- Keep the three-swatch theme control in the main navigation.
- Verify inline marks, diagrams, form controls, cards, tables, and the animated hero field in every mode.

## Typography

Keep the existing type roles:

- Body: `General Sans`, falling back to `Space Grotesk` and system sans.
- Display: `Space Grotesk`.
- Editorial italic ledes: `Newsreader`.
- Technical labels, numbers, controls, and notes: `JetBrains Mono`.

Mono labels should stay short, uppercase, and functional. Avoid long prose in mono.

## Layout And Components

- Keep the main content constrained with the existing `1120px` wrap and responsive padding.
- Use full-width page sections separated by hairline borders.
- Use cards for repeated items only: equipment, programs, services, output metrics, and compact panels.
- Do not nest cards inside cards.
- Preserve the current component feel: 6 to 14px radii, thin borders, compact spacing, and dense but readable rows.
- Keep tables, financial panels, and calculators scannable. They should feel operational, not decorative.
- Preserve mobile behavior: card grids collapse to one column, stats collapse to two columns, and nav remains horizontally scrollable.
- Text must not overflow buttons, cards, tables, SVG labels, or photo placeholders.

## Diagrams And Motion

- Keep diagrams factual: floor plan, power architecture, pipeline, site deployment, camera coverage, and revenue mix.
- Diagram labels should be concrete and short.
- The hero animation and mark motion should stay subtle and mechanical.
- Respect `prefers-reduced-motion`.
- For Three.js or canvas changes, verify the scene is visible, framed, and nonblank on desktop and mobile widths.

## Copy Tone

Copy should be specific and grounded.

- Say what is in the room: arms, benches, pods, machine shop, cameras, and GPU compute.
- Prefer concrete operating claims over hype.
- Keep planning estimates labeled as estimates, not quotes.
- Do not invent pricing, founder names, photos, booking URLs, or final CTA destinations.
- Keep placeholders visibly intentional until the user supplies real values.

## Design Change Checklist

Before handing back a design or visual change:

- Confirm the change preserves the brand hierarchy in `AGENTS.md`.
- Check that palette, type, spacing, cards, and diagrams still match this file.
- Check light, dark, and sepia modes at desktop and mobile widths, including persisted selection across pages.
- Check placeholders are either intentionally preserved or updated from real user-provided values.
- Run `npm run dev` for interaction work or `npm run preview` against a
  production build for PWA checks.
- Verify public, member, staff, and kiosk routes at desktop and 390px.
- Confirm booking and check-in controls communicate their online-only state
  without changing layout between themes.
- For calculator or financial copy changes, also check the docs and README for matching numbers.
