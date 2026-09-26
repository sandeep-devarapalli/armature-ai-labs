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

- The reconciled SEO work is in [PR #74](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/74), branch `codex/seo-current`, first commit `c5f95bd`. Its GitHub CI, merge and production outcome must be read back separately.
- Open PR #63 was built before the currently approved T2 scenes, square logos, favicon and MHS cover. A direct merge would overwrite those assets. Its prerender, sitemap, route metadata, redirects and HTTP checks were ported to `codex/seo-current` from merge commit `6427378`, with the current `/about/` indexed and `/team/` prerendered but noindex. The MHS article keeps the selected 1672 × 941 Common interface cover in Open Graph, Twitter and BlogPosting data.
- The older PR's reviewed MHS engineering revision and click-to-play video were carried forward without replacing the approved cover. Homepage, membership, services, ecosystem and electrical-plan wording now distinguishes planned facilities and resources from operating ones. The newer T2 video placements remain intact.
- `/about/` and `/team/` use the shared route metadata after hydration; the older page-local title effect was removed so navigation cannot race with the SEO head manager. The final desktop/mobile SEO browser rerun passed all four checks, including About and Team transitions.
- SEO validation: `npm run build:demo` and `npm run build` both passed (153 indexable HTML pages, 155 prerendered paths including noindex pages, sitemap, robots, asset checks); `npm test` passed 107 tests. The local Cloudflare runtime passed 20 HTTP probes on both demo and non-demo builds. The combined desktop/mobile SEO, route and theme suite had 108 passes, 2 intentional skips and four outdated test assertions; all four passed after updating selectors for the source-linked list and demo-mode membership copy. The non-demo release-gate suite had 15 passes, one intentional skip and two stale copy assertions; both passed in the focused rerun. `npm run audit:all` found 0 vulnerabilities on the locked dependencies.
- Dependency PRs are being reviewed against the Node 22 runtime and current main. PR #72 (one-line upload-artifact action update) was rebased onto current main and its new CI is running. Do not merge #35 (`@zxing/library` requires Node 24), #34 (Node 26 types), or #14 (TypeScript 7 migration) as routine updates. #37 (MapLibre) and #36 (Lucide major) need current-main CI and rendered checks before merge.
- Old branding PR #57 is superseded visually. Its correction of unsupported six-axis, machine-shop and booking claims has been adapted to the current pre-launch copy in this branch; do not copy its replacement claims that imply equipment is already operating. Close #57 only after these corrections are merged.

## Verification for Claude

Review the final diff and commit history for `codex/seo-current`, then run the exact commands recorded in its PR description. Compare generated `dist` HTML, sitemap, robots and redirects with the checked URLs. Verify current images and motion assets remain byte-identical where the SEO work does not intentionally change them. Review GitHub main CI, production deployment, and live HTTP responses as separate evidence gates.
