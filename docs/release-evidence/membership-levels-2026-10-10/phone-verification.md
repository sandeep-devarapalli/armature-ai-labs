# Mobile verification preparation

Status: implementation and synthetic tests only. No MSG91 credentials, accounts, messages, Supabase Auth settings or production gates changed.

## API contract

Authenticated `POST /functions/v1/member-phone-verification`:
- `{action:"status"}` always reports readiness without sending.
- `{action:"start",phone:"+<country code><number>",channel:"whatsapp"|"sms"}` creates an account-bound intent before calling Supabase Auth's authenticated `PUT /user` phone change. The delivery hook determines the channel from this protected intent, not Auth user metadata.
- `{action:"verify",code:"<six digits>"}` consumes the pending phone-change OTP through Supabase Auth. No session tokens from this response are forwarded or logged. The resulting user must equal the original signed-in user. The protected completion checks the authoritative Auth phone and confirmation timestamp, then records the proof and canonicalizes the application phone while preserving its revision/approval.
- Responses: `enabled`, `verified`, `masked_phone`, `channel`, `expires_at`, `resend_available_at`. Errors have sanitized `error` and `code`. Pending replacement numbers never display as verified from the previous phone's proof.

One verified phone per personal account; active pending targets are also exclusive. Private intent expiry is five minutes, resend cooldown sixty seconds, five code attempts per intent, five starts per account/destination per hour. Supabase Auth's own rate limits remain necessary because its verification endpoint is publicly reachable. Retain the existing confirmed phone's proof until replacement succeeds; application/auth/proof matching prevents a new number inheriting that proof. No OTPs are persisted in application tables.

Hook signatures cover the exact raw request with Standard Webhooks HMAC-SHA256 and five-minute timestamp tolerance. The hook requires `user.new_phone`, a confirmed-email user and a matching protected pending intent; unrelated sign-in/signup/MFA sends fail closed. Persistent webhook receipts prevent callback reuse even after a resend replaces the intent. Receipt IDs have no OTP or phone data and expire after 24 hours, pruned on subsequent hook claims. Destination rate keys contain a hash, not plaintext phone numbers. Provider requests are never blindly retried or automatically switched to SMS.

## Activation checklist (not executed)

1. Configure an Armature-owned WhatsApp Business sender, approved MSG91 authentication template with the documented code body and copy-code button, and an India-ready SMS sender/DLT template. Confirm account eligibility for WhatsApp authentication templates with MSG91; approval is not implied by this code.
2. Set private Edge secrets `MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER`, `MSG91_WHATSAPP_TEMPLATE`, `MSG91_WHATSAPP_NAMESPACE`, `MSG91_WHATSAPP_LANGUAGE`, `MSG91_SMS_TEMPLATE`, `MSG91_SMS_OTP_VARIABLE`, and `MEMBER_PHONE_HOOK_SECRET`. Use the exact approved template's SMS variable name. Do not place these in browser `VITE_` variables or Git.
3. Configure the Supabase Send SMS HTTP Hook to the deployed `member-phone-delivery` URL and its signing secret. Enable phone provider for phone changes, disable phone signups and automatic phone confirmation, require six-digit OTPs with 300-second expiry and at least sixty-second send frequency. Do not enable phone sign-in UI or native provider fallback. This hook rejects sends without a protected membership intent. Hook/provider failure must fail closed.
4. Set `MEMBER_PHONE_VERIFICATION_ENABLED=true` only for the controlled delivery trial after the hook and both channels are configured. The membership-level gate remains off during this trial.
5. With an owner-designated synthetic/test identity, verify WhatsApp and explicit SMS separately, provider acceptance schemas and actual receipt, replacement, expired code, simultaneous attempts, same-phone account conflicts and ordinary Google/email sign-in. Verify no private details reach analytics or logs. Confirm deployed Auth serializes `new_phone` as documented by the source below.
6. Only after these checks, coordinate the separate database/UI membership-level gates. Payment gates remain off. On delivery faults, disable the phone Edge gate and leave current email accounts usable; do not erase ID approvals.

MSG91 acceptance is not proof of handset delivery. Current parsing requires WhatsApp `request_id` or SMS `{type:"success",message:<request ID>}`; malformed/ambiguous responses produce a sanitized failure without retry. Real provider fixtures and India delivery have not been tested. No provider-side OTP verification/widget is used: Supabase remains the only OTP authority. Live delivery, templates, billing and operational monitoring need readiness evidence before opening this feature.

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
