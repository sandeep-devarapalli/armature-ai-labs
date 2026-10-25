# Combined membership updates — 25 October 2026

The owner authorized one combined PR and publication of the mobile-number and application-review changes, superseding the earlier review-only hold.

The saved details number carries into verification, with country selection and explicit SMS sending. Submitted applications remain readable when document copies expire. Members submit separate, revision-bound corrections; approved details and identity decisions remain active until independent review. Phone ownership, email authentication and paid access remain separate.

The protected update queue supports pagination, private evidence, withdrawal and independent review. Pending corrections block approval of the original application. Identity changes require current evidence; LinkedIn-only changes do not open approved-member upload forms. In-flight operations lock navigation and retain their selected panel and confirmation. Queue and notification panels use distinct keys so background refresh cannot duplicate them or move the selected heading out of view.

Validation covers the full unit and registration browser suites, deferred request/navigation regressions, repeated member View focus/viewport checks, and desktop/mobile light/dark screenshots. The fresh isolated backend replay passed 75 migrations, 40 suites and 1,320 assertions, including 97 update assertions. Synthetic fixtures only; no real SMS, application edits or document uploads were used for QA.

Release procedure:

1. Squash merge the exact checked PR head after both required CI jobs pass.
2. Apply only `202610250002_onboarding_updates.sql` transactionally, with prerequisite/absence guards and its exact source recorded in `supabase_migrations.schema_migrations`; reload PostgREST. Do not run unrestricted database push.
3. Deploy only `onboarding-document`, retaining its authenticated request checks, scanner, private storage and existing JWT configuration.
4. Promote the frontend through the existing main production workflow after its checks pass.
5. Verify function permissions and anonymous denial without creating production test members, then verify the rendered release in the existing signed-in Chrome session without changing account records or clearing storage.

Tested migration SHA-256: `435351ae40d0aa10c36d62f50906b8f6a8109141ff671e67c8cd6d7c73f69159`.

Release receipts and live evidence are recorded outside the checkout in `/Users/dev/Downloads/Armature Lab/output/membership-updates-release-2026-10-25/`. Backend tables are additive and must remain if the frontend needs rollback; never drop proposal or audit records as a rollback step. No new email notification templates or unrelated platform/payment activation are included.
