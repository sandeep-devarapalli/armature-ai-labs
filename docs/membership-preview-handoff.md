# Membership review preview

This work implements a local review surface for the owner's September 26 membership decisions. It is not a production onboarding release. Existing Supabase membership, job settings and payment credentials are unchanged.

## Review scope

The preview separates free identity-reviewed membership from paid dated access. It uses synthetic applicant/document fixtures, in-memory state, simulated staff decisions and notifications, pass dates, mock payment and refund decisions. No real ID files are accepted. No external email, payment, identity-verification or storage service is connected. Refreshing resets the preview.

Use Node 22 and `VITE_DEMO_MODE=true npm run dev -- --host 127.0.0.1 --port 4340 --strictPort`, then open `http://127.0.0.1:4340/membership-preview`. The route requires both Vite development mode and demo mode. It must not appear in production builds or the public sitemap.

## Before backend implementation

- Store ID documents in a dedicated private bucket with applicant/staff access policies, short-lived view URLs and restricted audit records; never reuse the public avatar bucket. Confirm MIME/size validation and malware handling. Define deletion for originals, thumbnails and backups; schedule deletion 30 days from upload even if review is pending. A preview timer is not proof of production deletion.
- Record guardian email permission as a reviewed consent artifact with sender, subject/reference, receipt time, reviewer and decision. A user-supplied email address or checked box alone cannot establish permission. The receiving mailbox/minimum requested details still need definition.
- Separate verified basic membership from purchased access in server-side booking/check-in eligibility. Team access and equipment certification must still be checked for the actual user.
- Real prices remain pending except the discussed event hourly rate, which is not a substitute for finalized tax and discount configuration. Never trust client-calculated totals or a checkout-success redirect. Real payment activation requires verified capture, idempotent webhooks and recovery of expired reservation holds.
- Razorpay test-mode work is explicitly on hold during the LLP rename. No checkout SDK/account is configured by this preview.
- Use a maintained official holiday/closure calendar. Preview closure examples are synthetic. Decide credits/extensions for closures and how optional weekly/monthly renewals handle them. Day passes never renew.
- Full-refund windows start at 09:00 IST on pass start, with one hour for day passes and one/two days for week/month. The preview's elapsed 24/48-hour interpretation is labelled. Separate refund rules for equipment/cabins/events, multi-date orders and renewal payments still require agreement.
- Overnight access is adults-only, 23:00–08:00 next day, and does not cover the intervening 17:00–23:00 period. Event buffers reserve the space beyond attendee time; validate conflicts with any shared daytime space.

## Release boundaries

Do not merge/deploy a member platform, apply production migrations, enable booking workers, or start payment setup from preview approval alone. After owner review, implement private server-side onboarding/retention and access purchases in focused changes, then repeat permission and authenticated end-to-end tests with synthetic records. The existing draft PR #73 contains earlier team code and is not automatically approved for release by this preview.

## Verification — 26 September 2026

- Node 22.22.2: `npm test -- --run` passed 131 tests. `npm run build` passed TypeScript, production build and asset/SEO checks (153 initial-HTML public pages).
- `npx playwright test --config playwright.membership-preview.config.ts` passed 12 tests across Chromium desktop and iPhone 13-sized Chromium. Exercises adult approval versus payment, refund boundaries, ID deletion and reload reset; reviewed minor consent and overnight denial; underage/missing LinkedIn/expired ID blocks; multi-date/month/leap-year/closure/renewal selection; cabin/event limits and staff exception. Theme/no-overflow checks cover light, dark and sepia.
- `npx playwright test tests/frontend/e2e/public-release-gates.spec.ts --project=chromium --project=mobile` passed 13 with one intentional skip. Production `/membership-preview` is not found and normal operational release gates remain closed. Build emitted no MembershipPreview asset.
- Rendered screenshots inspected: `/private/tmp/armature-membership-preview-chromium.png` and `/private/tmp/armature-membership-preview-mobile.png`. Full pages have no horizontal overflow. Initial development PWA offline notice is dismissible; it is unrelated to application approval. Browser checks had no uncaught page errors or write requests during theme interaction. Existing Vite PWA dev precache glob warnings concern absent production assets in dev-dist; production artifact checks passed.
- In-app browser readback confirmed the local route, title and populated registration/review/pass/resource controls. Left a fresh synthetic session open for owner review.
- Source review separately caught and fixed pre-start refund assumptions, local-time weekday calculation, invalid dates/counts and invalid cabin sizes. The UI intentionally labels provisional event hours and unknown availability.

These tests do not verify a real private upload, identity verification, scheduled retention job, actual staff authorization, official holiday calendar, payment, renewal, refund transaction, resource inventory or email notification. Those require the separately scoped backend work and remaining policy decisions.
