# R03 room-reference exporter

R03 combines two newly verified P03 room extracts (FF04 and FF06) with thirteen unchanged extracts from the unpublished R02 checkpoint. R01 remains published history. Native P03 and exact room-allowlist hashes must be independently accepted before filling the blocked pins in `room-export.py`; neither filenames nor a recent modification time establish authority.

Requirements: macOS FreeCAD and Python with Pillow. No native source is opened for editing: task-owned input copies are frozen and rehashed. This tool does not deploy or upload anything.

```sh
python3 scripts/building-vision/room-export.py \
  --first-cad '/path/to/verified/current-design-first-floor.FCStd' \
  --geometry '/path/to/PB09/geometry.json' \
  --selection '/path/to/verified/P03-room-selection.json' \
  --preserved-room-root '/private/tmp/preserved-r02-checkpoint' \
  --no-publish
```

The selection JSON is private evidence, SHA-pinned independently of the CAD. Its contract is:

```json
{
  "revision": "R03",
  "sourceSha256": "<exact curated current-design CAD SHA-256>",
  "rooms": [
    { "id": "FF-04", "fitoutObjectIds": ["<verified exact IDs>"], "contextObjectIds": ["<verified exact IDs>"] },
    { "id": "FF-06", "fitoutObjectIds": ["<verified exact IDs>"], "contextObjectIds": ["<verified exact IDs>"] }
  ]
}
```

Every selected leaf must exist, have the matching RoomID and retain its exact source world-space shape. Group guesses, count-only selection and broad name prefixes are not substitutes for the pinned allowlist. Public curation removes stale historical instructions, failed-trial geometry and private metadata before this source is used.

The fresh work package contains copied helpers, frozen inputs, two FCStd/STEP files, independent native/STEP readback, path sanitization and SVG/PNG previews. `--work-directory` must be new or empty. The original PB09 map is reference data, not a new survey of enlarged cabins or their door openings.

## Retained rooms

The preserved R02 root contains its original `release.json`, `rooms/manifest.json` and room files. Both manifests are hash-pinned. Only the thirteen unchanged room IDs are carried forward; old FF04/FF06 extracts are never included.

Their FCStd, STEP, SVG, PNG and README bytes remain unchanged. Per-room provenance keeps revision R02 and adds inclusion in R03 plus original asset evidence; only public URLs and inclusion attribution change. The release checker independently pins the retained evidence digest. The catalogue exposes actual geometry kind, solid count and native download URLs for all fifteen rooms.

Keep the checkpoint outside `public/` before the website build so unlinked historical drafts are not deployed. `--preserved-room-root` supports that location. Do not delete or overwrite it.

## Public preparation and large files

After preview review, remove `--no-publish` only to prepare a new destination. Existing destinations are never overwritten. The default is `public/building-models/r03/rooms`; a different destination needs a matching `--public-url`.

Native files at or above 25 MiB must remain outside the Pages directory. Upload unchanged verified public copies to the user-approved GitHub release, download them and compare actual bytes/SHA-256, then supply `--external-room-downloads` pointing to:

```json
{
  "files": [
    {
      "file": "rooms/FF-04.step",
      "url": "<verified approved GitHub release asset URL>",
      "bytes": 1,
      "sha256": "<actual downloaded SHA-256>",
      "status": "PASS",
      "method": "download-sha256",
      "checkedAt": "<actual ISO timestamp>"
    }
  ]
}
```

The example values are schema placeholders, not acceptance evidence. Only changed room FCStd/STEP files may use this map. The publisher checks local source bytes against the verified remote record and leaves externally hosted files out of `public/`. Final release preparation also requires the same actual records in `external-download-verification.json`; source/public/provenance hashes must be independently pinned in the checker.

To prepare from an already verified work package, invoke its copied `publish.py` with `ARMATURE_ROOM_DEST`, `ARMATURE_ROOM_PUBLIC_URL` and optional `ARMATURE_ROOM_EXTERNAL_DOWNLOADS` pointing to the reviewed inputs. This does not rerun or alter native geometry.

For rechecking a completed work package:

```sh
python3 scripts/building-vision/room-export.py --verify-only '/path/to/completed/work-package'
```

This writes refreshed audit results in that work package, not the native sources.

## Evidence boundaries

- Exact source B-reps become named editable Part features, not a complete parametric dependency history.
- Open/cropped context stays open; volume sums only actual closed solids. Source world heights are retained.
- Native save/reopen checks every shape signature and exact allowlist membership. STEP checks validity, solid count, bounds, volume, area and summed edge length.
- The 2 mm preview-curve deflection changes only SVG/PNG projection, never native or STEP shapes. Unsectioned projections can show mesh triangulation; those lines are not additional walls.
- Public metadata has source basenames/hashes and current object IDs, never private paths or full failed-trial history.
- Selected tables, chair proxies and modeled motion do not certify occupied capacity, construction, hardware, fire safety, accessibility or electrical design. Historical S01 service numbers are not recalculated provision.
