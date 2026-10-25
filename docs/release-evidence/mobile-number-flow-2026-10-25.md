# Mobile-number flow — 25 October 2026

Chrome review confirmed a single freeform international-number field in mobile verification. Source review confirmed that the saved registration phone was not passed into that component, causing duplicate entry.

The details and verification editors now share a country selector and national-number field. Verification displays the saved number first, with explicit Edit number and Send SMS code actions. Saving initial details carries the canonical international number into verification. Successful server verification refreshes the saved details. The guided step has one visible heading.

Parsing uses pinned `libphonenumber-js/min` metadata. Possibility checks do not claim a number is allocated or SMS capable. Only the existing server verification establishes ownership. International paste, national trunk prefixes, shared calling codes and Italy's significant leading zero are covered; malformed or ambiguous entries remain visible for correction.

Requests capture the current member's bearer token and reject account changes. Restored or refreshed pending challenges require target confirmation before resend; refreshed challenges also clear the previous code. Existing server delivery channels, rate limits, expiry, identity approval and payment gates remain authoritative. No server migration or provider configuration is changed.

Validation:

- 930 unit tests passed; the final verification/input follow-up passed 20 targeted tests.
- All 52 gated registration browser tests passed across desktop and mobile, including initial save-to-verification handoff and existing photo, gallery and membership flows.
- Final screenshots inspected in light and dark themes, including native country selection, saved-number summary and viewport overflow assertions.
- TypeScript and `npm run build` passed, including release artifact checks.
- Synthetic local fixtures only: no real SMS sent and no real member number changed.

Local visual review: `/Users/dev/Downloads/Armature Lab/output/mobile-number-flow-2026-10-25/index.html`.

Library reference: [official libphonenumber-js documentation](https://github.com/catamphetamine/libphonenumber-js).

This initial evidence record was prepared for review. The later combined release authorization and procedure are recorded in [membership-updates-2026-10-25.md](membership-updates-2026-10-25.md).
