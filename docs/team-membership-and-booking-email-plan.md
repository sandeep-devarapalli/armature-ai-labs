# Team membership and booking email plan

Updated: 26 September 2026. The owner decisions below supersede conflicting earlier planning assumptions. They are requirements, not claims of implemented or live functionality. Google setup and test evidence is tracked in website-work-progress-2026-09-26.md.

Preview testing is on hold at the user's request. The live website's public
bundle points to the existing `armature-lab` Supabase project
(`uxfhdfagrmaeyuaipaar`); no separate Armature preview project was found among
the accessible projects. Do not create one or apply this migration to the live
project until the user resumes that work.

The local implementation adds team applications, staff review and activation,
named seats, invitations, booking attribution, restricted team reporting and
an optional Google Workspace reminder sender. The member-platform release gate
stays in place. The Gmail reminder provider is not selected by default.


## Owner clarification — 26 September 2026

- Basic registration and online identity verification are free. LinkedIn remains required. Minimum member age is 16. Ages 16–17 require guardian consent and a guardian email; recording an email alone is not proof of consent. Guardian LinkedIn is not a substitute. The guardian must email the lab with the minor’s details and explicit permission; staff must review and record this consent. The exact receiving mailbox and minimum details remain to be specified.
- Online ID upload/review and approval-status notifications are confirmed. Delete uploaded copies 30 days after upload, retaining only the verification record. Do not reset this clock after review. Government IDs must never use the public avatar bucket. Specify derivative/backup deletion and the minimum verification metadata before implementation; do not indefinitely retain copies for pending applications.
- All pass dates and closures must be clearly visible before purchase. A day-pass purchase can select multiple individual dates within one calendar month. A week pass covers seven consecutive calendar days. A month pass covers the first through last day of the selected calendar month. A mid-month joiner can purchase day passes through month end, then a monthly pass beginning next month; no prorated monthly product has been approved.
- General lab operating hours are 08:00–23:00 Asia/Kolkata on open days, including weekends. Standard day/week/month access is only 09:00–17:00. Government and mandatory state holidays are closed and must be shown on the booking calendar. Confirm any holiday credit/extension policy; do not silently extend consecutive/calendar passes. An administrator-maintained closure calendar is needed.
- Optional automatic renewal is explicitly requested, superseding the earlier manual-renewal recommendation. Keep renewal opt-in and distinguish provider payment authorization from a UI toggle. Day passes do not renew. Weekly/monthly passes may offer optional renewal; monthly renewal is to the next calendar month. Define holiday/unavailable-date, price-change and failed-payment behavior before activation. No arbitrary repeat dates may be charged.
- Overnight access is separately paid and adults-only (18+). The approved overnight window is 23:00–08:00 the following day. This is an explicit exception to general lab closing hours, requiring its own paid entitlement. It does not automatically include the 17:00–23:00 evening period.
- Every paid coworking/cabin pass, including day passes, includes unlimited pantry access during its valid workspace access: milk, juices, atta, Maggi, eggs and similar essentials. Outside food orders are allowed; users must clean up and keep shared eating/pantry areas tidy. Free basic registration and event guest attendance alone do not grant these workspace perks.
- Equipment is a separately purchased add-on to paid coworking/cabin access covering the actual equipment-use period; equipment purchase alone does not provide entry. Examples: hourly 3D-printer access and daily Jetson Orin Nano allocations. Allocated multi-day kits remain exclusive with assigned overnight storage; this does not imply a shared hourly machine is allocated overnight. No off-site equipment use.
- Cabins are sold for their full default seat count. Cabin visitors may stay at most three hours. The simultaneous visitor cap is floor(cabin seats / 2), e.g. five seats permits two visitors. Day-pass guests still respect physical occupancy limits. Additional visitors may register and buy day passes, including passes paid for by the host. Ordinary team-member cabin spending authority and any approval requirement remain to define.
- Team admins may book shared resources for named members and transfer administration to another team member. Individual eligibility and certifications apply to the actual user. Receiving-admin acceptance and transfer audit are implementation proposals.
- Event rate discussed is INR 2,500/hour plus applicable tax; the latest answer confirmed buffer timing but did not separately restate price approval, so obtain final publication confirmation. Discounts must be supported across paid offerings; authority, caps and stacking rules remain to define. Minimum event duration is one hour. Includes four microphones, speakers and a presentation screen. Promise 35 seated attendees only; do not advertise unverified overflow.
- Reserve 20 minutes before and after each event. These buffers may extend outside the 17:00–21:00 standard event window: a 17:00 start can reserve from 16:40 and a 21:00 finish through 21:20. Block the entire buffered interval against conflicting use, including daytime coworking if it shares that space. Weekend day-long events are permitted; weekday day-long events require special admin approval and payment before use. Define day-long billable hours and holiday exceptions rather than assuming the full operating window is the package.
- Event attendees use lightweight guest registration, not full membership. Underage event attendance/supervision still needs a policy separate from the membership age floor.
- Pay before use, with Razorpay test mode as the proposed first integration. Existing implementation remains offline activation until changed and tested. Live processing requires merchant approval and separate release authorization. Dodo eligibility limitation is recorded below.
- Refund-window clock starts at 09:00 on the pass start date, not purchase or check-in. Proposed windows remain one hour for day access, one day for weekly access and two days for monthly access. The owner confirmed full refunds within the applicable windows, not deductions for used access. Confirm elapsed 24/48-hour interpretation for day-based windows, multi-date orders, and separate policies for events, cabins, equipment and discounts. Do not publish a final refund promise until these amounts and conditions are settled.

### Provider feasibility and next work

