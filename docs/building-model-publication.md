# Building Vision model publication

The Building Vision route preserves the 21 earlier concept PNGs and adds versioned engineering references. Ground floor and first floor are the only verified modeled levels. GF05 patio is excluded; no second-floor model may be inferred. Local preparation is not evidence of a live deployment.

## Image authority and alignment

The user confirmed on 10 September 2026: latest approved Blender design first, coordinated CAD second, concept images third. Original site photographs remain evidence of existing conditions, not editable as-built records. An unissued Blender draft does not supersede a selected release.

Six current-layout views in `public/building-vision/model-aligned-r01/` come directly from R01 whole-floor Blender geometry. They are shown before expandable older concepts on cards 02, 03, 06, 10, 11 and 13. They change the camera/viewpoint, not the model. Their source and image hashes are in `provenance.json`. All 21 earlier PNGs remain unchanged.

Before publication, run `node scripts/building-vision/strip-image-path-metadata.mjs` on reviewed native PNG copies. It removes Blender text metadata containing local file paths, preserves pixel/color-profile chunks byte-for-byte and records both source-image and sanitized hashes. The normal release check rejects text metadata and verifies pixel hashes. Never run this against source photographs or original render files.

The audit found round GF10 tables and chair layouts, straight-front stair partitions, and GF08 enclosure/door/step details conflicting with R01. GF01's eight-seat concept, FF02's glass roof and finished workshop, and the first-floor office concepts are not issued geometry. Keep those images visibly labelled as historical or pending; do not fabricate completion. The FF06 dresser shown in site evidence must not be removed merely because it is missing from the simplified model.

An AI-edited first-floor partition test was not promoted: its frame shape improved, but the circulation strip appeared narrower than the native design. Use direct native renders when photo editing cannot preserve geometry. Future photo revisions must pass checks for furniture counts, wall/curve transitions, door locations, stair voids, frame path and access before replacing a reference.

## Current release

- Geometry: Coordinated Selected Layout R01, 10 September 2026.
- Services: S01 discussion scenario, not surveyed installation or electrical design.
- Source Blender: `Armature - Selected Ground and First Floor Layouts - R01.blend`.
- Source CAD: `Ground Floor - Coordinated Planning R01.FCStd` and `First Floor - Coordinated Planning R01.FCStd`.
- Published assets: `public/building-models/r01/`; hashes in `release.json`.
- Room service data: `src/data/buildingRoomServices.json`.
- Full-floor STEP files in the source R01 pack cover stair partitions only. Do not describe them as full-floor CAD.
- Room CAD extracts retain exact selected source B-reps and world coordinates; they do not retain the full document's parametric dependency history. Shared openings are repeated as context in adjoining rooms.
- FF02 workshop/new cover, FF03 two-person office, FF06 four-person office with fixed dresser, and GF01 cabin remain proposals/holds not finished geometry in R01.

## Update procedure

1. Save and reopen the newly verified native Blender/CAD release, preserving earlier files. Hash the sources and record the approvals and remaining limitations. Never choose a file solely by modification time.
2. Export both selected floor scenes to browser GLB and generate their previews from Blender. Exclude hidden alternatives and duplicate scene objects. Do not overwrite an already-published version directory; use a new release ID and update the component's release references.
3. Regenerate affected room FCStd, STEP and SVG extracts from copied native CAD sources. Audit object membership, openings and save/reopen validity. Include all 15 retained room IDs unless scope is explicitly changed.
4. Update the room service schedule separately. Keep proposed versus installed counts, explicit arithmetic, HVAC exclusions and unresolved access/safety items visible. Review coordinated room changes even when a service count stays unchanged.
   Audit the 21 image references against Blender first and CAD second. Regenerate affected native views and their provenance; update each image's current/pending note. Preserve source photographs and old versions. Do not use generated imagery to establish dimensions or erase an unresolved constraint.
5. Copy the native full-floor sources, then sanitize only public-copy metadata with the CAD and Blender metadata scripts. Remove local path attribution, render-output paths and inactive console history; preserve all model geometry, materials and saved review views. Strip PNG text metadata without changing pixel/color chunks. Verify native reopen and record original source hashes separately from sanitized download hashes in the metadata provenance files. Keep earlier unsanitized commits local rather than publishing them in Git history.
6. Run `npm run prepare:building-models` after review, then `npm run check:building-models`, `npm test`, `npm run build`, existing browser tests, and a visual check of both GLBs, room selectors, downloads and all themes at desktop/mobile widths. Confirm no GLB request before explicit activation.
7. Publish through the repository's reviewed-main production workflow. Never bypass failing security/release gates. Check the live page and compare actual downloaded bytes against `release.json` after deployment.

This is an explicit, reproducible publication workflow, not a background watcher. Saving a local file alone does not update the public website. Keep the last public revision visible until the next coordinated release passes its checks.

## Performance and evidence boundary

The new-code contract is one active floor model at a time, no GLB transfer before opening the viewer, and readable previews/downloads without WebGL. Validate on the available macOS Chromium desktop and a 390px emulated viewport; this does not establish phone GPU performance. Load failures must leave a useful fallback. Do not claim photorealistic parity: procedural Blender materials and light rigs differ from GLB/PBR browser shading.
