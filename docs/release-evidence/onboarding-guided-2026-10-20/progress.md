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

Implementation only: no schema, production database, SMS/email or payment configuration was changed. Local browser proof uses synthetic responses, not a live registration submission. Current live deployment is unchanged pending release of this focused PR.
