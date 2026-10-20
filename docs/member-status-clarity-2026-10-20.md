# Compact admin member status

Current server-derived membership level is separate from identity application progress. Basic email-qualified accounts are active even when they have not sought Verified status. Keep restricted/revoked access explicit; do not infer approval from uploaded files or revoke approval on retention deletion.

Changed admin Members table to compact tier tags and email/mobile/identity progress, smaller header/avatar/table spacing, scoped review counts and document availability in details. No backend, permissions, real member records or payments changed.

Validation: 803 frontend tests and build/artifact/SEO checks passed. 12 focused unit tests and two desktop/mobile browser cases passed. Synthetic actual-component proof at http://127.0.0.1:4359/output/member-status-proof/index.html. Root visually inspected and exercised Refresh. Screenshot /private/tmp/member-status-compact.png. Production not changed by this branch.
