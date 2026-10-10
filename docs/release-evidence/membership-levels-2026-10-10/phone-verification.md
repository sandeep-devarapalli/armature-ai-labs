# Mobile verification preparation

## Bird transport preparation, 10 October 2026

The regional Bird Platform SMS API is supported behind the existing delivery gate. Private Edge configuration is `MEMBER_PHONE_PROVIDER=bird`, `BIRD_REGION=us1` and `BIRD_API_KEY`, plus the existing `MEMBER_PHONE_HOOK_SECRET`. Use an SMS-scoped key belonging to the approved US workspace. An absent provider retains MSG91; unknown providers fail closed. Only `us1`/`eu1` and matching credential prefixes are accepted.

The owner selected the Armature AI Labs US workspace, funded its wallet with $15 (verified in Bird's dashboard), and approved a restricted `sms:write` key. Storage of `BIRD_API_KEY`, `BIRD_REGION` and `MEMBER_PHONE_PROVIDER` is verified in the personal-profile Supabase UI. Hook creation and the real delivery trial await approval; the new transport is not yet deployed. Bird uses the Armature Work Chrome profile; Supabase uses the owner's personal Chrome profile. No credential values belong in these notes.

The adapter sends Supabase's code through the built-in `bird_otp_verification` template, which selects a shared sender. It does not use Bird Verify or the legacy MessageBird API. Exact account/template availability, India routing and actual handset receipt remain activation checks. Changing the native Supabase provider dropdown alone does not satisfy our protected hook/intent contract.

Acceptance requires HTTP 202, an `sms_` ID and matching outbound/authentication recipient data. No retry follows timeout or ambiguity. Acceptance is not delivery or verification; only Supabase's account-bound verification completes proof. Provider-receipt storage and a delivery-webhook monitor are not added here.

Official schema: [Sending SMS](https://bird.com/docs/guides/sms/sending-sms), [SMS templates](https://bird.com/docs/guides/sms/templates). All 40 phone Edge tests pass, including negative Bird cases and signed-hook acceptance/failure. Deno endpoint check passes. Tests use synthetic responses and send no external SMS. Do not activate tiers from those results.

Follow-up validation: Node 22 `npm test -- --run tests/edge/member-phone.test.ts tests/frontend/phone-verification.test.tsx` passed 47 tests. `npm run build` passed TypeScript, bundling, prerendering and existing release/SEO artifact checks. Existing bundle-size and mixed static/dynamic SEO import warnings remain; no release-gate configuration changed.

## Earlier provider readiness snapshot

Earlier status, before Bird selection on 10 October 2026: the compatible implementation was deployed with tier and phone gates off. Owner selected SMS first and WhatsApp later, completed MSG91 signup and confirmed DLT was not registered. Sender/template lists were empty; a Twilio trial was considered. Supabase then showed Phone disabled and no Auth Hooks. This is historical evidence, not the current setup checklist.

## API contract

Authenticated `POST /functions/v1/member-phone-verification`:
- `{action:"status"}` always reports readiness without sending.
- `{action:"start",phone:"+<country code><number>",channel:"whatsapp"|"sms"}` creates an account-bound intent before calling Supabase Auth's authenticated `PUT /user` phone change. The delivery hook determines the channel from this protected intent, not Auth user metadata.
- `{action:"verify",code:"<six digits>"}` consumes the pending phone-change OTP through Supabase Auth. No session tokens from this response are forwarded or logged. The resulting user must equal the original signed-in user. The protected completion checks the authoritative Auth phone and confirmation timestamp, then records the proof and canonicalizes the application phone while preserving its revision/approval.
- Responses: `enabled`, `available_channels`, `verified`, `masked_phone`, `channel`, `expires_at`, `resend_available_at`. Errors have sanitized `error` and `code`. Pending replacement numbers never display as verified from the previous phone's proof.

One verified phone per personal account; active pending targets are also exclusive. Private intent expiry is five minutes, resend cooldown sixty seconds, five code attempts per intent, five starts per account/destination per hour. Supabase Auth's own rate limits remain necessary because its verification endpoint is publicly reachable. Retain the existing confirmed phone's proof until replacement succeeds; application/auth/proof matching prevents a new number inheriting that proof. No OTPs are persisted in application tables.

Hook signatures cover the exact raw request with Standard Webhooks HMAC-SHA256 and five-minute timestamp tolerance. The hook requires `user.new_phone`, a confirmed-email user and a matching protected pending intent; unrelated sign-in/signup/MFA sends fail closed. Persistent webhook receipts prevent callback reuse even after a resend replaces the intent. Receipt IDs have no OTP or phone data and expire after 24 hours, pruned on subsequent hook claims. Destination rate keys contain a hash, not plaintext phone numbers. Provider requests are never blindly retried or automatically switched to SMS.

## Bird SMS activation checklist (pending verification)

1. Confirm India destination eligibility and the built-in `bird_otp_verification` template in the approved US Bird workspace. Wallet funding is complete; successful delivery remains unproven. WhatsApp is deferred and is not required to activate SMS or membership tiers.
2. Securely set private Edge configuration `MEMBER_PHONE_PROVIDER=bird`, `BIRD_REGION=us1`, `BIRD_API_KEY` and `MEMBER_PHONE_HOOK_SECRET`. Use the approved restricted `sms:write` key. Leave `MEMBER_PHONE_WHATSAPP_ENABLED` absent or false. Bird SMS requires no MSG91/WhatsApp secrets. Do not place secrets in browser `VITE_` variables or Git.
3. Configure the Supabase Send SMS HTTP Hook to the deployed `member-phone-delivery` URL and its signing secret. Enable phone provider for phone changes, disable phone signups and automatic phone confirmation, require six-digit OTPs with 300-second expiry and at least sixty-second send frequency. Do not enable phone sign-in UI or native provider fallback. This hook rejects sends without a protected membership intent. Hook/provider failure must fail closed.
4. Set `MEMBER_PHONE_VERIFICATION_ENABLED=true` only for the controlled delivery trial after the hook and SMS channel are configured. The membership-level gate remains off during this trial.
5. With an owner-designated synthetic/test identity, verify SMS provider acceptance and actual handset receipt, replacement, expired code, simultaneous attempts, same-phone account conflicts and ordinary Google/email sign-in. Verify no private details reach analytics or logs. Confirm deployed Auth serializes `new_phone` as documented by the source below.
6. WhatsApp remains deferred. The Bird adapter intentionally supports SMS only; merely enabling the WhatsApp flag cannot make Bird send it. A later channel integration needs separately verified sender/template, credentials and a real verification test before its explicit enablement.
7. Only after the SMS checks, coordinate the separate database/UI membership-level gates. Payment gates remain off. On delivery faults, disable the phone Edge gate and leave current email accounts usable; do not erase ID approvals.

Bird acceptance is not proof of handset delivery. Its strict acceptance checks are described above; malformed/ambiguous responses produce a sanitized failure without retry. Real India delivery has not been verified. Supabase remains the only OTP authority. The retained MSG91 adapter expects WhatsApp `request_id` or SMS `{type:"success",message:<request ID>}` and is not selected for the Bird rollout.

## Primary references checked 10 October 2026

- https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
- https://supabase.com/docs/reference/javascript/auth-updateuser
- https://supabase.com/docs/guides/auth/phone-login
- https://raw.githubusercontent.com/supabase/auth/master/internal/api/phone.go (`sms.phone`, phone-change hook lifecycle)
- https://raw.githubusercontent.com/supabase/auth/master/internal/models/user.go (`new_phone` serialization)
- https://raw.githubusercontent.com/supabase/auth/master/internal/api/verify.go (phone-change verification and new session response)
- https://msg91.com/help/whatsapp/whatsapp-otp (exact authentication-template components and API)
- https://docs.msg91.com/sms/send-sms (Flow API for an externally generated OTP)

## Tests

`npm test -- --run tests/edge/member-phone.test.ts`: mock-only helper/Edge integration tests, no outbound provider traffic.

`supabase/tests/database/037_member_phone.sql`: private operations, expiry, rates, replay, matching Auth state and existing-proof replacement.

`supabase/tests/concurrent_member_phone.sh`: local database only, concurrent destination reservation and hook claims.

## Executed local lifecycle evidence

10 October 2026: Deno 2.9.6 `check --no-config --no-lock` passed both Edge entrypoints. The real GoTrue **2.195.0** in the newly isolated `armature-membership-levels-check` project (API 59421) issued and verified its own phone-change OTPs through the actual signed hook and actual SQL operations. Only MSG91 transport was mocked. An independently confirmed synthetic email account retained its ID across initial WhatsApp verification and SMS number replacement. Pending replacement was unverified; duplicate OTP use and replaying the signed first hook were rejected. Two mock provider calls, zero external messages. Synthetic user was deleted and the original local Auth container restored afterward.

Reproduce after the isolated database migrations are applied (do not run concurrently with other tests using this Auth service):

```sh
DENO_BIN=/path/to/deno python3 scripts/run-member-phone-local.py
```

The wrapper is restricted to the named local stack; it temporarily enables SMS phone changes with confirmations and the HTTP hook, runs `scripts/test-member-phone-local.ts`, and restores the original Auth container in `finally`. It reads only local CLI credentials without printing them. OTPs remain only in harness memory. The harness permits network traffic only to the fixed local API; exact MSG91 calls are intercepted before networking. This verifies actual Auth payload compatibility, not a real WhatsApp/SMS delivery claim.

SMS-first follow-up: the real local GoTrue harness also passed initial SMS and SMS number replacement with WhatsApp disabled and its secrets absent. Same account, replay rejection and restored original local Auth configuration were verified; two mocked provider calls and zero external messages.
