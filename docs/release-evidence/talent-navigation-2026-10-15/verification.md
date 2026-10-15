# Talent member navigation

Local release candidate, 15 October 2026. Production unchanged.

- Anonymous section navigation: Find talent and Find work only. Direct private hashes show sign-in with a return destination.
- Signed-in members: Messages, My projects, prominent Add my profile / Continue profile setup / My profile button, Post a requirement. Review links remain admin-only.
- My requests is removed from navigation; old #requests links open My profile with private review history. Owners see their actual profile and editing controls.
- New submissions remain attached to authenticated identity, with private email and manual approval. Existing data is unchanged.
- Authenticated caller-only talent_my_profile lookup returns id/publication status, including unlisted ownership. No email matching or public ownership exposure.

Validation: 752 frontend tests passed with repository-default membership/onboarding flags; isolated build passed. Initial full-suite run used the local enabled-member preview flag and failed the unrelated homepage pre-launch-copy assertion; rerun with expected default flags passed. SQL authorization test passed in a rollback transaction on the isolated local database: anonymous denied, unrelated account sees null, owner sees its unlisted identity, banned account denied.

Rendered desktop/mobile checks used localhost:4215 and synthetic accounts: signed-in Add button and email association; sign-out immediately hides member actions and gates the form; Find work hides saved/proposal/post controls; synthetic provider My profile opens owned profile with edit/photo/removal controls and embedded history. Shared header/footer retained. Existing local maker-desk inventory permission errors were observed; no navigation rendering error.

Release requires deploying only migration 202610150009_talent_member_profile.sql, then the checked frontend; do not deploy local .env.local output. Real payments and unrelated activation gates remain unchanged.
