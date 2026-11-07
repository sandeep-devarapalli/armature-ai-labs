# Isolated hosted desk rehearsal

Generate from the current checkout, never from an older copied implementation:

```sh
node scripts/build-desk-rehearsal.mjs
node --test tests/scripts/desk-rehearsal.node.mjs
```

The generator prints a new temporary bundle directory and writes a SHA-256 source/output manifest. It copies only the two Edge entrypoints and their local dependencies. It does not read credentials, deploy, migrate, or modify production sources. Source-anchor drift aborts generation. Review the generated diff and manifest before deployment.

Target is exclusively project `gwrdmpvczwuypvvzfyty`, origin `https://booking-staging.armature-lab.pages.dev`. The generated provider rejects live keys and every other backend, including production. Responses and Checkout use Test Mode, while the current `live_desk_checkout` ledger, manual review, request lists, MFA, recovery and payment verification logic remain exercised. No production fallback is included.

Private staging secrets required:

- `REHEARSAL_DESK_CHECKOUT_ENABLED=true` (different from the old adapter's `REHEARSAL_DESK_ENABLED`).
- `REHEARSAL_DESK_MANUAL_AGREEMENT_ENABLED=true`.
- `REHEARSAL_DESK_RAZORPAY_KEY_ID` beginning `rzp_test_`, corresponding `REHEARSAL_DESK_RAZORPAY_KEY_SECRET`.
- Independent `REHEARSAL_DESK_RAZORPAY_WEBHOOK_SECRET` (at least 32 characters) and `REHEARSAL_DESK_RAZORPAY_ACCOUNT_ID`.
- `REHEARSAL_DESK_POLICY_VERSION` matching the isolated ledger configuration.
- `REHEARSAL_DESK_PANDADOC_SIGNER`; optional `REHEARSAL_DESK_PANDADOC_SANDBOX_KEY` for API signing instead of manual review.

Supabase supplies its own staging URL/service-role credentials. Never copy production secrets into staging. Use only synthetic customers, isolated inventory and Test Mode events. Both function entrypoints keep their names (`desk-checkout`, `razorpay-booking-webhook`); checkout performs its own authenticated-user checks and the webhook verifies provider HMAC, so generated configuration disables the platform JWT check for these endpoints. The Edge staff paths still require Admin and AAL2.

The staging database must contain the current migrations and explicit synthetic product/inventory/checkout settings; the generator deliberately does not apply or enable these. The hosted frontend must explicitly target staging and expect test checkout responses. After separate deployment authorization, deploy only these two functions using the generated directory as `--workdir` and the exact staging `--project-ref`. Actual hosted signing/payment/webhook delivery evidence is a separate acceptance step from these safety tests.
