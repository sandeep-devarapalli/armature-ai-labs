# Approved member photo flow — 25 October 2026

The owner selected the interactive HTML preview at `output/member-photo-flow-preview-2026-10-25/index.html` and authorised implementation and publication after testing.

The member card now distinguishes saved, empty, unavailable-status and image-loading-error states. Selecting a file or verification photo opens a preview; only explicit retention consent and Save send it to the existing scanner and storage service. Cancel preserves the current photo. Removal requires confirmation. Public-gallery permission remains separate and tied to the saved image.

Own avatar metadata establishes presence independently from image loading. Verification reuse accepts only the member's available photo document, detects PNG/JPEG from its bytes, and uploads the exact previewed File. Mutation requests check the account against the same session token used by the request. Account/step changes clear private previews and object URLs. Registration navigation is disabled while loading a verification preview or saving/removing a photo; cancellation restores keyboard focus.

No database migration, Edge Function change, notification or payment change is required. Existing server image scanning, retention cleanup, ownership and public-photo consent checks remain authoritative.

## Validation

- Full unit suite: 885 tests in 75 files passed; includes 18 focused avatar tests plus scanner and public-image permission regressions.
- Existing real SQL privacy/consent suites: 61 assertions passed in isolated local Docker, with network disabled and cron off. All synthetic records rolled back; the container was stopped. Evidence: `/private/tmp/avatar-consent-db-1792919755409/result.json`.
- Final clean registration browser suite: all 46 desktop/mobile cases passed, including 10 photo-flow cases with contrast, strict focus and true viewport-width assertions. Existing site browser suite: 166 passed, 18 optional cases skipped.
- Build, 97 release-artifact checks and 170 SEO route shells passed. Browser builds compile the final source; focused avatar/scanner/sharing tests passed all 32 assertions after the final focus refinement.
- Independent reviews found and resolved save-navigation and keyboard-focus issues. Measured geometry also corrected duplicate header scroll offsets and contained hidden completed-step labels that expanded the mobile layout from 390px to 614px. Strict browser checks use the actual viewport width and verify the preview heading clears the sticky header. Review uses synthetic records and images; no real member photo is changed to demonstrate the flow.

Release through reviewed PR, squash merge, required CI and the existing production deployment workflow. Verify the signed-in live card and update activation while preserving member storage. Record deployment results separately in the release receipt.
