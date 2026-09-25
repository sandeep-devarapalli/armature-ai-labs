# Team membership and booking email plan

Updated: 25 September 2026. Status: implemented in a local branch; database and live mail verification pending.

The local implementation adds team applications, staff review and activation,
named seats, invitations, booking attribution, restricted team reporting and
an optional Google Workspace reminder sender. The member-platform release gate
stays in place. The Gmail reminder provider is not selected by default.

## Booking email decision

Use `bookings@armatureailabs.com` as an alias of the existing Google Workspace
user `hello@armatureailabs.com`. The user confirmed adding alternate addresses;
the supplied Google Admin screenshot lists `sandeep`, `bookings` and `privacy`
under `armatureailabs.com`. This records the reported configuration, not a
successful delivery or sending test.

The bookings alias shares the hello inbox and has no separate password, login
or Workspace seat. It replaces the previous dedicated bookings-account plan.
No bookings subdomain is requested. Use Google Workspace initially; Amazon
SES and ECS are not part of this setup.

## Remaining email and calendar setup

1. Verify external mail to the bookings alias arrives in the hello inbox.
   Optionally organize it with a Bookings label/filter.
2. Configure and verify Gmail Send mail as for `bookings@armatureailabs.com`.
   Verify a recipient sees the intended From and replies reach the shared inbox.
3. Authenticate calendar operations as the real Workspace user:
   `GOOGLE_WORKSPACE_SUBJECT=hello@armatureailabs.com`. Configure the required
   Calendar delegation and resource-calendar permissions for this account.
   Do not impersonate the alias or assume it becomes the Calendar organizer.
4. Connect the existing reminder webhook to a Google-supported sending
   integration, using scoped OAuth/Gmail API or an approved Google SMTP setup.
   Plan `REMINDER_FROM=bookings@armatureailabs.com` and matching Reply-To.
   The From variable alone does not implement delivery. Keep credentials in
   managed secrets; no account password belongs in chat, documentation or Git.
5. Test booking creation, rescheduling, cancellation, invitations, reminders,
   replies, retries and duplicate prevention before enabling production jobs.
   Supabase remains authoritative for bookings and integration state.

An alias cannot provide separately restricted staff access to booking messages:
delegating the primary mailbox exposes that mailbox. Revisit a separate mailbox
or group only if independent staff access becomes necessary. Supabase login/OTP
email configuration is a separate integration and is not changed by this decision.

## Team membership decisions

- One team admin manages a fixed allowance of named seats, roster and usage;
  members make their own bookings. The admin consumes a seat only when using
  the lab.
- Staff activates and renews membership after offline payment. Do not introduce
  online subscriptions or invent prices.
- Provide Individual and Team application paths and a private `/workspace/team`
  area. Public `/team` remains Meet the Team.
- Start with one admin and one active organization affiliation per person.
  Personal membership can coexist with team membership.
- Admins create single-use, email-bound invitation links valid for seven days,
  copied and shared manually in the first version. Verified users accept with
  their own login and required profile details.
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
