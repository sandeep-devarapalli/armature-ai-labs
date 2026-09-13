# Editorial design rollout

Publication authorized by the user on 13 September 2026 after local visual review. Publish the approved site, journal article and downloadable brand pack through the existing protected production workflow. Remove local-draft labels; retain the article's research-preview qualifications. Social-profile uploads are not part of this authorization. The sections below record the original review scope and evidence.

Baseline: upstream main `a0f7f3efe45f75946ff4a13159a892f757dbf08c` (PR #60). This is an isolated source snapshot; the older main checkout and issued models remain untouched. No deployment or social account uploads are part of this pass.

## Plan and accepted design

1. Retain the full current landing page and release-gated application routes.
2. Apply the approved local Lambda-inspired hero, Helvetica Neue/Helvetica/Arial headings and Space Mono body/navigation through the existing shared theme variables. White is true white; dark is neutral near-black. Retain optional sepia. Use hairlines, open section layouts and monochrome marks, not new decorative cards.
3. Introduce current Blender model renders within the existing two-floor section. Never regenerate building geometry or describe proposed interiors as completed photographs.
4. Integrate the approved blog index and source-linked MHS editorial draft; retain draft status.
5. Add versioned native SVG/PNG brand exports and social formats for LinkedIn, X, Instagram, GitHub, YouTube, Discord and WhatsApp Business.
6. Verify production build, existing tests, route content, responsive layout, theme persistence, motion pause and reduced motion, plus downloaded asset bytes.

Style reference: `../lambda-style-web-preview-2026-09-13/concepts/home.png`, `blog.png`, `article.png`, and the accepted working preview at port 4186. Existing downstream sections extend that exact approved system; the user's request explicitly retains their information architecture. The supplied circular SVG is authoritative, not generated logo art.

## Content retention contract

Preserve hero body copy, the public contact details, social destinations, 3,500 sq ft / two-floor / seven-cabin / three-balcony-and-terrace metrics, and these sections in order:

- A working floor, not a club lounge — four lab roles and community context.
- Two floors at a glance — complete room programme, areas, exclusions and capacity qualification.
- Monitored, end to end — three operating principles.
- From idea to working machine — all five stages.
- The maker desk keeps small friction small — storage, stock and toolkits.
- Book, build, and leave a clean trail — all five stages and joining CTA.

Intentional copy changes: title-case `Armature AI Labs`; approved hero headline `A place to build physical intelligence.`; move location identity below the hero body to avoid an added pretitle; correct FF-02's stale open-terrace note to the selected glazed workshop proposal. Grouped bathroom entries in the source are not individual-room counts.

## Presentation boundaries

Keep auth, Supabase, booking, role guards and PWA recovery unchanged. Native model/CAD releases remain byte-identical. Modelled seats are not certified capacity. The MHS article is an editorial draft, not proof of Armature's access to MHS. Existing planning price placeholders stay unchanged. New banners are downloadable files, not uploaded social profiles.

## Review and handoff

Run from this source snapshot with Node.js 22 and its committed npm lockfile:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 4190 --strictPort
```

Review `/`, `/blog`, `/blog/model-hardware-standard` and `/branding`. The current session reuses a local dependency directory with an identical lockfile; `npm ci` makes a fresh installation when moving the snapshot. No production environment files were copied.

Validation on 13 September: 57 tests passed; `npm run build` passed including model, room-view and release-artifact checks. Desktop/mobile browser checks covered public pages and local-only member/admin/kiosk demo rendering. Those checks are not validation of live bookings or integrations. Existing large map/model-viewer bundle warnings remain. The complete brand ZIP downloaded from port 4190 matched the generated file byte-for-byte.

The original checkout remains on its older dirty baseline. Do not deploy that checkout or copy this snapshot over it wholesale. After visual approval, apply the focused changes to a clean branch from the current upstream main, recheck its latest changes and production release gates, then publish separately. Old identity packs and native models remain preserved.