Dodo's current merchant acceptance policy excludes in-person services even when booked/paid online. Do not implement Dodo for lab access, rentals or physical events without a verified change in eligibility. Source: https://docs.dodopayments.com/miscellaneous/merchant-acceptance (checked 26 September 2026). Razorpay provides separate test/live modes: https://razorpay.com/docs/payments/dashboard/test-live-modes/ . Recommend Razorpay test mode for this launch, subject to owner merchant onboarding.

Razorpay hold, 26 September: the owner is changing the LLP name and explicitly deferred even Razorpay test-mode setup. Do not create/configure a merchant account or connect test payments until the owner resumes. Follow up later about readiness; do not infer completion of the name change from elapsed time.

Next: resolve the bounded questions above, write the entitlement/order/booking and refund specification, then, once the owner lifts the LLP-name-change hold, build an isolated synthetic-data test checkout with server-calculated prices, reservation holds, verified capture, idempotent webhooks, failed/late payments and refund tests. Approval-required events should be approved before payment collection. No real IDs or charges in testing; no paid preview infrastructure, production membership activation or worker enablement is authorized by this clarification.

## Booking email decision

Use `bookings@armatureailabs.com` as an alias of the existing Google Workspace
user `hello@armatureailabs.com`. The user confirmed adding alternate addresses;
the supplied Google Admin screenshot lists `sandeep`, `bookings` and `privacy`
under `armatureailabs.com`. This records the reported configuration, not a
successful delivery or sending test.

The user confirmed on 25 September 2026 that mail sent to the bookings alias
arrives in the hello inbox. Outbound Send mail as and reply delivery remain to
be verified. The alias shares the hello inbox and has no separate password,
login or Workspace seat. It replaces the previous dedicated bookings-account plan.
No bookings subdomain is requested. Use Google Workspace initially; Amazon
SES and ECS are not part of this setup.

## Remaining email and calendar setup

1. Inbound delivery is user-confirmed. Optionally organize bookings mail with
   a Bookings label/filter.
2. Configure and verify Gmail Send mail as for `bookings@armatureailabs.com`.
   Verify a recipient sees the intended From and replies reach the shared inbox.
3. Authenticate calendar operations as the real Workspace user:
   `GOOGLE_WORKSPACE_SUBJECT=hello@armatureailabs.com`. Configure the required
   Calendar delegation and resource-calendar permissions for this account.
   Do not impersonate the alias or assume it becomes the Calendar organizer.
4. Keep the existing reminder webhook as the default. The implemented direct
   Gmail option requires `REMINDER_PROVIDER=gmail`, delegated `gmail.send` and
   `gmail.settings.basic` scopes, and an accepted Gmail Send mail as alias.
   It sends From and Reply-To as `bookings@armatureailabs.com`; the worker checks
   the primary Workspace identity and alias status before sending. Keep service
   credentials in managed secrets; no account password belongs in chat,
   documentation or Git.
5. Test booking creation, rescheduling, cancellation, invitations, reminders,
   replies and retries before enabling production jobs. Gmail has no send
   idempotency key. The local delivery guard records `review_required` before
   the Gmail POST and excludes that reminder from automatic retries, including
   lease recovery. Ambiguous outcomes require operator reconciliation; a
   crash before the POST may therefore leave an unsent reminder on hold.
   See the operations runbook before selecting direct Gmail delivery.
   Supabase remains authoritative for bookings and integration state.

An alias cannot provide separately restricted staff access to booking messages:
delegating the primary mailbox exposes that mailbox. Revisit a separate mailbox
or group only if independent staff access becomes necessary. Supabase login/OTP
email configuration is a separate integration and is not changed by this decision.

## Team membership decisions

- One team admin manages a fixed allowance of named seats, roster and usage;
  members make their own bookings. The admin consumes a seat only when using
  the lab.
- Historical implementation: staff activates and renews membership after offline payment. The 26 September owner decision above supersedes this as the target payment flow; do not invent prices or claim online checkout is already implemented.
- Provide Individual and Team application paths and a private `/workspace/team`
  area. Public `/team` remains Meet the Team.
- Start with one admin and one active organization affiliation per person.
  Personal membership can coexist with team membership.
- Admins create single-use, email-bound invitation links valid for seven days,
  copied and shared manually in the first version. Verified users accept with
  their own login and a completed display name in their profile.
- Active seats and unexpired invitations count against the allowance, enforced
  atomically. Individual equipment certifications remain required.
- Show admins per-person team-attributed bookings and usage, not private contact
  details, purpose notes, emergency details or personal bookings.

## Implementation sequence

1. Add organizations, organization members, invitations and memberships through
   additive Supabase migrations with row-level access controls. Company admin
   authority stays separate from lab staff roles.
2. Implement shared server-side eligibility for an active personal membership
   or an active team seat, retaining staff suspension and safety restrictions.
3. Record personal or team access on each booking; allow a choice when both
   apply. Limit team-admin reporting to team-funded activity.
4. Implement roster management and staff controls for seat allowance, dates,
   renewals, suspension and ownership transfer. Removal prevents new team use
   and cancels future team bookings, while retaining history and allowing an
   active session to check out or equipment to be returned.
5. Complete the email/calendar checks above and existing database, frontend and
   browser checks. Cover expired/revoked/duplicate invitations, concurrent last
   seat claims, organization isolation, personal/team coexistence, certification
   requirements and removal during a session. Review mobile and all site themes.

Keep the member platform behind its existing release gate until launch checks
pass and release is authorized. This note does not change live settings, send
messages, deploy code or approve launch.

## Google documentation

- [Workspace email aliases](https://support.google.com/a/answer/33327)
- [Send mail from another address](https://support.google.com/mail/answer/22370)
- [Gmail API sending aliases](https://developers.google.com/workspace/gmail/api/guides/alias_and_signature_settings)
- [Mailbox delegation](https://support.google.com/mail/answer/138350)
