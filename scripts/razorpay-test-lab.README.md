# Local Razorpay TEST lab

This development harness uses **synthetic Admin authentication**, the actual TEST ledger RPCs in native PostgreSQL, and the actual Razorpay TEST provider client. It is not Supabase Auth, a production backend, a live-money checkout or a paid-access grant. Do not publish or deploy it.

Required local database: native PostgreSQL on `127.0.0.1:57440`, database `retention_test`, with the reviewed baseline and `202611040002_razorpay_test_mode.sql` applied. The harness accepts no database URL or production project configuration. It only seeds its synthetic Admin and enables the local TEST ledger; it preserves orders and restores the previous ledger gate on normal shutdown.

The owner supplies an owner-only private server environment file outside public assets and Git containing `RAZORPAY_TEST_ENABLED=true`, `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, and a separate `RAZORPAY_TEST_WEBHOOK_SECRET` of at least 24 characters. The key ID must start with `rzp_test_`; live keys are rejected. Never paste values into commands, logs, browser code or review artifacts.

Launch after replacing only the private file path:

```sh
deno run --no-config --no-lock --env-file=/absolute/private/server.env \
  --allow-env=RAZORPAY_TEST_ENABLED,RAZORPAY_TEST_KEY_ID,RAZORPAY_TEST_KEY_SECRET,RAZORPAY_TEST_WEBHOOK_SECRET \
  --allow-net=127.0.0.1:57441,api.razorpay.com:443 \
  --allow-run=/opt/homebrew/opt/postgresql@15/bin/psql \
  scripts/razorpay-test-lab.ts
```

For authentication-only smoke checks, omit `--env-file`; payment operations remain disabled. Execution may require the local sandbox permission for PostgreSQL and loopback networking. The harness installs nothing and never reads project credentials.

The standalone local frontend uses `VITE_SUPABASE_URL=http://127.0.0.1:57441`, public placeholder `VITE_SUPABASE_PUBLISHABLE_KEY=local-synthetic-anon-key`, and its development-only TEST flag. Login is the public synthetic fixture `razorpay-local-admin@example.test` / `Local-Test-Only-57441!`. Its one-hour HS256 session is valid only in this loopback harness. No real person, email delivery, identity document or production membership is involved.

Start the separate frontend with public local configuration only:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:57441 \
VITE_SUPABASE_PUBLISHABLE_KEY=local-synthetic-anon-key \
VITE_DEMO_MODE=false VITE_RAZORPAY_TEST_ENABLED=true \
npm run dev -- --host 127.0.0.1 --port 57442 --strictPort
```

Open `http://127.0.0.1:57442/razorpay-test-lab.html` and select **Sign in synthetic Admin**. The entry imports the real account provider and payment-test page only after checking DEV mode, loopback page/backend URLs, the public placeholder key and the TEST flag. It is not a production build input and does not change the main app entry.

Endpoints: `/health`, `/auth/v1/token?grant_type=password`, `/auth/v1/token?grant_type=refresh_token`, `/auth/v1/user`, `/auth/v1/logout`, `/rest/v1/rpc/get_basic_account_summary`, `/functions/v1/razorpay-test`, and `/functions/v1/razorpay-test-webhook`. Browser origins are restricted to localhost/127.0.0.1 HTTP origins. Actual provider webhooks still require an explicitly approved reachable test endpoint; a local synthetic webhook request does not prove provider delivery.

Stop with Ctrl-C. If forcibly terminated, restore the local gate with:

```sh
psql -X -h 127.0.0.1 -p 57440 -U postgres -d retention_test \
  -c 'update private.razorpay_test_settings set enabled=false where singleton;'
```

Keep private provider references and test evidence local. A successful test capture is not production activation or evidence of a full Supabase Auth lifecycle.

Refund creation sends the persisted local refund UUID as the provider's `X-Refund-Idempotency` header, together with its stable receipt and amount. This header is restricted to the refund endpoint; callers cannot supply arbitrary outbound headers. The application still holds ambiguous operations for reconciliation and does not blindly retry them. See [idempotent refund requests](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/).

Recovery uses the provider's receipt filter, a creation-time window from five minutes before to one hour after the persisted local order, and `count`/`skip` pagination. Order recovery stops when an exact receipt match is found. Order and refund recovery each stop after five 100-item pages; an exhausted scan returns `reconciliation_scan_limit` and keeps the operation under review. An unavailable creation timestamp also requires review. Inspect the matching provider records before extending the reviewed window/scan or mapping a missing operation; do not create a replacement order or refund. These limits do not establish that an absent result never existed. This is order/refund recovery, not settlement reconciliation. Sources: [order filtering/pagination](https://razorpay.com/docs/api/orders/fetch-all/) and [refund pagination](https://razorpay.com/docs/api/refunds/fetch-multiple-refund-payment/).
