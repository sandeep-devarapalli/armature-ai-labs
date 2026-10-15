# Isolated migration replay

Run from this checkout with Node 22:

```sh
node scripts/test-network-migration-replay.mjs
```

The harness uses the already installed Supabase PostgreSQL image and creates a fresh, uniquely named Docker container with `--network none` and cron execution disabled. It copies only the installed platform's auth/storage schema and constraints, not account data, application schemas, policies or records. The optional GraphQL extension is removed from the bootstrap because its schema event trigger retains a stale relation reference during platform schema replacement. All application migrations then run in filename order, including the older marketplace migrations and the new 15 October migrations. This is application migration replay against the installed platform schema, not a separate test of Supabase Auth server upgrades.

On 15 October 2026, all **65 migrations** replayed successfully, including `202610150006_market_wakeups.sql`. All **14 SQL suites** passed: talent network, photos, admin editing, claims, submissions, submission notifications, existing notifications, portfolio, projects, messages, message delivery, marketplace operations, authorization and wakeups. Wakeup checks confirm both jobs remain inactive without deployment activation. No Vault delivery secrets or real notifications were used.

Evidence: `/private/tmp/armature-network-replay-1792037599759/result.json` and `replay.log`. The matching disposable container remains available for inspection. Failed bootstrap containers created for this verification were removed; shared test databases were not reset.

Reviewer revocation is enforced at case-list, protected evidence, case-resolution and legacy case-thread entry points. Historical assignment and audit records are retained, but a revoked staff role grants no access. Regression fixtures now represent both explicit case assignment and current staff eligibility, and test denial after revocation.

Frontend regressions and browser verification are recorded separately. This check performs no production deployment.
