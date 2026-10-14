# Guided own-profile submission

The owner selected Option 01 Guided steps on 14 October 2026. The owner subsequently authorized new-profile emails and production publication.

Flow: confirmed basic membership → canonical LinkedIn identity check → private draft of public details and private evidence → public preview and signed ownership/publication declaration → independent manual review → one published, owned profile.

Existing public identities route to their profile and claim flow. Removed/suppressed identities must not be republished through self-submission. Private drafts and review evidence never appear in the public directory. Ownership approval is not identity verification or skill certification. Registration photos require the existing explicit photo-preview and consent workflow after approval.

Acceptance: saved draft/reload; duplicate URL handling; unauthorized reads/writes; bounded inputs; declaration snapshot; pending editing denial; request changes and resubmission; rejection; independent approval; stale review denial; public-field sanitization; owner editing; claim/photo regressions; desktop/mobile and all themes.

Version-5 email templates now cover submission receipt, designated admin alert, approval, rejection and requested changes. Emails contain only protected portal links, with no profile details or private evidence. Existing claim/correction/removal email behavior is unchanged. Real payments and marketplace publication remain gated.

## Verification completed

- 703 frontend tests across 63 files passed. Existing release-default tests were run with basic-onboarding and membership-level flags explicitly false; the local browser uses enabled basic onboarding.
- Six isolated database suites passed: submissions, admin editing, claims, network, notifications and photos.
- 27 isolated HTTP checks passed, including privacy, duplicate identity/import races, independent review, revision conflicts and owner editing.
- Browser journey with disposable synthetic accounts: confirmed membership, unique LinkedIn check, private draft, reload/resume, public preview, signed submission, pending status, independent admin approval, applicant decision history, claimed profile and successful owner edit. Fixtures were cleaned afterward.
- Desktop light/dark/sepia inspected; 390px mobile frame rendered without document overflow (390px content/390px viewport).
- Isolated build, route materialization, release artifact checks and SEO checks passed. Existing build warnings about sample-projects.png and bundle size remain.
- Screenshots: guided-desktop.png, guided-mobile.png and approved-owner-desktop.png. Browser testing used only localhost and synthetic data.

## Release verification

- Production identity preflight: 8,025 profiles, all published; zero invalid canonical LinkedIn identities, zero collisions, zero suppressions.
- Same-user auth refresh preserves unsaved work. Both claim and new-profile approval share the requester ownership lock and reject a second owned profile.
- Sender regression and database notification tests passed; revision deduplication, stale-event cancellation, private fields, receiver permissions and earlier templates preserved.
- Production-configured build and Pages runtime checks passed.
- Deployment order: compatible sender first, two scoped migrations second, frontend last. Marketplace and payments remain unavailable.

Production deployment and live checks will be recorded after execution.
