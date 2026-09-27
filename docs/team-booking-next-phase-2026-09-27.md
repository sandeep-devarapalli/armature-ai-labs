# Team memberships and bookings — next phase

Prepared 27 September 2026 in response to the owner's request to take up team memberships and bookings. This is the implementation plan, not paid-launch or payment-provider activation authority. Existing basic registration and member management remain live.

## Starting point

Draft PR #73 (`codex/team-membership-booking-email`) already contains named seats, email-bound invitations, roster management, team booking attribution and Google Workspace booking integrations. Its prior checks predate the current basic-membership and role releases. Preserve the original working folder and review/update it in an isolated checkout.

The planning audit identified two concrete gaps: its booking eligibility uses legacy personal membership/team seats without enforcing the new basic-registration approval/revocation state, and it supports self-booking rather than the subsequently requested team-admin booking for named members. Do not release the draft unchanged.

## Proposed sequence

1. Reconcile PR #73 with current main. Preserve current onboarding, scanned uploads, avatars, role hierarchy, notifications, public pages and deployment gates. Split further work into focused changes.
2. Integrate approved basic membership with personal/team paid eligibility on every server operation. Team seats never substitute for basic approval or equipment certification. Revocation, team removal and expired access must prevent new bookings; preserve historical records and safe checkout/return handling.
3. Complete team creation, named-seat invitations/limits, roster management, ownership transfer, bookings on behalf of named members and team-only usage reporting. Team admin is an organization role, not a website Admin. Staff remains membership-approval-only; do not silently give Staff paid-access activation, payment or team-management permissions.
4. Implement the confirmed booking rules: selected dates for day passes, seven consecutive days for week passes, calendar-month passes, visible closures, standard 09:00–17:00 access, adult-only 23:00–08:00 overnight access, cabin seat capacity and guest limits, equipment as an additional in-lab entitlement requiring workspace access, and event capacity/setup-cleanup buffers and approval rules. Do not infer access rights for unpriced hours from general building opening hours.
5. Add administration for resource availability, closures, prices/discounts and paid entitlements, keeping unconfirmed prices visibly unconfigured. Show included pantry perks without atta. Keep website staff permissions separate from organization management.
6. Test locally with synthetic accounts/data: simultaneous last-seat claims and overlapping bookings, expired/revoked invitations, organization isolation, basic revocation, personal/team coexistence, certifications, admin transfer, on-behalf booking authorization, dates/timezones, closures, capacities, buffers and mobile flows. Mock payments and booking messages.
7. Show a complete local member/team-admin/lab-admin journey. Release only after resolving launch inputs and completing the production checklist. Do not enable booking email/calendar workers merely because their credentials exist.

## Decisions required before paid launch

- Final prices, inventory/cabin capacities, holiday calendar and remaining cancellation/refund details.
- Whether the first launch waits for Razorpay or permits an explicitly confirmed manual-payment workflow. The older draft's offline-payment checkbox is not evidence of current launch approval.
- Controlled real booking-calendar/email tests and production launch approval.

The LLP-name-change/Razorpay hold, including test mode, remains. No provider setup, real payment, booking email or public paid-booking activation is part of this planning step. Notification pilot and cleanup activation remain separate work.
