# Draft reconciliation — 27 September 2026

Baseline: main `a3c0b3d0f3b3d59e949d796c278330643cb4a3ae`. User authorized reconciliation of older drafts after equipment administration release, with payments closed.

## Dispositions

| PR | Disposition | Preserved head |
|---|---|---|
| [73](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/73) | Retained draft; unique held work remains | `ccbf4eafc31299f0cf5628cd02e909424c50727a` |
| [78](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/78) | Closed as historical local study; unshipped simulator retained | `8643395191f96e925244a3d7279d1a89922d548b` |
| [79](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/79) | Closed as superseded by focused releases | `e78afd7348cfb8dc1b51ae3e861c2cabd7c1f4b4` |
| [92](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/92) | Retained draft; unique held work remains | `c849f50ef31d84c1fa3ceada4603c51bbbccffa8` |
| [93](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/93) | Retained draft; unique held work remains | `d969e2635c6f8025ed82b01cb95ef900a57865fa` |
| [94](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/94) | Retained draft; unique held work remains | `1dd257452e4879d0222fb9f7de19c4681c9148e4` |

## Comparison findings

- PR73: four team/policy/inventory migrations (250001, 270012–014) byte-identical to main. Customer team/workspace screens, admin booking controls and separate Gmail260001 remain held.
- PR78: membership simulator, mock refund/overnight/event/renewal experiments remain on its preserved branch. Closing is not a claim that these shipped.
- PR79: secure onboarding/privacy/scanner/retention superseded through PR80/81 and subsequent releases. Migrations260002/003 identical;004 differs only in trailing newline. Main has later role/avatar protections.
- PR92: rental021 migration and SQL/race tests identical to main; customer EquipmentRentalBooking and preview/tests remain held.
- PR93: operations022 migration and SQL/race tests already released. Main Admin copy/access tests/routing are newer. DailyEquipmentAccess and member/kiosk UI remain held.
- PR94: bundle023 migration/tests and expanded customer checkout/types remain unreleased.

## Safeguards

No source branches were deleted, rebased or force-pushed. No code, database, deployment, payment gates, accounts or inventory changed. Original dirty worktrees were preserved. Stacked bases remain unchanged: 73→92→93→94. Reconstruct focused remaining slices on then-current main and validate before release; do not wholesale merge stale stack tips. Gmail delivery must be a separate release decision.

Dependency PR14/34/35 are outside this cleanup and unchanged. Purchases, final rates and LLP/payment onboarding remain deferred.

## Evidence

Read-only independent audits covered78/79 and92/93/94; root audited73 and verified four migration blob identities. Original and revised GitHub descriptions saved in `/private/tmp/armature-draft-cleanup-20260927`; GitHub descriptions retain original text in a historical section. Final verification checks closed/open draft status, unchanged heads/bases and remote branch presence. No application tests were rerun because this task only changes PR metadata and this audit note.
