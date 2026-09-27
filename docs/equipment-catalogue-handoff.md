# Equipment catalogue and wishlist — 27 September 2026

## Approved scope and working state

Implement the owner's approved equipment catalogue, detail galleries, Three.js demonstrations and moderated wishlist on `/components`, preserving existing product/project links. Original Downloads checkout remains untouched; implementation is in the attached `who-we-are/Armature Lab` worktree, branch `codex/equipment-catalogue`, starting at production commit `3490508c7a6cd9b80c808acd8865484c69977514` (PR #90).

This document is a progress record, not a claim that outstanding release checks passed. Purchases, supplier contact, final rates, paid activation and commissioning are separate. No supplier messages have been sent. The LLP-name-change/Razorpay hold, including test mode, remains.

## Procurement reconciliation

The three owner-supplied workbooks are candidate purchases, not owned stock. Read-only audit found 64 priced lines totalling ₹242,190 in `Inventory List.xlsx`, including one CR-10s printing setup totalling ₹79,500. This is not additional funding on top of the approved shortlist: replace/reconcile printer, controller, tools and power rows to avoid duplicate procurement.

| Category | Proposed quantity/configuration | Allowance INR |
| --- | --- | ---: |
| Jetson | Four complete Orin Nano Super kits | 180000 |
| GPU station | RTX 5070 Ti 16GB-class, 64GB RAM, 2TB SSD | 275000 |
| Mac mini | Current model, at least 24GB RAM / 512GB | 125000 |
| FDM printers | Two matching enclosed printers; P2S quote candidate | 160000 |
| Learning arms | Two SO-101 leader/follower sets (four physical arms) | 110000 |
| Raspberry Pi | Four Pi 5 kits, two 8GB / two 16GB | 100000 |
| Microcontrollers | Five Arduino / five ESP32 kits | 25000 |
| Vision | Two D435i-class + two USB RGB cameras | 100000 |
| Lidar | Two RPLIDAR A2-class kits | 50000 |
| Electronics | Two benches and one shared oscilloscope | 120000 |
| Support | Tools, peripherals, UPS, storage and spares | 80000 |
| Subtotal | Tax/delivery/accessories must fit the quotes | 1325000 |
| Contingency | Not automatically committed | 150000 |
| Total | Furniture/building fit-out excluded | 1475000 |

Exact models, landed quotations, service/warranty, delivery dates, serials, kit completeness, electrical/space requirements and commissioning remain to be confirmed. Do not contact vendors or order without explicit instructions. Do not publish these as available units. Add Thor, industrial arms, laser cutting and rapid PCB fabrication as zero-vote future wishlist candidates.

### Printer costing

Original example: 2 × 250 × 60% × 8 = 2,400 hours. ₹79,500 / 2,400 = ₹33.125/h capital; 0.35kW × ₹8.50 = ₹2.975/h electricity; 18g/h × ₹1/g = ₹18/h filament. Partial total ₹54.10/h; excluding separately sold filament ₹36.10/h. Multiplying by 1.25 is 25% markup / 20% margin, not 25% margin. True 25% margin divides by 0.75. The comprehensive workbook separately adds 150W hotbed and 350W printer: verify actual measured draw to avoid double counting. PSU ratings are not measured consumption.

Recalculate for the selected purchased printer. Include realistic utilisation, maintenance, spares, support, failure/downtime and avoid duplicating workspace overhead. ₹200/h is a target for evaluation, not an approved public rental price. No equipment student discount is implied.

Confirmed printer policy: trained self-service; lab-purchased approved spool belongs to member; prepaid one-hour minimum / 30-minute increments includes setup/heating/printing/clearing; lab equipment faults refund lost time with recorded reason, member mistakes chargeable; no unattended overnight continuation; no automatic power-off; extensions require availability/payment. No mandatory design/G-code website upload.

## Permissions and media

Approved basic members submit/vote/withdraw. Public reads only published, sanitized summaries. Admin/Super admin moderate and merge; membership-review Staff gain no procurement permission. Votes are demand, not orders or automatic purchasing thresholds.

Manufacturer/e-commerce images are requested for immediate previews. Preserve source/model/rights records and watermarks. Unconfirmed rights stay in a DEV-only local asset path, outside public build outputs. Product images do not represent installed Armature equipment. Live galleries require verified publication permission or original media; actual lab photos follow commissioning.

