# Guided onboarding implementation

Owner selected Option 01 Guided path on 20 October 2026. Base: origin/main `0d77ed2` (pixel design system, PR #147). Isolated managed worktree preserves the original dirty checkout.

## Scope

Five steps with existing Supabase operations: membership explanation, details, mobile verification, private documents, review and submit. Identity review can be submitted while mobile verification remains pending. Verified and Premium are server-derived; roles, payment gates and existing approvals remain separate. Admin application review remains at `/admin/members`. No schema or provider changes.

## Verification

- Node 22.22.2; `npm ci --no-audit --no-fund` used the committed lockfile.
- `npm test -- --reporter=dot`: 68 files, 787 tests passed. Guided form coverage: 13 tests, including failed uploads, consent, delayed final-submit response, account switching and retained/revoked identity states.
- `npm run build`: passed TypeScript, Vite and existing release/SEO artifact checks. Existing large-bundle and sample-projects image warnings remain.
- Actual component rendered with a synthetic client at desktop 1440px and mobile 390px: five steps, both uploads, final confirmation, pending summary and approved-member management passed. Light/dark/sepia tested; no horizontal overflow, browser errors or external requests.
- Screenshots: `desktop-overview.png`, `mobile-confirmation.png`. Local reproducible harness/scripts remain at `output/guided-onboarding-proof/` (excluded from production changes); Vite preview uses port 4356. No production member records were used.
- Initial regression run exposed missing jsdom `scrollIntoView`; added the browser-API test stub, then reran successfully. Browser review found oversized inherited hero spacing; scoped CSS now puts the steps nearer the top.

## Release boundary

Implementation only: no schema, production database, SMS/email or payment configuration was changed. Local browser proof uses synthetic responses, not a live registration submission. Owner subsequently authorized squash merge and production release on 20 October 2026. Release verification is recorded below.


## Release revision — membership choice

- Explicit Stay Basic, Become Verified and Explore Premium choices; server-Verified members also see Stay Verified. These navigate without mutating membership or buying anything.
- Premium overview links to `/join#premium-plans`: day/week flexi, monthly reserved desk and whole six-seat team cabin. Corrected old seven-cabin copy to the approved four cabins and 25 shared desks.
- Personal LinkedIn profile is visibly required, trimmed and checked before submission against the existing database rule. Database submit/resubmit already reject absent or invalid profiles; no migration is needed. Staying email-confirmed Basic does not require identity application details.
- PR CI identified six old browser tests which assumed documents were always visible. Updated their navigation to Documents and Review steps while preserving scan failure, focus, retry, consent and final revision assertions. Also updated the gated membership-level browser tests for summary/manage navigation.
- One full local test run timed out in the unrelated resource-library test while browser builds ran concurrently. Bounded-worker regression run follows; no timeout or assertions were weakened.

Final local verification: 788/788 unit tests across 68 files passed with two workers; `npm run build` passed. Registration browser suite: 26 passed with 6 tier-gated skips; membership-level-enabled suite: all 34 passed. Empty and company LinkedIn URLs are rejected before any submit RPC. A previously latent talent-draft test race now waits for its mocked asynchronous request to start before resolving it; production talent code is unchanged. Rendered final evidence includes `membership-choices.png` and `tested-submit-{chromium,mobile}.png`.
