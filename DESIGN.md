# DESIGN.md

## Design Intent

armature should feel like a real lab floor: precise, physical, useful, and quietly ambitious. The design should avoid generic AI startup polish, vague futurism, and decorative marketing gloss. It should make robotics, fabrication, compute, and safety feel inspectable.

The first screen should make the lab identity obvious: the lowercase `armature lab` hero wordmark, the commutator mark, HSR Layout, Bengaluru, and the physical lab offer.

## Brand Hierarchy

- Current public styling uses lowercase `armature`.
- Formal lab identity: `Armature - The Physical AI and Robotics Lab`.
- Parent plan: `Institute for Physical AI`.
- Do not collapse the parent institute and lab floor into one vague brand.
- If both institute and lab surfaces are present, the institute carries the broader research identity and armature carries the working-floor identity.

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
- When no choice exists, respect `prefers-color-scheme`; dark may follow the system, while sepia is always explicit.
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
