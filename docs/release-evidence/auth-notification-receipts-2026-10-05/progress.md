# Sign-in notification monitor repair — 5 October 2026

## Diagnosis and scope

The scheduled monitor correctly raised attention for uncorrelated delivery events, but sign-in emails were missing from its source classification. Exact Resend IDs confirmed two delivered sign-in emails. The older email generated two aged reports (sent/delivered), causing repeated failed checks. No failed or overdue membership/Atlas notifications were present.

## Implementation status

- [x] Verified exact provider IDs and sender/subject metadata without opening sign-in links.
- [x] Add signature-verified metadata classification at webhook boundary.
- [x] Add private audited classification, retain immutable receipts, protect cross-source ownership.
- [x] Verify unknown, delayed, negative and reordered callbacks and existing notification regressions.
- [ ] Review and merge focused PR.
- [ ] Apply only the new migration, deploy only the changed webhook, reconcile exact confirmed IDs.
- [ ] Verify normal scheduled success and Google Cloud incident closure.

No new email, changed recipient, membership/payment activation, alert muting or cleanup activation is authorized by this repair.

## Pre-release verification

- Independent review found no remaining issues after both provider-ownership directions were protected.
- Frontend suite: 565 tests passed; final webhook suite: 49 tests passed after adding the signed project-header cases.
- Production build and 9 Python monitor tests passed.
- Database: 270 notification assertions passed, including 43 new assertions. Existing member/Atlas concurrency tests and simultaneous Auth/outbox ownership races passed.
- Health response format and Cloud Run monitor are unchanged. Unknown, undelivered, failed, bounced, complained and suppressed reports remain actionable.
