# Notification correlation incident — 3 October 2026

## Scope and evidence

Owner approved fixing the 28 unmatched delivery reports for 14 Builder Atlas review emails. Resend UI in the Armature Work profile showed all 14 delivered; each original body contained an exact submission Receipt UUID. Read-only production validation matched all 14 legacy sent rows, 14 sent receipts and 14 delivered receipts. No timestamp-based inference, resend, recipient change or receipt deletion is permitted. Exact mapping remains in the local investigation evidence and is recorded by the protected reconciliation audit on release.

## Implementation

- Add provider IDs, recipient-aware suppression and lease-checked preparation/completion to the Atlas outbox.
- Serialize provider correlation across both outboxes and immutable callbacks.
- Preserve terminal delivery precedence, conflict rejection and unknown-outcome holds.
- Keep legacy health JSON stable; new protected health RPC adds six Atlas alert counts.
- Monitor accepts either complete schema during rollout, never a partial or unknown shape.
- Keep cleanup disabled and preserve membership, payment and recipient settings.

## Validation and release (in progress)

- Node 22.23.2: final `npm test -- --maxWorkers=2` — 461 tests passed across 48 files. An unconstrained run timed out in the unchanged 15-room DOM-render test (5-second limit); reducing worker contention passed without changing assertions or application code.
- `npm run build` passed, including all model, media, release and SEO artifact checks.
- Isolated local Postgres: 222 assertions across notification suites 017/018/019/026/027/034; all four notification concurrency scripts passed, plus Atlas contribution and pending-edit SQL. Local clone excludes scheduler-extension bootstrap; hosted CI validates the complete migration chain.
- Python monitor: 9 tests passed, including strict legacy/expanded schemas and every actionable count.
- Independent review identified batch suppression and terminal retention safeguards; fixed, rereviewed with no remaining release blockers.
- Cloud Build `ce2daaba-79e3-43d1-9b14-0f5e0810a38d` built monitor digest `sha256:f7520abf07116c54b1cc3cf677e029673013b7700b56f127ffad793154f0f5e5` using the existing scanner-builder identity and dedicated source bucket. Default-bucket attempts failed before build; no IAM permissions were expanded.
- Production migration, sender deployment, reconciliation and scheduled recovery are not yet verified.

## Rollout order

1. Required CI and independent review.
2. Apply only 202610030001 transactionally and preserve exact source in migration ledger.
3. Update monitor image while legacy endpoint remains compatible.
4. Deploy updated health endpoint and Atlas sender.
5. Reconcile only verified historical mappings with audit.
6. Verify the next scheduled check and alert recovery.

No real test messages or synthetic production submissions are needed. Local tests exercise callback ordering, duplicate/conflicting events, malformed responses, stale leases, retention and suppression.
