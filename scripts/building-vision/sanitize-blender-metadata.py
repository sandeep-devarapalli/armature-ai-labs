"""Create privacy-sanitized public R01 derivatives; never save authoritative inputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile

PRIVATE = re.compile(rb"/Users/|/private/|/var/folders/|file://")
DATA_KINDS = ("objects", "meshes", "curves", "materials", "collections", "scenes",
              "worlds", "cameras", "lights", "screens", "workspaces")


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(value).hexdigest()


def file_sha(path):
    return digest(Path(path).read_bytes())


def values(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if hasattr(value, "to_dict"):
        return values(value.to_dict())
    if isinstance(value, dict):
        return {k: values(v) for k, v in value.items()}
    if hasattr(value, "name"):
        return value.name
    return [values(v) for v in value]


def scalar_fields(data, exclude=()):
    result = {}
    for prop in data.bl_rna.properties:
        if prop.identifier in {"rna_type", *exclude} or prop.is_readonly:
            continue
        if prop.type in {"STRING", "BOOLEAN", "INT", "FLOAT", "ENUM"}:
            result[prop.identifier] = values(getattr(data, prop.identifier))
    return result


def node_tree(tree):
    if tree is None:
        return None
    return {
        "nodes": {n.name: {"type": n.bl_idname, "fields": scalar_fields(n),
                           "inputs": [(s.identifier, values(s.default_value))
                                      for s in n.inputs if hasattr(s, "default_value")],
                           "outputs": [(s.identifier, values(s.default_value))
                                       for s in n.outputs if hasattr(s, "default_value")]}
                  for n in tree.nodes},
        "links": sorted((l.from_node.name, l.from_socket.identifier,
                         l.to_node.name, l.to_socket.identifier) for l in tree.links),
    }


def snapshot():
    import bpy
    bpy.context.view_layer.update()
    result = {"counts": {k: len(getattr(bpy.data, k)) for k in DATA_KINDS}}
    result["objects"] = {o.name: {"type": o.type, "parent": values(o.parent),
        "data": values(o.data), "world": values(o.matrix_world),
        "basis": values(o.matrix_basis), "parent_inverse": values(o.matrix_parent_inverse),
        "fields": scalar_fields(o), "properties": values(dict(o.items())),
        "collections": sorted(c.name for c in o.users_collection),
        "materials": [(s.link, values(s.material)) for s in o.material_slots],
        "modifiers": [(m.name, m.type, scalar_fields(m)) for m in o.modifiers]}
        for o in bpy.data.objects}
    result["meshes"] = {m.name: digest({
        "vertices": [values(v.co) for v in m.vertices],
        "edges": [values(e.vertices) for e in m.edges],
        "polygons": [(values(p.vertices), p.material_index, p.use_smooth) for p in m.polygons],
        "materials": [values(x) for x in m.materials],
        "uv": {layer.name: [values(v.uv) for v in layer.data] for layer in m.uv_layers}})
        for m in bpy.data.meshes}
    result["curves"] = {c.name: {"fields": scalar_fields(c),
        "materials": [values(x) for x in c.materials],
        "splines": [{"fields": scalar_fields(s), "points": [values(p.co) for p in s.points],
                     "bezier": [(values(p.co), values(p.handle_left), values(p.handle_right),
                                 p.handle_left_type, p.handle_right_type) for p in s.bezier_points]}
                    for s in c.splines]} for c in bpy.data.curves}
    result["materials"] = {m.name: {"fields": scalar_fields(m), "nodes": node_tree(m.node_tree),
                                   "properties": values(dict(m.items()))} for m in bpy.data.materials}
    result["worlds"] = {w.name: {"fields": scalar_fields(w), "nodes": node_tree(w.node_tree)}
                         for w in bpy.data.worlds}
    result["collections"] = {c.name: {"fields": scalar_fields(c),
        "objects": sorted(o.name for o in c.objects), "children": sorted(x.name for x in c.children)}
        for c in bpy.data.collections}
    result["scenes"] = {s.name: {"objects": sorted(o.name for o in s.objects),
        "camera": values(s.camera), "world": values(s.world), "frame": s.frame_current,
        "units": scalar_fields(s.unit_settings), "render": scalar_fields(s.render, {"filepath"}),
        "view_layers": {v.name: {"objects": sorted(o.name for o in v.objects),
                                 "active": values(v.objects.active)} for v in s.view_layers},
        "properties": values(dict(s.items()))} for s in bpy.data.scenes}
    for kind in ("cameras", "lights"):
        result[kind] = {d.name: scalar_fields(d) for d in getattr(bpy.data, kind)}
    result["review_views"] = {s.name: [{"type": a.type, "ui_type": a.ui_type,
        "views": [{"camera": values(sp.camera), "fields": scalar_fields(sp),
                   "region": scalar_fields(sp.region_3d), "shading": scalar_fields(sp.shading),
                   "overlay": scalar_fields(sp.overlay)} for sp in a.spaces if sp.type == "VIEW_3D"]}
        for a in s.areas] for s in bpy.data.screens}
    result["workspaces"] = {w.name: {"fields": scalar_fields(w),
                                      "screens": sorted(s.name for s in w.screens)} for w in bpy.data.workspaces}
    result["active_window"] = {"scene": bpy.context.window.scene.name,
                               "workspace": bpy.context.window.workspace.name,
                               "screen": bpy.context.window.screen.name}
    return result


def worker(args):
    import bpy
    if args.worker == "scrub":
        before = snapshot()
        Path(args.audit, "before.json").write_text(json.dumps(before))
        changes = {"sceneRenderPathsCleared": 0, "consoleLinesCleared": 0,
                   "weakSourceReferencesBasenameOnly": 0, "fileBrowserPathsCleared": 0}
        for scene in bpy.data.scenes:
            if scene.render.filepath != "//":
                changes["sceneRenderPathsCleared"] += 1
            scene.render.filepath = "//"
        for kind in DATA_KINDS:
            for item in getattr(bpy.data, kind):
                ref = item.library_weak_reference
                if ref and PRIVATE.search(ref.filepath.encode()):
                    ref.filepath = Path(ref.filepath).name
                    changes["weakSourceReferencesBasenameOnly"] += 1
        for screen in bpy.data.screens:
            for area in screen.areas:
                for space in area.spaces:
                    if space.type == "CONSOLE":
                        for line in (*space.history, *space.scrollback):
                            line.body = ""
                            changes["consoleLinesCleared"] += 1
                    if space.type == "FILE_BROWSER" and space.params:
                        space.params.directory = b""
                        space.params.filename = ""
                        changes["fileBrowserPathsCleared"] += 1
        after = snapshot()
        assert before == after, [k for k in before if before[k] != after[k]]
        Path(args.audit, "changes.json").write_text(json.dumps(changes))
        bpy.ops.wm.save_as_mainfile(filepath=args.output, check_existing=False, compress=True,
                                   copy=True, relative_remap=False)
        print("SANITIZED_CANDIDATE_SAVED", flush=True)
    else:
        before = json.loads(Path(args.audit, "before.json").read_text())
        current = json.loads(json.dumps(snapshot()))
        differences = [k for k in before if before[k] != current[k]]
        assert not differences, differences
        assert all(s.render.filepath == "//" for s in bpy.data.scenes)
        assert all(not line.body for screen in bpy.data.screens for area in screen.areas
                   for space in area.spaces if space.type == "CONSOLE"
                   for line in (*space.history, *space.scrollback))
        assert not any(PRIVATE.search(p.encode()) for p in bpy.utils.blend_paths())
        assert not bpy.data.images and not bpy.data.texts and not bpy.data.libraries
        result = {"status": "PASS", "counts": current["counts"],
                  "fingerprints": {k: digest(v) for k, v in current.items()},
                  "nativeSaveReopen": True, "geometryMaterialsMembershipsAndReviewViewsEqual": True,
                  "embeddedImages": 0, "embeddedTexts": 0, "linkedLibraries": 0}
        Path(args.audit, "verified.json").write_text(json.dumps(result, indent=2))
        print("FRESH_REOPEN_EQUALITY_PASS", flush=True)


def sanitize_png(source, destination):
    original = source.read_bytes()
    assert original[:8] == b"\x89PNG\r\n\x1a\n"
    retained, removed = [], []
    offset = 8
    while offset < len(original):
        length = struct.unpack_from(">I", original, offset)[0]
        end = offset + length + 12
        assert end <= len(original)
        chunk = original[offset:end]
        kind = chunk[4:8]
        if kind in (b"tEXt", b"iTXt", b"zTXt"):
            removed.append(kind.decode())
        else:
            retained.append(chunk)
        offset = end
    output = original[:8] + b"".join(retained)
    assert not PRIVATE.search(output)
    destination.write_bytes(output)
    return {"file": destination.name, "sourceFilename": source.name,
            "sourceSha256": digest(original), "publicSha256": digest(output),
            "removedTextChunks": len(removed), "allNonTextChunksByteIdentical": True,
            "nonTextChunksSha256": digest(b"".join(retained)), "publicBytes": len(output)}


def main(args):
    root, source = Path(args.public_root).resolve(), Path(args.source).resolve()
    assert source != root / "selected-layout.blend"
    assert file_sha(source) == args.expected_sha
    preview_root = source.parent.parent / "Previews"
    preview_names = {"ground-floor.png": "01 - Ground floor - selected layout.png",
                     "first-floor.png": "02 - First floor - selected partition.png"}
    protected = {source: file_sha(source), **{preview_root / v: file_sha(preview_root / v)
                                             for v in preview_names.values()}}
    stage = Path(tempfile.mkdtemp(prefix="armature-public-blender-sanitize-", dir="/private/tmp"))
    (stage / "backup").mkdir()
    for name in ("selected-layout.blend", *preview_names):
        shutil.copy2(root / name, stage / "backup" / name)
    frozen = stage / "source.blend"
    shutil.copy2(source, frozen)
    candidate = stage / "selected-layout.blend"
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    for mode, native in (("scrub", frozen), ("verify", candidate)):
        subprocess.run([args.blender, "--background", "--factory-startup", "--disable-autoexec",
            str(native), "--threads", "2", "--python-exit-code", "1", "--python", str(Path(__file__).resolve()),
            "--", "--worker", mode, "--audit", str(stage), "--output", str(candidate)],
            check=True, env=environment)
    raw = subprocess.run(["zstd", "-dc", str(candidate)], check=True, capture_output=True).stdout
    assert not PRIVATE.search(raw), "Private path remains in serialized Blender metadata"
    images = [sanitize_png(preview_root / original, stage / public)
              for public, original in preview_names.items()]
    verified = json.loads((stage / "verified.json").read_text())
    provenance = {"schema": "armature.blender-public-metadata.v1", "release": "R01", "status": "PASS",
        "authoritativeSourcesUnchanged": True, "exactNativeCopy": False,
        "description": "Public metadata-sanitized derivatives; native geometry, materials, memberships and saved review views unchanged.",
        "blender": {"file": candidate.name, "sourceFilename": source.name,
                    "sourceSha256": args.expected_sha, "publicSha256": file_sha(candidate),
                    "publicBytes": candidate.stat().st_size,
                    "changes": json.loads((stage / "changes.json").read_text()),
                    "serializedPrivatePathScan": "PASS", "verification": verified}, "images": images,
        "files": [{"file": candidate.name, "sourceSha256": args.expected_sha,
                   "publicSha256": file_sha(candidate), "metadataOnly": True,
                   "nativeSaveReopen": "PASS", "geometryMaterialsMembershipsUnchanged": True,
                   "reviewViewsUnchanged": True}] + [
                       {"file": row["file"], "sourceSha256": row["sourceSha256"],
                        "publicSha256": row["publicSha256"], "metadataOnly": True,
                        "pixelChunksUnchanged": True} for row in images]}
    assert all(file_sha(p) == h for p, h in protected.items())
    report = json.dumps(provenance, indent=2) + "\n"
    assert not PRIVATE.search(report.encode())
    for name in (candidate.name, *preview_names):
        shutil.copy2(stage / name, root / name)
    (root / "blender-metadata-provenance.json").write_text(report)
    assert all(file_sha(p) == h for p, h in protected.items())
    print(json.dumps({"status": "PASS", "publicBlenderSha256": provenance["blender"]["publicSha256"],
                      "report": "blender-metadata-provenance.json", "privateAudit": str(stage)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", choices=("scrub", "verify"))
    parser.add_argument("--audit")
    parser.add_argument("--output")
    parser.add_argument("--source")
    parser.add_argument("--expected-sha")
    parser.add_argument("--public-root", default="public/building-models/r01")
    parser.add_argument("--blender", default="/Applications/Blender.app/Contents/MacOS/Blender")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parsed = parser.parse_args(argv)
    worker(parsed) if parsed.worker else main(parsed)
