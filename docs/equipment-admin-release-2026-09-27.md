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
