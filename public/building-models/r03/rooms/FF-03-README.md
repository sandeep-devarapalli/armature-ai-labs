# FF-03 — R02 room reference

Two-person and four-person cabins

- Source-derived R02 room-reference extract, not a new room design or complete parametric dependency tree.
- FCStd contains exact source world-space B-reps as individually named editable Part features; analytic curves and solids are retained.
- Inherited CAD architecture/openings and fixed references remain 2D source linework at Z0. GF01/FF03 also retain exact saved Blender architecture context in a separate group; all context and fit-out retain source world heights. Open/cropped context faces are not capped or counted as solids. No full-height room shell is invented.
- Shared openings and relevant boundary objects can appear in both adjoining-room files. Neighbouring furniture and unrelated floor geometry are excluded.
- Hidden primitive construction operands and duplicate profile sketches are excluded. Native optional references are retained hidden and excluded from STEP and previews.
- STEP retains source shapes, not FreeCAD property/group history or approval metadata. Read this manifest with exchanged geometry.
- Source approximations, unmeasured heights, 60 mm wall-reference convention differences and outstanding installation/access checks remain.
- Visual layout selection is not fire, accessibility, structural, electrical, occupancy or simultaneous-workstation certification.
- BlenderContext contains the exact latest native architecture context, including open/cropped faces; inherited Z0 CAD references are separately retained and shown grey in the preview. Model-derived context may include immediately adjoining doorway/floor pieces. No source offsets are silently reconciled.
- Includes selected two-person and four-person cabins with 2 ft shared cross-route. The left/west outward door restricts the shared route; roughly 1 ft occupied rear space does not provide chair pullback clearance. Six modeled desk positions are not verified simultaneous usable capacity.

Source: `First Floor - FF03 Cabins Approved Layout P01.FCStd`

Source SHA-256: `d379157326c11798497b9dfd7cdc27ba2d1e79400332d27427d82c8bb0d28891`

Save/reopen: exact world-shape signatures matched for 182 extracted shapes. STEP readback passed validity, solid count, bounds, volume, area and summed-edge-length checks.
