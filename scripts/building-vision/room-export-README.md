# R01 room-reference exporter

The exporter is intentionally pinned to the reviewed R01 ground/first-floor CAD hashes and PB09 room map. It must not silently select a later private-office development draft. Updating those pins for a new release requires a fresh source/geometry review.

Requirements: macOS FreeCAD and Python with Pillow. No FreeCAD GUI or accessibility automation is used. Native Qt startup may require an approved, scoped process execution outside a restrictive sandbox; no global setting changes are required.

```sh
python3 scripts/building-vision/room-export.py \
  --source-directory '/path/to/Coordinated Selected Layout R01/CAD' \
  --geometry '/path/to/Measured Planning 09/Source and build/geometry.json' \
  --no-publish
```

This makes a fresh temporary workspace, freezes protected source copies before opening FreeCAD, builds 15 FCStd/STEP room extracts, sanitizes private paths from public metadata, independently reopens native/STEP files and produces SVG/PNG previews. `--work-directory` may specify a new or empty workspace. The complete source/object audit remains there.

Remove `--no-publish` only to create a **new** public target. The default target is `public/building-models/r01/rooms`; an existing directory is never overwritten. A different `--destination` needs a matching `--public-url`. This script copies assets but does not deploy the website. Visually inspect all previews before deployment.

For read-only CAD/STEP rechecking of an existing work package:

```sh
python3 scripts/building-vision/room-export.py --verify-only '/path/to/completed/work-package'
```

## Geometry boundaries

- Exact source world-space B-reps become individually named editable Part features, retaining original object IDs/types and selected source metadata. Full sketch/feature dependency history is not copied.
- Room-qualified wall/fixed-reference IDs and shared opening IDs select architectural references. Room-specific fit-out groups select their finished leaves; hidden construction operands and duplicate profiles are excluded.
- GF05 is excluded. GF01/FF03/FF06 private-cabin development furniture and FF02 workshop bench/new roof are not in the frozen R01 source and are not invented here.
- Architecture is source 2D linework at Z0; existing fit-out solids retain world heights. Nine rooms therefore contain reference curves/wires only, not volumetric architectural shells.
- Shared GF07/GF10 wall and relevant GF08 doorway geometry retain exact source geometry in both adjacent references. Preliminary overlays remain hidden and are excluded from STEP/previews.
- Native save/reopen compares exact world geometry signatures for every selected shape. STEP checks validity, solid count, bounds, volume, area and summed edge length. Every source file is rehashed to confirm no writes.
- Public metadata uses source basenames, hashes and object IDs, never private home/temp paths. Public `manifest.json` exposes `geometryKind` and `solidCount` per room.
- A 2 mm curve-display deflection applies only to SVG/PNG projection. Native and STEP analytic geometry are not replaced by those preview polylines.
- These are planning references, not construction, fire, accessibility, structural, electrical, occupancy or simultaneous-working capacity certification. Existing limitations remain disclosed.

Helper files beginning `room-export-` are copied into the new workspace before use; no task-specific temporary paths are embedded in the repository tools. Historical unpublished construction-operand pilot evidence is retained in the original task audit, not in public geometry.
