# Resource comments and corrections — 25 October 2026

## Scope
Basic members (confirmed email) may submit comments or corrections on either published actuator document. The owner selected public visibility after Admin/Super admin approval. Pending/rejected submissions and review notes are private to the author and admins. Membership-review Staff have no moderation permission. Publication uses an explicitly chosen display name and consent; account email and registered name are never copied into the public projection. Suggestions do not edit the source reports.

## Implementation
Separate document discussions, optional section/model reference and source URL, author withdrawal, paginated review queue, public editorial responses, revision checks, payload-bound retry keys and per-member submission limits. Private tables have no client grants; narrowly scoped RPCs enforce eligibility and moderation. Existing membership, identity, mobile and payment rules remain intact. Reports and standalone service-worker exclusions are preserved.

## Checks
- Final full frontend suite: 870 assertions / 75 files passed; build, resource artifacts and 170 SEO route shells passed.
- Fresh network-isolated, schema-only database replay: 74 migrations, 39 suites and 1,223 assertions passed, including 71 feedback assertions. No real accounts or records copied. Cron disabled; test fixtures rolled back.
- Database evidence: `/private/tmp/armature-feedback-replay-1792915329661/{result.json,replay.log}`. Migration SHA256: `fd598df410f8682f09212db7460ef761290681635d64c6517a24313bc11c027d`.
- Independent review identified draft loss during list refresh and missing admin sign-in return. Both were corrected and regression-tested.
- Existing desktop/mobile browser suite: 166 passed, 24 pre-existing optional checks skipped. Dedicated synthetic feedback suite: all 6 desktop/mobile cases passed; it now runs in CI. Screenshot evidence under `/private/tmp/armature-resource-feedback-e2e/`. Mocked UI checks are complemented by the real SQL permission tests above.

## Release procedure
Apply only `202610250001_resource_feedback.sql` transactionally with its exact source in the migration ledger and a PostgREST reload. Do not run unrestricted database push: unrelated historical ledger gaps exist. Confirm anonymous public reads and denied private/moderation access without creating hosted synthetic members or sending email. Merge the focused PR with squash after CI; deploy through the normal main workflow. Verify the rendered live page, both report links and installed-worker update without clearing member storage.

Release status: local checks passed. Automatic approval review rejected a pre-merge migration attempt; no production mutation occurred. Complete reviewed squash merge and CI before applying the scoped migration and promoting the frontend.
