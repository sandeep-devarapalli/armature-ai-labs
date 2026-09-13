# Armature AI Labs — editorial identity

Approved release assets, 13 September 2026. Social-profile uploads remain separate. Earlier identity packs are preserved.

## Identity

Use **Armature AI Labs**, with capital A, uppercase AI and capital L. Retain the supplied circular commutator; do not rotate, stretch, redraw or add effects. Use the light assets on white/light surfaces and dark assets on near-black surfaces. Transparent light files contain dark ink; transparent dark files contain white ink.

The primary palette is white (#ffffff) and near-black (#111110), with #6b6862 or #bcbcb7 for secondary text. Wordmark/headings use Helvetica Neue Bold; supporting typography is Space Mono. Normal SVG exports have outlined lettering so they do not depend on installed fonts. Editable wordmarks are under editable/ and require a locally licensed Helvetica Neue; no Helvetica font files are redistributed. Space Mono is included with its OFL.

Keep clear space of at least one central-shaft diameter around the mark and half the wordmark capital height around a lockup. Use the symbol alone for small/circular profile crops; use the horizontal lockup for headers. Practical screen guidance: mark at least 24 px, full lockup at least 190 px wide. These are design recommendations, not platform requirements.

## Ready-to-copy descriptions

One line:

Armature AI Labs is a 3,500 sq ft physical AI and robotics lab in HSR Layout, Bengaluru.

One paragraph:

The armature is the core of every motor: the part that moves. Armature AI Labs is a 3,500 sq ft physical AI and robotics lab across ground and first floors in HSR Layout, Bengaluru, built for the full path from idea to working machine: arms, prototyping, machining, ESD-safe benches, and GPU compute.

Public contact: hello@armatureailabs.com · https://armatureailabs.com

Description provenance: src/pages/BrandingPage.tsx and src/pages/HomePage.tsx at the rollout baseline. The paragraph retains the existing lab description, adds the confirmed two-floor scope and omits the existing hourly-booking claim so brand boilerplate does not promise booking availability.

## Files

- logos/: symbols, square icons, horizontal/stacked lockups and wordmarks. Each design has PNG and SVG versions; PNG sizes include 512 px.
- social/: seven platform folders with light and dark variants.
- editable/: font-dependent SVG wordmarks for controlled editing.
- source/: byte-preserved approved circular mark.
- manifest.json: pixel dimensions, PNG byte sizes, SHA-256 hashes, source links and per-asset verification status.
- contact-sheet.png: review overview, not an upload asset.

## Platform matrix

| Platform | Asset | Pixels | Status |
| --- | --- | --- | --- |
| linkedin | profile-400 | 400 × 400 | official-recommended-dimensions |
| x | profile-400 | 400 × 400 | official-recommended-dimensions |
| instagram | profile-1080 | 1080 × 1080 | practical-high-resolution-export |
| github | profile-512 | 512 × 512 | practical-high-resolution-export |
| youtube | profile-800 | 800 × 800 | practical-high-resolution-export |
| discord | profile-512 | 512 × 512 | practical-high-resolution-export |
| whatsapp-business | profile-512 | 512 × 512 | practical-high-resolution-export |
| linkedin | company-cover-1512x256 | 1512 × 256 | official-recommended-dimensions |
| linkedin | personal-banner-1584x396 | 1584 × 396 | official-recommended-dimensions |
| x | header-1500x500 | 1500 × 500 | official-recommended-dimensions |
| linkedin | company-cover-master-3024x512 | 3024 × 512 | 2x-same-ratio-master |
| linkedin | link-preview-1200x627 | 1200 × 627 | official-recommended-dimensions |
| instagram | post-square-1080x1080 | 1080 × 1080 | practical-export-check-live-crop |
| instagram | post-portrait-1080x1350 | 1080 × 1350 | practical-export-check-live-crop |
| instagram | story-1080x1920 | 1080 × 1920 | practical-export-check-live-crop |
| whatsapp-business | status-1080x1920 | 1080 × 1920 | practical-export-check-live-crop |
| github | repository-social-preview-1280x640 | 1280 × 640 | official-recommended-dimensions |
| youtube | channel-banner-2560x1440 | 2560 × 1440 | official-recommended-dimensions |
| youtube | watermark-150 | 150 × 150 | official-minimum-dimensions |
| discord | server-banner-960x540 | 960 × 540 | official-recommended-dimensions |

Use the ordinary LinkedIn company cover (1512 × 256); its 3024 × 512 companion is a 2× master. The freshly opened LinkedIn help page supersedes the stale 4200 × 700 search snippet. The personal LinkedIn banner is different; do not use the company logo as a person's profile portrait.

YouTube keeps essential artwork inside a conservative centred 1235 × 338 rectangle on the 2560 × 1440 canvas. Discord's server banner deliberately has no name or mark: its official guide recommends no logo/text and a clear top 48 px. A server banner requires an eligible boosted/partner server; entitlement was not checked.

Instagram, WhatsApp Business, and profile sizes without a cited requirement are practical high-resolution deliverables, not claimed official current specifications. Confirm the in-app crop before uploading. Some social surfaces recompress or crop images; no files were tested by uploading them. No new handles or account URLs are invented.

## Sources

- [www.linkedin.com](https://www.linkedin.com/help/linkedin/answer/a563309) — Company logo 400×400; Page cover 1512×256; custom post-link preview 1200×627; 3 MB maximum. Direct page supersedes cached 4200×700 snippets.
- [www.linkedin.com](https://www.linkedin.com/help/linkedin/answer/a568217/adding-or-changing-the-background-photo-on-your-profile?lang=en) — Personal cover 1584×396; under 8 MB.
- [help.x.com](https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo) — Profile 400×400; header 1500×500; profile maximum 2 MB. Top and bottom 60 px may be cropped.
- [support.google.com](https://support.google.com/youtube/answer/10456525?hl=en) — Banner 2560×1440 recommended; 2048×1152 minimum; safe text/logo area 1235×338 at minimum size; 6 MB maximum. Watermark minimum 150×150 and under 1 MB.
- [docs.github.com](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview) — Repository social preview 1280×640 recommended; under 1 MB.
- [support.discord.com](https://support.discord.com/hc/en-us/articles/360028716472-Server-Banners) — Server banner 960×540; keep top 48 px simple; avoid text and logos. Requires eligible boosted/partner server.

## Rebuild

From the isolated rollout root, run Node.js 22: node scripts/generate-editorial-brand.mjs. Requires macOS Swift/CoreText, locally installed Helvetica Neue, the included source/ mark and fonts, and installed sharp (first-time bootstrap can use the approved sibling preview). The primary SVGs and PNGs are portable; this font-outline generator is macOS-native.

## Search Summary

- Commands: webcmd --version; webcmd list --tag search; webcmd plugin search; webcmd web fetch; read-only web search/open for the official help pages above.
- Browser fallback: none.
- Gaps/failures: Webcmd plugin catalog fetch failed and local fetch returned listen EPERM. No retries or account access; available web tool supplied primary help-page content. Instagram/WhatsApp dimensions are practical exports.