Wishlist images use authenticated raw uploads after draft creation, max 5MiB JPEG/PNG/WebP, rights acknowledgement, private scanning/metadata stripping, private storage and moderation before public display. Scanner WebP opt-in is limited to wishlist; registration/avatar endpoints retain JPEG/PNG restrictions. Unpublished images are visible only to their owner or Admin/Super admin. Failed/racing uploads queue for deletion.

## Release order and prerequisites

1. Run frontend, SQL, Edge/scanner and desktop/mobile browser checks against synthetic local data.
2. Review public/private RLS, moderator hierarchy, concurrent votes, image publication/revocation and vote merging.
3. Apply reviewed wishlist migration before deploying dependent endpoints. Do not run a blanket migration push that includes pending team/paid-booking changes.
4. Deploy tested scanner revision with WebP support before enabling WebP uploads; preserve existing scanner identity, secrets and maintenance pinning. Do not expose scanner credentials.
5. Deploy `equipment-wishlist-image` and updated retention worker. Set `EQUIPMENT_WISHLIST_CLEANUP_ENABLED=true` only after its table exists and managed cleanup validation succeeds.
6. Release verified catalogue/wishlist UI through checked PR workflow. Keep real equipment booking unavailable until commissioning, final prices and payment release approval.
7. Verify production routes, permissions, image boundaries and public release gates. Record exact commits/workflow IDs and test results below.

## Verification log

- Node 22.23.2 used from the existing local npm runtime cache.
- Production-equivalent build passed: 159 prerendered anonymous pages, 156 SEO page records; building/model/electrical/release/SEO checks passed.
- Local SQL suite: 18 files, 515 assertions; duplicate-vote and merge/vote concurrency checks passed. Isolated API58321/DB58322 only, synthetic data.
- Browser wishlist journey: desktop/mobile submit, publication, vote/withdraw, merge and membership-review Staff rejection passed; all three themes checked.
- P2S/Jetson: desktop1440/mobile390, all themes, two source references each decoded; simplified Three.js views visibly nonblank, hotspots usable, no horizontal overflow. Idle frame count unchanged after settling; repeated mount/dispose checked. Real-device memory performance remains unmeasured.
- Scanner: 22 Python tests pass, including WebP metadata stripping, malformed/trailing payload and animation rejection; Edge authorization/scan-failure/cleanup tests pass.
- New wishlist route required updating the SEO route-count assertion from 14 to 15 static pages plus catalogue records. Earlier release-flag test failures came from the local interactive .env.local; regression commands explicitly use the suite's closed-registration fixture flags.
- Full frontend suite: 327 tests passed across 37 files. Browser regression: 152 passed initially; three label/empty-state assertions corrected and all three passed on targeted rerun (155 validated cases; 13 intentional feature-gate skips). Two real local wishlist browser journeys also passed.
- Real local Edge/scanner integration passed: Chromium cross-origin JPEG/PNG/WebP uploads201, metadata removed, malware/malformed422, private owner/admin access, anonymous denial, role/membership revocation, moderated public image and unpublication. Synthetic accounts and stored images cleaned to zero. Reproduce with tools/onboarding-scanner/check_wishlist_edge.mjs against its guarded isolated local stack.
- Evidence: /private/tmp/equipment-final-tests.log, /private/tmp/equipment-e2e.log, /private/tmp/equipment-e2e-corrections.log, /private/tmp/equipment-wishlist-browser.log, /private/tmp/wishlist-image-check.log and /private/tmp/equipment-wishlist-db-logs/summary.txt. Visual review evidence remains local under output/equipment-catalogue-evidence; unlicensed photo references are excluded from Git and production builds.
- PR91 implementation commits:953711a,5680619,4fbe85e,5f432c7. Final PR CI36323771004 passed frontend and database checks. Squash-merged as9e655388a4d6a96c8ae4330b084b092a7ab236b5. Backend deployment evidence is below; paid activation is not included.

- Final retention review added cleanup for merged/deleted requests and deleted owner accounts, with five additional SQL assertions. Privacy notice explains moderated public equipment images and separate retention. Targeted cleanup/image/voting tests passed.

