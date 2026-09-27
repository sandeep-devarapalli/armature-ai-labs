# Equipment administration production release

The owner authorised publication, then explicitly selected “Publish equipment administration; keep payments closed.” Rates may be revised after actual purchases. No stock, rental rate, tax treatment, payment provider or paid subscription is activated by this release.

## Release scope

- `/admin/equipment`, reachable from the signed-in account menu for Admins/Super admins. Basic registration can remain open while the paid member-platform gate stays closed.
- Audited physical-unit linking/commissioning, kit contents, recorded location, maintenance and rate-version administration. No membership-review Staff equipment rights.
- Six required schema migrations: `202609250001`, `202609270012`, `202609270013`, `202609270014`, `202609270021`, `202609270022`. Apply together in one transaction, with guards and the migration ledger updated atomically.
- Independent Gmail migration `202609260001` and combined mock-checkout migration `202609270023` are excluded. Customer checkout, team screens, daily-use screens, payment providers and booking workers are not released.
- The team/dated-access dependencies replace legacy booking checks. Live aggregate preflight found zero active paid memberships, future confirmed bookings or open attendance, so there is no existing paid use to interrupt. Basic registration/approval and avatars remain separate. Preserve their aggregate hashes before/after.

## Verification before release

- A clean checkout of current main was used; held rental drafts and the original Downloads checkout are preserved.
- Node22 full frontend suite:338 tests/39 files passed. Basic-enabled/paid-disabled build passed TypeScript and all existing artifact/156-page SEO checks. Logs: `/private/tmp/equipment-admin-release-unit.log`, `/private/tmp/equipment-admin-release-build.log`.
- All six migrations applied in one local transaction after a main-only reset of isolated DB58322. No transient older team permissions were exposed. Full SQL/race results and browser evidence are recorded below when complete.
- Production preflight: applications1, avatars1, role rows2; active paid memberships0, future confirmed bookings0, open attendance0. No personal data export. Aggregate baseline saved in `/private/tmp/armature-equipment-production-release/baseline.json`.

## Activation and rollback boundaries

Keep `VITE_MEMBER_PLATFORM_ENABLED=false`, booking mock grants false and equipment mock payments false. Products remain disabled, physical rental units/rates empty until separately configured from real inventory. A new rate version affects future quotes; recorded transactions retain their agreed amounts.

On a failed database batch, the entire transaction and ledger entries roll back. On a frontend regression, redeploy the previous checked main revision while keeping payment gates closed; do not destructively drop new tables. Stored migration/function evidence remains in the private temporary release directory. No blanket migration push or seed against production.

Next operational work is purchase/receipt intake, exact kit and location confirmation, commissioning, and approved provisional rate/tax entry. Real checkout needs provider authorization/capture/refund and failure reconciliation after the owner resumes payment onboarding.

- Exact release SQL:24 files/735 assertions and11 concurrency scripts passed. Both gates false; no products enabled/priced, rental units/rates/orders/entitlements, or booking inventory retained. The combined-checkout table is absent. Logs: `/private/tmp/equipment-admin-release-db/summary.txt`, `/private/tmp/equipment-admin-release-atomic-apply.log`.
- Actual local browser on isolated release4352:10 role/device cases passed (anonymous, Member, membership-review Staff, Admin, Super admin × desktop/mobile), basic registration true and member platform false. Only Admin/Super admin can load the page/menu; paid booking stays closed for all. Evidence `/tmp/admin-release-smoke-results.json`, `/tmp/admin-release-smoke.cjs`, `/tmp/admin-release-{admin,super_admin}-{desktop,mobile}.png`. Synthetic accounts removed; screenshots inspected.
- Public gate/browser run initially passed14 cases/1 skip but the desktop building model exceeded the old5-second seat-load assertion; the same15-second bounded model readiness assertion already validated in the held rental draft is included here. No application failure or missing seats was observed; the mobile case passed. Targeted rerun is recorded below.

- Targeted booking-beta rerun passed desktop and mobile (2/2); combined with the initial successful cases,15 public/browser cases pass with1 intentional skip. Log `/private/tmp/equipment-admin-release-beta-rerun.log`.

## Production execution

- Release commit `fd8c9ac5dda16c2fea2ac2b47431cb750972371b`; PR95 frontend/database CI36330346268 passed. Squash merge is `3585b6e8077e28e3d3e559e029d9031c1cd0dd79`. Main workflow36330978787 is the deployment run.
- Reviewed atomic batch SHA256 `51202a0e5e054b21fef5cb2d9b2f80d2fe9e51fd60d3feaa03129a422ec9b2af` applied successfully through `supabase db query --linked --workdir /private/tmp/armature-equipment-production-release --file .../apply-equipment-admin.sql`. Result `equipment_admin_schema_committed`; all six ledger records read back.
- Read-only verification: mock grants=false, mock payments=false, units0, rates0, configured products0, combined-checkout table absent, anonymous execute denied. Both existing configured Admin accounts passed the operations function under their account claims; this is SQL-level authorization verification, not a real browser login claim. Missing-account denial also passed.
- Applications, avatars, staff roles and review-history aggregate hashes exactly match before/after. Existing function definitions saved privately before the batch. Evidence: `applied.json`, `verified.json`, `baseline.json`, `after.json`, `before-functions.json` in the private temporary release directory.
- The held customer/team/combined-checkout drafts remain separate. This release does not authorise their remaining UI, independent Gmail delivery change, purchases, real rates/tax, payments or real stock commissioning.

- Deployment36330978787 completed, but additional direct URL verification found `/admin/equipment` returned404 because its app-shell rewrite was missing. Follow-up adds both slash variants and exact live HTTP/noindex probes. No additional database changes.
- Routing follow-up: Node22 build and actual Cloudflare Pages runtime passed all22 HTTP probes, including both equipment-admin paths. Independent review found no issues. Logs: `/private/tmp/equipment-route-build.log`, `/private/tmp/equipment-route-runtime.log`.
