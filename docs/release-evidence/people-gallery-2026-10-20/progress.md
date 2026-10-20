# People gallery release — 20 October 2026

## Approved scope
Selected option 01 People gallery. Owner authorised implementation and publication, with live verification. Public browsing, member-owned opt-in name/bio/skills and separate consent for scanned retained avatar. No automatic publication of existing member records or private documents. Basic confirmed-email membership can participate; suspension/revocation remains effective. Paid access and payment hold unchanged.

## Plan
1. Add narrow opt-in directory table/RPCs and consent-scoped avatar endpoint; test privacy boundaries locally.
2. Replace /members and /members/:handle with selected gallery; add My public profile settings independent of gated paid-member workspace.
3. Test frontend, database, desktop/mobile and build; review data exposure independently.
4. Release database and avatar endpoint before frontend via focused PR, squash merge and approved production workflow.
5. Verify live public empty/opt-in state without publishing any person's data on their behalf. Record results/commits/limitations here.

## Progress
- Isolated managed worktree: people-gallery; branch codex/people-gallery. Original working folder preserved.
- Implementation underway. Existing legacy /members read active legacy profiles; replacement uses new opt-in safe projection instead.

## Verification so far
- Full frontend suite initially passed: 793 tests / 69 files; build and release/SEO artifact checks passed. Final regression run follows review fixes.
- Independent privacy review fixed exact-avatar consent binding, same-account refresh preserving edits, and independent Hide action that ignores invalid unsaved drafts.
- Isolated schema-only Docker replay passed all 71 migrations and all 37 database SQL suites, including 26 new gallery assertions; no real accounts, credentials or production records copied. Harness requires Supabase-equivalent default function privileges and pgsodium preload for existing Vault tests. Initial harness failures were corrected, no tests skipped. Evidence: /private/tmp/armature-gallery-replay-1792480768135/replay.log and result.json.
- Avatar endpoint unit checks: 5 passed, including hidden/replaced photos and no private path exposure.
- Actual React component preview: http://127.0.0.1:4358/output/people-gallery-proof/index.html. Labelled synthetic, injectable client, no auth/uploads/backend requests. Production pages use the configured Supabase client and real opt-in records, not this fixture.

## Final pre-release checks
- Frontend: 802 tests / 71 files passed (`npm test`); build, artifact and SEO checks passed (`npm run build`). Logs /private/tmp/people-gallery-tests-final.log and people-gallery-build-final.log.
- Browser: six tests passed (desktop/mobile × light/dark/sepia), covering quick interest search, clearing search, public detail, explicit text-only publication, photo choice and hiding after invalid edits.
- Database: gallery suite expanded to 28 passing assertions; all 37 suites passed. Real concurrent local avatar replacement waited on consent transaction, then remained private; /private/tmp/gallery-concurrency.py.
- Independent final review found no remaining release-blocking privacy issues. Account switches invalidate stale saves; same-user refresh preserves drafts.
- Production prerequisites checked read-only through Supabase CLI: existing Basic eligibility and member_avatars ready; directory absent. Apply only new migration, not historical pending/held migrations.
