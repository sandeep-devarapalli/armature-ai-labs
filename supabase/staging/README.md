# Staging-only SQL

These scripts were applied directly to the staging project for the Test-mode desk checkout and were never in `supabase/migrations`. They are kept here so staging can be rebuilt. Never apply them to production.

- `202611050002_test_desk_checkout_fulfillment.sql`: Test-mode desk orders and day-pass fulfilment, behind `test_desk_fulfillment_enabled`.
- `202611050003_test_desk_pass_periods.sql`: extends that to week and month passes.
- `202611060003_connected_desk_checkout.sql`: the `connected_desk_checkout` RPC that `functions/_shared/desk-checkout.ts` calls in test mode, behind `connected_desk_checkout_enabled`.

All paths also require `mock_grants_enabled`. On 8 November 2026 these versions were marked reverted in staging's migration history so `supabase db push` matches the repo; the objects remain in the staging database.

To rebuild staging, apply all of `supabase/migrations`, then these files in order, with `psql` against the staging database only. Always name the staging project explicitly.
