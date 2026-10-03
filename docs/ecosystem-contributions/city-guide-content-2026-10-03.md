# Bangalore guide content and review candidates

The three chapters in `src/data/ecosystemGuide.ts` are original practical guidance for the integrated map interface: work and community, prototyping and sourcing, and everyday life. Plum is a linked inspiration/further-reading source, not copied directory content. The module has no businesses, coordinates or fallback listings. Named source links are editorial references; they do not turn a pending candidate into a published map result.

## Staged contributions

The three JSON files in `city-guide-candidates/` use the existing version-1 contribution envelope and immutable IDs. They are deliberately outside `contributions/ecosystem/`, so the normal import workflow will not pick them up. No remote import, approval or publication was performed.

- Big Bean Café — HSR Layout: owner recommendation; official story page identifies HSR and work meetings. Guide category `cafes`. Street address and coordinates not verified; unpinned. No phone copied without a publication-permission decision.
- HSR Founders Club: official website plus LinkedIn source; Luma calendar retained in `tips`, the existing field supported by the schema. Guide category `communities`. It is a community, not a verified permanent walk-in venue; unpinned.
- Armature AI Labs: a revision-bound edit to the existing public listing, not another new entry. The exact category and Google Maps changes are described below; all other public fields are retained.

Before moving any file into the import directory, check approved listings and pending proposals for duplicates or an open-edit lock. For a new candidate with an approved match, prepare a complete revision-bound edit with its current `baseRevision`, preserving all unchanged public fields; do not submit a duplicate new entry. Importing an unchanged file retains its `github:<id>` idempotency key. Changing an already-imported proposal requires a new ID. Admin/Super admin approval remains mandatory.

## Armature category and map-link proposal

The immutable existing contribution `owner-20261002-armature-ai-labs` already records the owner-supplied map link, address, coordinates and permissioned lab phone. Do not rewrite that contribution under the same ID.

The public Armature listing was read back on 3 October 2026 at revision 1. The staged `owner-20261003-armature-ai-labs-guide` edit targets `armature-ai-labs` with `baseRevision: 1`. It proposes `subcategory: "Coworking · Incubation & accelerator · Makerspace"`, removes `other` from `alsoListedAs`, and sets `city: "bangalore"`, `guideCategories: ["workspaces", "build-source"]`, and `googleMapsUrl: "https://maps.app.goo.gl/XeNziZfx3V8S8jza7"`. This placement is directory navigation, not evidence of a formal incubation programme, grants, investment or commissioned equipment.

Re-read the current public record and open-edit status before import. If its revision or fields have changed, refresh the complete proposal against that data; never force a stale revision through review. The original contribution remains unchanged. The maps URL is owner-supplied and preserved from the published data; it was not re-resolved during this content pass. The staged edit does not alter the live listing.

## Source checks

Reviewed on 3 October 2026:

- [Plum’s Bangalore guide](https://www.plumhq.com/starter-guides/starter-guide-to-bangalore): broad city-guide inspiration; no statistics, venue list or prose copied.
- [HSR Founders Club](https://www.hsrfounders.club/): describes introductions and Bangalore gatherings. No membership price, acceptance claim or guaranteed introduction copied.
- [HSR Founders Club on LinkedIn](https://in.linkedin.com/company/hsrfc): identifies HSR Layout/Bangalore, community focus and the official website.
- [HSR Founders Club events](https://luma.com/hsr-founders-club-events?k=c): resolves to the named calendar, but the extracted snapshot was stale; no event date or availability claim used.
- [Big Bean Café’s story](https://www.bigbeancafe.in/our-story): identifies an HSR Layout outlet and work meetings; no outlet pin, operating hours or laptop policy inferred.
- [IKP EDEN Smart Fab](https://ikpeden.com/smart-fab/): linked as a first-party prototyping reference; no tolerance, stock, turnaround or machine-access promise copied.

Search Summary

- Commands: Webcmd version check; direct `webcmd web fetch --url` attempts for the four supplied main pages; read-only web-tool opens for those pages and the supplied LinkedIn/Luma URLs.
- Browser fallback: none.
- Gaps/failures: all Webcmd fetch attempts stopped at the local runtime error `listen EPERM: operation not permitted 127.0.0.1`; web-tool reads supplied the source evidence. Luma snapshot freshness remains unverified. A later anonymous public readback on 3 October confirmed Armature revision 1; new-candidate duplicates and all open-edit states still need checking before import.
