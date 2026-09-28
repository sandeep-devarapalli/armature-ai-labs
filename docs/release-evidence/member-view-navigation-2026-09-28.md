# Member View navigation

The View action updated a detail panel below the member table without moving the viewport, making it appear inactive. Explicit View now focuses and centers the selected member heading, including repeated selection. Refresh retains focus. Membership decisions and roles are unchanged.

Base: origin/main bd3fee2. Branch: codex/member-view-navigation.

Validation (Node 22):
- `npm test`: 357 tests passed, 41 files.
- `npx playwright test --config playwright.basic-registration.config.ts tests/basic-registration/member-management.spec.ts --output=/private/tmp/member-view-navigation-evidence`: 8 passed, desktop/mobile; synthetic backend only. Incomplete and submitted applications, repeated View, heading focus and viewport checked.
- `npm run build`: passed TypeScript, build, model/release/SEO artifact checks (156 public pages).
- `git diff --check`: passed.

Inspected screenshots: `/private/tmp/member-view-navigation-evidence/member-management-View-bri-1805b-te-member-details-into-view-mobile/member-view-incomplete.png` and `/private/tmp/member-view-navigation-evidence/member-management-View-bri-5a38a-ed-member-details-into-view-chromium/member-view-submitted.png`; selected heading and Manage staff role are visible.

No production writes, real member submissions or role changes. Merge/deployment remains with the release owner after CI.