## Backend deployment evidence

- Production migration read-back confirms020 applied, with every prior migration matching and no deferred paid/team migrations.
- Cloud Build210cc36d-3187-4fa1-a4de-5f5ecb2acff9 succeeded; gateway digest43bd656d86d8ab0e4b24d8c898282a359381316dd124a19d8ae55b930b4ea734 deployed as scanner revision00008-8dn. Other service spec settings, identities, sidecar, resources and concurrency match the saved baseline. Maintenance copies the current pinned containers and therefore retains this new digest.
- Hosted synthetic PNG/JPEG/WebP scans returned200 and removed metadata; anonymous requests denied, malformed/EICAR422. Existing signed-in identity used; no IAM expansion. Builder default source bucket denied access; rerun used the existing authorized scanner source bucket successfully.
- equipment-wishlist-image and onboarding-retention deployed. EQUIPMENT_WISHLIST_CLEANUP_ENABLED=true. Anonymous missing-image404 and browser-origin preflight204 verified. Authenticated wishlist upload remains end-to-end proven locally, while hosted scanner and public endpoint boundaries are checked separately.
- Auto-review blocked manually invoking the shared retention job because its pending real-document deletion scope was not established. No workaround or manual run attempted; inspect the already-enabled scheduled execution for release verification.
- Existing scheduled retention execution at2026-09-27T13:55:11Z reported onboarding_retention_verified: batches1, examined0, deleted0, failed0 after the endpoint/flag update. This proves scheduled execution health with an empty queue, not a production synthetic deletion test. Website publication evidence follows below.

## Website publication

- PR91 squash commit9e655388a4d6a96c8ae4330b084b092a7ab236b5 is live. Main workflow36324321288 passed frontend, database and deploy-production. Production environment approval used the owner-authorized catalogue/wishlist scope. Production build, public gates, basic-registration fixtures, Cloudflare upload and live release/SEO/building checks passed.
- No paid rental checkout, commissioned inventory, final rental rates, procurement orders or Razorpay/Dodo activation was enabled. Rental UI remains planning-only. External product-photo rights remain unresolved; public pages use original schematics/Three.js studies, with manufacturer reference galleries kept locally.
- Independent live anonymous desktop/mobile checks passed: both models visibly render, idle rendering stops, disposal works, no overflow, no unlicensed photo requests, late printer slots blocked. Four live wishlist candidates remain at zero votes before/after read-only reload. Application writes were blocked; only Cloudflare analytics attempted POST. Evidence /tmp/armature-equipment-live-results.json and /tmp/armature-live-*.png.
- Live SEO HTTP readiness passed20 bounded probes. No authenticated production membership or upload mutations were used for this release's checks.

## Rental scope at the catalogue release

The catalogue release completes catalogue/wishlist delivery and a read-only equipment-session preview. It does not implement atomic combined equipment/workspace checkout, equipment-specific physical-unit commissioning/rate administration, paid extensions or fault-refund transactions. Those need a separate focused implementation and synthetic transaction tests before any paid rental activation; existing booking APIs were preserved. Do not interpret the preview or passing existing booking tests as completion of these new rental flows.

Supplier quotations, exact models, image publication rights, purchased-unit commissioning and actual building positions remain unresolved. Final rates, equipment purchases and payment activation require owner decisions. Existing workspace geometry/capacity and basic memberships remain unchanged.

## Follow-on rental preparation (local draft, not released)

- Continued the approved rental engineering after publishing catalogue/wishlist. Reused the isolated checkout on codex/equipment-rental-preparation, based on deployedmain9e655388. Reconciled held PR73 via mergecommitc05b71c; preserved deployed geometry, catalogue/wishlist SEO and public gates. Basic role regression plus merged frontend suite:364 tests/44 files passed.
- Current draft needs PR73 dated workspace/team access; no duplicate entitlement stub was introduced. Local production link file was renamed/preserved to prevent accidental deployment; explicit synthetic database58322 only. Original Downloads checkout remains untouched.
- Preparing commissioned physical-unit mappings, approved rate/tax versions, quote authorization and atomic mock capture with workspace/equipment reservations, multi-day in-lab retention, extensions and fault refund-due records. No real payment execution or stock/rate seeds.
- Source/UI/SQL verification and focused draft PR references follow when complete. Live catalogue remains unchanged during this draft preparation.

