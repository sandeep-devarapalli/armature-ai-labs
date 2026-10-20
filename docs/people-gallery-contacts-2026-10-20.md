# Optional public member contact details

Approved scope: members may choose a separate public email or their confirmed sign-in email and an optional LinkedIn profile URL. Existing profiles stay private for these fields. No real member records were edited for development or evidence.

- `202610200002_people_gallery_contacts.sql` adds private contact choices and explicit consent time. Public readers expose only chosen contacts on published, eligible profiles.
- New `save_my_directory_profile_with_contacts` wraps the existing profile save in one transaction. Existing RPC clients remain compatible. Sign-in addresses come from `auth.users`, never browser authority; a changed sign-in email hides the saved email and resets the editor's consent. Stale non-null email snapshots are rejected.
- Server validation limits LinkedIn to HTTPS `linkedin.com/in/` or `www.linkedin.com/in/` URLs and rejects email header injection. Custom email ownership is not claimed or verified; the member explicitly chooses it as a public contact address.
- Members can remove either contact, hide the whole profile or revoke sharing. No phone, identity document or review data is added to public responses.
- Privacy copy and AGENTS guidance were updated. No payment or membership eligibility changes.

Validation: isolated Docker database `armature-gallery-replay-1792480768135`, using `supabase_admin` owner role: contacts SQL 21 checks pass; existing gallery SQL 28 checks pass. An initial apply using the non-owner postgres role was refused; no partial migration applied. Frontend gallery tests: 9 pass. Browser six theme/device journeys passed and exercise synthetic contact fields and links; screenshots are under Playwright test-results. The first browser run had an ambiguous LinkedIn locator matching the site footer; scoped to the exact profile-link name before rerun. A nested-select exact-label locator was corrected to its accessible combobox role. Desktop screenshot inspected; contact-field spacing refined to match existing settings.

Release order: apply ONLY this additive migration (do not push unrelated held migrations), verify private defaults and anonymous response, then release frontend. Do not alter a real member's public-sharing choices to demonstrate the feature.

Consent withdrawal: unchecking public contact permission saves the chosen values privately and clears the consent timestamp; both public links disappear. The success message explicitly says email and LinkedIn are private. Removing each contact remains independently available.
