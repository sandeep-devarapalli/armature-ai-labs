# Talent messaging RPC contract
Authenticated Supabase RPCs; snake_case fields. Basic membership and confirmed email required for mutations. No real sends or live file service activated.

- `market_chat_request(profile_id text,intro text) -> uuid`: one pending text intro to approved claimed owner, max ten requests/day; identical active pair returns existing conversation; decline/block cannot be bypassed by repeating.
- `market_chat_respond(conversation_id uuid,action text) -> void`: recipient accepts/declines; either participant blocks.
- `market_conversations() -> array`: `{id,kind,status,initiator_id,recipient_id,project_id,proposal_id,created_at,unread_count,last_body}`.
- `market_thread(conversation_id uuid) -> {conversation,messages,attachments}`: participant-only; messages `{id,conversation_id,sender_id,body,client_id,created_at}`; attachments `{id,conversation_id,uploader_id,filename,content_type,byte_size,status,created_at}`. No account contacts injected.
- `market_send_message(conversation_id uuid,body text,client_id uuid) -> uuid`: active conversations only; client id provides retry idempotency.
- `market_mark_read(conversation_id uuid,last_message_id uuid default null) -> void`.
- `market_report(conversation_id uuid,reason text) -> uuid`.
- `market_get_message_preferences() -> {email_enabled}` reads saved preference (default true).
- `market_message_preferences(email_enabled boolean) -> void`.
- `market_prepare_attachment(conversation_id uuid,filename text,content_type text,byte_size bigint) -> {id,object_path,status}`: active only, allowlist and 50 MB (50,000,000 bytes), quarantine. Actual upload/download uses gated Edge Function; no direct bucket grants.
- `market_attachment_access(attachment_id uuid) -> {object_path,filename,content_type}`: clean files only, active authorized participant. Edge Function signs only this authorized path.

Project integration: `private.market_project_conversation(project_id uuid,proposal_id uuid,buyer_id uuid,provider_id uuid) -> uuid`, called from authorized proposal submit RPC; fixed distinct buyer/provider and one conversation per proposal. User-invokable direct project creation is prohibited.

Realtime uses participant-readable `public.market_inbox_events` (no message contents), then refetch RPC; unsubscribe on account changes. Reports are private; separate service-assigned case reviewer grants and audited RPC govern moderation access. No generic admin access. Service reminder queue groups per user, contains only a conversation URL/count, respects opt-out, does not send externally until worker release.

## File service
`market-message-files` POST uses raw bytes, Authorization bearer, `x-conversation-id`, URL-encoded `x-file-name`, Content-Type. Client progress uses XHR upload progress. Returns `{id,status}`; 202 means quarantine, never success/clean. GET `?attachment_id=…` returns authorized `{url,filename,content_type,expires_in:60}`; URL is for forced download. Display inline previews locally only for supported images/PDF; never execute uploaded HTML or archives.

Production scanner contract (release prerequisite): HTTPS `MARKET_FILE_SCANNER_URL`, secret `MARKET_FILE_SCANNER_SECRET`. Server POSTs original bytes, declared content type/name and SHA-256 header. Response must be `{sha256,status:"clean"|"rejected"}` for the exact bytes. Scanner must inspect actual type, malware and ZIP/OOXML contents (including archive-bomb limits and nested active content), not trust MIME/extension. Missing credentials, timeout, failed request, changed digest, or unknown verdict keep the private object quarantined. The separate private Cloud Run scanner is deployed and passed hosted synthetic format, malware and 50 MiB transport checks on 15 October 2026. Bucket denies direct client access; service signing occurs only after participant RPC authorizes clean metadata. Signed URLs last 60 seconds, so block/removal revocation is bounded by that lifetime. Integrated file sharing remains separately gated by `MARKET_FILES_ENABLED`; hosted backend fixture evidence is recorded with the release.

