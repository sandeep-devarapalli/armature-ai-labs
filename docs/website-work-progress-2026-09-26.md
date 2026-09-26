# Website work progress — 26 September 2026

This is an evidence log for a later independent review. It records completed changes, checks, and open release gates; it does not treat a local build or merged PR as proof of a live deployment.

## Scope and source

- The original checkout at `/Users/dev/Downloads/Armature Lab` contains unrelated local changes and was left untouched. Work uses isolated branches based on GitHub `main`.
- PR #73 (team memberships and booking) and creation of a separate Supabase preview project remain on hold at the owner's request. No live Supabase schema or booking integration was changed in this sequence.

## Who We Are

- Selected design 03 was already prepared in [PR #71](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/71). It adds `/about/`, a separate `/team/` placeholder without invented profiles, original illustrations, positioning notes, and route metadata.
- Fresh validation on 26 September: `npm test` (71 passed), `npm run build:demo` (passed, including release-artifact checks), and `npx playwright test tests/frontend/e2e/routes.spec.ts --project=chromium --project=mobile` (94 passed, 2 intentional skips).
- PR #71 was squash-merged as `64273785b06af21a555669a95ca38679c8a658dd`. Main-branch frontend and database CI passed; `deploy-production` is waiting for the protected production environment's owner approval. This is not live-deployment evidence.

## SEO and dependency work

- The reconciled SEO work in [PR #74](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/74) was squash-merged as `1658414a0b68deb01e0fbc9ad036657d7f19d21f`. Its PR frontend/database CI and main-branch frontend/database CI passed. The main run `36215479310` is waiting at `deploy-production`; no live deployment was verified.
- Earlier PR #63 was built before the currently approved T2 scenes, square logos, favicon and MHS cover. A direct merge would overwrite those assets. Its prerender, sitemap, route metadata, redirects and HTTP checks were ported to `codex/seo-current` from merge commit `6427378`, with the current `/about/` indexed and `/team/` prerendered but noindex. The MHS article keeps the selected 1672 × 941 Common interface cover in Open Graph, Twitter and BlogPosting data.
- The older PR's reviewed MHS engineering revision and click-to-play video were carried forward without replacing the approved cover. Homepage, membership, services, ecosystem and electrical-plan wording now distinguishes planned facilities and resources from operating ones. The newer T2 video placements remain intact.
- `/about/` and `/team/` use the shared route metadata after hydration; the older page-local title effect was removed so navigation cannot race with the SEO head manager. The final desktop/mobile SEO browser rerun passed all four checks, including About and Team transitions.
- SEO validation: `npm run build:demo` and `npm run build` both passed (153 indexable HTML pages, 155 prerendered paths including noindex pages, sitemap, robots, asset checks); `npm test` passed 107 tests. The local Cloudflare runtime passed 20 HTTP probes on both demo and non-demo builds. The combined desktop/mobile SEO, route and theme suite had 108 passes, 2 intentional skips and four outdated test assertions; all four passed after updating selectors for the source-linked list and demo-mode membership copy. The non-demo release-gate suite had 15 passes, one intentional skip and two stale copy assertions; both passed in the focused rerun. `npm run audit:all` found 0 vulnerabilities on the locked dependencies.
- [PR #72](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/72) changed only the pinned `actions/upload-artifact` action and was squash-merged as `3373f76a9f90fc57fdebc2dacd7b74e7c8076ea7` after fresh frontend/database CI. Main-branch checks passed; deployment is waiting for owner approval.
- [PR #75](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/75) replaced stale MapLibre PR #37 with `maplibre-gl` 6.11.2. It was squash-merged as `2ed86b14d9601d5e98db493de7eda98775deeabe` after `npm test` (71 passed), `npm run build:demo`, desktop/mobile map interaction tests (2 passed), and fresh frontend/database CI. Its main checks passed; deployment is waiting for owner approval. PR #37 was closed.
- [PR #76](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/76) replaced stale Lucide PR #36 with `lucide-react` 1.47.0. It was squash-merged as `fb04e8e2f12ea374ff093c336b2bf6ef97989b9e` after fresh frontend/database CI. The combined MapLibre/Lucide branch passed `npm test` (107 passed), `npm run build:demo`, and desktop/mobile map and link-colour checks (8 passed). The earlier full desktop/mobile route suite passed 94 checks with 2 intentional skips. A local rendered homepage inspection showed the header, calendar, external-link and close icons. PR #36 was closed.
- The first PR #76 CI run caught an intermittent light-theme citation hover assertion: CSS smooth scrolling could continue after Playwright moved the pointer to the link. It reproduced in 2 of 8 parallel local repeats. The test now uses reduced motion to finish scrolling before checking hover colour; no site styling changed. All 30 repeated link-colour checks across three themes and two viewports passed, then the amended PR passed full CI.
- PR #63 and visually superseded PR #57 were closed after their useful SEO, MHS and pre-launch factual corrections were carried into #74. Do not merge #35 (`@zxing/library` requires Node 24), #34 (Node 26 types), or #14 (TypeScript 7 migration) as routine Node 22 updates. These remain open for a separate compatibility review.

## Release gate

- Main frontend/database CI passed for #71, #72, #74, #75 and #76. The #76 main run is `36216517267`; its `deploy-production` job is waiting for owner approval.
- Protected `deploy-production` jobs are waiting for owner approval. A merged PR or passing CI is not evidence that `armatureailabs.com` has changed. Approve only the latest desired main commit after checks pass, then verify the live page, article metadata, sitemap and assets by HTTP response.

## Verification for Claude

Use a clean checkout of current `main`; the original `/Users/dev/Downloads/Armature Lab` checkout has unrelated local changes. Review PRs #71, #72, #74, #75 and #76 and their squash commits above. Run `npm ci`, `npm test`, `npm run build:demo`, `npm run build`, and `npm run check:pages-runtime`; for browser checks, run `npx playwright test tests/frontend/e2e/seo.spec.ts tests/frontend/e2e/routes.spec.ts --project=chromium --project=mobile`. Compare generated `dist` HTML, sitemap, robots and redirects with the checked URLs. Verify current images and motion assets remain byte-identical where the SEO work does not intentionally change them. Read GitHub main CI, production deployment and live HTTP responses as separate evidence gates.
