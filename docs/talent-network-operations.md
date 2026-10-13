# Talent Network operations

Release scope: public directory at `/talent-network/`, shared Armature sign-in, private claim/correction/removal requests, administrator review and approved-owner editing. Marketplace and payments remain unavailable.

## Review requests

Admin and Super admin accounts open `/talent-network/#review`. Membership-review Staff have no directory approval permission. Independently confirm that a claimant controls the listed professional identity before approving; a confirmed account email alone is insufficient. Record the evidence considered in the private review note. Another administrator must review an administrator's own request.

Correction approvals require a reviewed JSON patch using the editable fields. Rejections require an explanatory note. A request tied to an outdated profile revision must be rejected with instructions to submit fresh evidence. New claim, correction and removal requests notify the confirmed `hello@armatureailabs.com` account while it holds Admin/Super admin authority. Approval and rejection decisions notify the requester at their confirmed account email. Messages contain the request type, outcome and a signed-in portal link; evidence and review notes stay in the portal. Requesters can read their private history at `/talent-network/#requests`, including after a profile is removed. Staff should still check the queue if email is delayed.

Approved owners can edit their details or immediately unlist their profile. Other people may request removal after email sign-in. People without an account can email `privacy@armatureailabs.com`; staff should verify the request, then submit and independently review it. Removal unpublishes the record and retains a private suppression reference to prevent accidental re-import. Do not expose request evidence, owner IDs or review notes publicly.

## Import and provenance

The owner authorized listing the supplied third-party export and this public launch. Source SHA-256: `bc56bc4e217dd8154bb5592ed0f6cd54de09a39af6643243eeab32e3c7f39447`. Import validation reconciled 8,025 unique IDs and LinkedIn identities, with no rejected records. Source date: 13 October 2026. All records begin unclaimed, availability unknown; categories and total experience remain source-reported.

The raw export, validated data and detailed quality classifications remain local, excluded from version control and browser bundles. Run `scripts/import-talent-directory.mjs` against the approved source to create the validated local dataset and private report. Import through `talent_import_profiles` in batches of at most 500 with a trusted service/database role. It is insert-only: existing identities, owner edits and suppression records are preserved. Never import synthetic test profiles into production.

## Verification and rollback

Run the frontend tests/build and `supabase/tests/talent_network.sql` in an isolated database. `scripts/test-talent-http.mjs` is explicitly restricted to `armature_talent_launch_check`, uses synthetic accounts, and validates the full import plus sign-in/request/approval/edit/removal flows through HTTP. Generated local test credentials must never be committed.

For an emergency directory shutdown, unpublish affected `talent_profiles` rows or revert the frontend route. Preserve requests, ownership, review history and suppression records; do not drop tables to roll back a frontend release. The directory fetches published records from Supabase and never falls back to the original static dataset.

## Request emails

Talent notices use template version 4 in the existing transactional outbox and Resend sender. Existing templates remain unchanged. Queue events are created in the request/decision transaction, deduplicated by request, event and recipient, and revalidated immediately before sending. The existing signed wake-up, scheduled recovery, provider idempotency, delivery receipts and suppression rules apply. An accepted provider request is not proof of inbox delivery; inspect delivery status in the protected notification operations view.

Keep `member_notification_settings.talent_notifications_enabled` disabled until the database migration, version-4 sender and My requests page have been deployed. Enable it only for future events. Never replay held history automatically. Email changes, lost administrator authority, revoked/suspended accounts and suppressed addresses prevent delivery. Disabling the talent switch stops talent notices without changing membership delivery or cleanup settings.
