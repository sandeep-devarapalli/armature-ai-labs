# Talent photos and government-ID retention release

14 October 2026. Owner authorized production publication and equipment-rental ID retention.

- Isolated release based on current main; marketplace/messaging and real payments excluded.
- Photo endpoint and private bucket tested on hosted Supabase with generated synthetic images only. No real member image or government ID was inspected.
- Consent required; real scanner/upload201; public photo200; metadata stripped; no-store; direct anonymous Storage access denied; malformed image and harmless antivirus test marker rejected422; membership preview/reuse200/201; removal200 and subsequent public404; membership original preserved200.
- Existing scheduled cleanup reduced four removed synthetic directory copies to zero. No manual deletion of real documents.
- Existing scanner implementation is ClamAV plus Pillow validation/re-encoding, not AI, LLM or OCR. Manual membership review unchanged.
- ID retention is explicit and versioned per document. New consented uploads retain without automatic30day expiry. Two current legacy IDs retain their prior deadline unless the member opts in. Verification photos still expire30days; explicit correction/deletion paths remain effective.
- Local release suite:685 tests across62 files; TypeScript/build and artifact integrity checks passed. Photo and ID SQL tests passed in isolated database.
- Google Cloud operator CLI session requires reauthentication; verification exercised actual deployed scanner via Supabase instead. No cloud IAM or scanner service changes made.
- Hosted synthetic ID flow: unconsented upload403; explicit consent204; scanner/privateStorage upload201 with infinity expiry; ownerGET200; anonymous401. Synthetic verification photo remains30days. Only generated colored-square fixtures used.