### Rental draft contract and remaining activation requirements

- Migration021 is a dependent draft on PR73, not a production migration. Both mock gates default off, physical-unit/rate tables start empty, and no payment provider is contacted. Do not deploy the combined migration chain to the live project.
- Quotes expire after15minutes and are not stock holds. Admin-only local authorization precedes reservation; capture is recorded only in the same transaction that creates equipment and workspace reservations. Failed coverage/conflicts roll everything back. Retrying an owned successful quote returns the same order.
- A combined booking reserves a chair using an existing paid day-pass entitlement; it does not purchase a new workspace pass. Existing personal or eligible team cabin reservations can supply coverage. Team Admins can choose a named enabled operator; website Admin alone does not grant team authority. Eligibility/training/rates/maintenance/closures are rechecked at confirmation.
- Daily kits reserve physical possession across nights, but daytime workspace access is required for every use date. This is in-lab storage, not overnight user access. The inherited kiosk/check-in validator still assumes one continuous visit and needs a dedicated per-day usage adapter before real multi-day rental operations open. Do not loosen its overnight access validation.
- Extensions are separate adjacent quotes bound to the same physical unit, operator and organization. Failed extensions leave the original reservation intact. Approved rate windows cannot overlap; changes need an explicit new effective period. No final equipment price or tax rate is seeded.
- Equipment-fault records identify the lost interval, reason and refund due. Overlapping fault intervals and refunds exceeding captured value are rejected. This ledger is not an executed refund: provider settlement and cancellation/refund operations remain part of the payment-release work.
- Before paid activation: approved supplier quotations/purchases, commissioning and location confirmation, approved rental/tax rates, production payment authorization/capture/refund adapter, joint new-pass checkout, daily-kit check-in adapter, admin operational UI and end-to-end provider failure reconciliation. Razorpay TEST stays on hold until the LLP decision is revisited by the owner.
- Verification added:369frontend tests across45files; production-equivalent build and156-page SEO checks;660baseline SQL assertions across23files and nine baseline race scripts. Public browser checks:28pass/3intentional skips, with the model-load timeout corrected from5to15seconds and desktop/mobile beta tests passing afterward. Logs: `/private/tmp/rental-final-unit.log`, `/private/tmp/rental-final-build.log`, `/private/tmp/rental-final-browser.log`, `/private/tmp/rental-beta-browser.log`, `/private/tmp/rental-baseline-regression/summary.txt`.
- Updated draft PR73 at ccbf4ea; CI36326687336 passed frontend/database and skipped deployment. New dependent draft PR92 starts at2313597 and targets PR73, with migration021 never deployed.
- Actual local desktop/mobile browser journeys completed team-operator quote creation, Admin mock authorization and equipment reservation against an existing whole-cabin pass. Wrong workspace dates were rejected without capture. Evidence `/tmp/rental-browser-results.json`; the first visual pass found overly long coverage lists, addressed in the follow-up below.
- Final rental SQL:48 assertions pass, including revoked payer, nonseated team-admin visibility and cross-account workspace-ID rejection. New concurrency test passes: one unit winner captures, the loser remains authorized, and the losing workspace reservation rolls back. Evidence `/private/tmp/rental-sql.log` and `/private/tmp/rental-race.log`.
- Final visual correction filters coverage to selected dates and uses compact checkbox styling; the selected-date change removes stale selections. Desktop/mobile actual transactions passed again, with screenshots visually inspected and no horizontal overflow. Latest results `/tmp/rental-browser-results.json`, `/tmp/rental-desktop.png`, `/tmp/rental-mobile.png`. Extensions were checked in SQL/unit tests, not a full browser transaction.
- Final frontend suite:370 tests/45files; six rental UI cases and TypeScript pass. Both local mock gates false after cleanup; zero rental units, race accounts and browser fixture records remain. Temporary synthetic-audit cleanup bypasses were transaction-scoped and restored. No production data was used.
- Nonseated team Admins can reuse existing cabin coverage for an eligible named operator. Creating a new workspace allocation retains the inherited actor-entitlement rule; this draft does not expand that workspace API.