Realtime payload rows contain only participant ID/conversation/timestamp. RLS restricts own rows; clients refetch authorized thread. Names use claimed profile names or “Member”, never derive public names from private contact information.

Authorized GET `?attachment_id=…&preview=true` returns inline bytes only for clean PNG/JPEG/WebP/PDF, with no-store/nosniff/sandbox headers. Fetch with bearer token then render blob URL (revoke when closed); never persist or email that URL. Other types return 415 and must use download.

Read positions must pass the last displayed message ID. Null is a no-op; messages from other conversations are rejected; stale read updates never regress. Concurrent unseen arrivals remain unread. Project conversations reuse the project/buyer/provider identity across proposal revisions and never reactivate a blocked thread.


## Readiness hardening — 15 October 2026

`MARKET_FILES_ENABLED=true` is an explicit release gate. The file endpoint checks active participant access before buffering, limits upload reads to 105 seconds, and bounds scanner JSON to 2 KB. Failed storage uploads become rejected records. `market-message-maintenance` uses its own job secret and opt-in `MARKET_FILE_CLEANUP_ENABLED`; it claims rejected/older-than-one-day quarantine objects, prevents concurrent clean promotion, removes private Storage bytes, then records `purged_at`. Retained clean attachments are unaffected.

The message reminder worker also runs `market_process_reminders()` after job authentication, even when external message email delivery is disabled. This produces the explicit day-3/day-7 project reminders and mediation cases; those milestone notices are in-app, not emails. Chat reminder email remains separately gated. Transport uncertainty and expired sending leases become `unknown`, not automatic resend; reserved test recipient domains never reach the provider. Accepted provider IDs survive daily queue reuse and correlate shared webhook receipts, with delivery failures and missing receipts remaining actionable through the existing exact-shape monitor.

A separate engineering-file scanner is deployed under `tools/market-file-scanner/`. It never handles government IDs. It has separate ClamAV limits/signatures, per-file SHA-256 matching, strict format checks, PDF active-content checks, OOXML external relationship/macro rejection, nested ZIP/path/size/ratio limits, and a resource-bounded parser subprocess. It uses conservative acceptance: image normalization checks retain the existing 5 MB image ceiling, archives may contain only supported data formats, and unsupported document features are rejected. Server and scanning failures remain quarantined. It uses its independent secret, private Cloud Run IAM, refreshed signatures and an end-to-end HTTP/2 gateway; direct hosted checks are recorded in `docs/release-evidence/talent-marketplace-2026-10-15/scanner-hosted.json`.

## File-size boundary

The application, attachment RPC and marketplace bucket use decimal 50 MB (50,000,000 bytes). Hosted Storage initially rejected large files with `EntityTooLarge` because its global ceiling was 25 MiB. The global ceiling is now verified at 50,000,000 bytes; all other buckets retain their explicit 5/20/25 MiB limits. The marketplace uses the same decimal 50 MB ceiling throughout. The older private table CHECK remains a broader structural ceiling to preserve historical rejected records; all new client writes use the tighter RPC. The scanner can inspect 50 MiB, which does not increase the application upload allowance. Scanner calls have a 120-second deadline and the browser allows 240 seconds for the complete operation.

## Hosted verification — 15 October 2026

The approved synthetic live journey passed: clean text, EICAR rejection, anonymous and outsider denial, quarantine download denial, exact 50,000,000-byte Edge → private Storage → authenticated scanner → clean result (41.276 seconds), signed range-download integrity, blocking, and actual 60-second URL expiry. The raw one-byte-oversize request returned a Cloudflare 502 rather than the intended structured 413 and created no attachment; UI validation and SQL/handler tests independently enforce the exact limit. This transport error remains a documented limitation. Peak Edge memory was not measured. All test Storage objects were deleted and the private prefix read back empty before account cleanup. Evidence: `docs/release-evidence/talent-marketplace-2026-10-15/files-hosted.json`. File sharing was left enabled for the approved release; email readiness is verified separately.
