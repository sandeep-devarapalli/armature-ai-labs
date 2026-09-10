"""Export verified R01 floor geometry from a frozen Blender input; never save it."""
import argparse
import hashlib
import json
import math
import re
import shutil
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

parser = argparse.ArgumentParser()
parser.add_argument('--source-original', required=True)
parser.add_argument('--expected-sha', required=True)
parser.add_argument('--release-root', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--audit-dir', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(args.source_original)
release = Path(args.release_root)
output = Path(args.output)
audit_dir = Path(args.audit_dir)
output.mkdir(parents=True, exist_ok=True)
audit_dir.mkdir(parents=True, exist_ok=True)
LIMIT = 25 * 1024 * 1024

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

assert sha(source) == args.expected_sha
assert sha(bpy.data.filepath) == args.expected_sha, 'Open only the frozen input copy'
assert Path(bpy.data.filepath).resolve() != source.resolve()
release_gate=json.loads((release/'Records/Final release gate.json').read_text())
render_manifest=json.loads((release/'Records/Final render manifest.json').read_text())
assert release_gate['status']=='PASS' and release_gate['native_sha256']==args.expected_sha
material_cache = {}
material_notes = []

def portable_material(material):
    if material is None:
        return None
    if material.name in material_cache:
        return material_cache[material.name]
    clone = material.copy()
    clone.name = material.name + ' | browser'
    clone['sourceMaterial'] = material.name
    nodes = material.node_tree.nodes if material.use_nodes else []
    principled = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    terminal = out.inputs['Surface'].links[0].from_node if out and out.inputs['Surface'].links else None
    procedural = [n.type for n in nodes if n.type.startswith('TEX_') and n.type != 'TEX_IMAGE']
    unsupported = terminal and terminal.type not in {'BSDF_PRINCIPLED', 'EMISSION'}
    if procedural or unsupported:
        clone.use_nodes = True
        clone.node_tree.nodes.clear()
        p = clone.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        o = clone.node_tree.nodes.new('ShaderNodeOutputMaterial')
        clone.node_tree.links.new(p.outputs['BSDF'], o.inputs['Surface'])
        if principled:
            for key in ['Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha', 'Emission Color', 'Emission Strength', 'Transmission Weight']:
                p.inputs[key].default_value = principled.inputs[key].default_value
        else:
            p.inputs['Base Color'].default_value = material.diffuse_color
        if terminal and terminal.type == 'BSDF_TRANSPARENT':
            p.inputs['Alpha'].default_value = 0
            p.inputs['Transmission Weight'].default_value = 0
        elif terminal and terminal.type == 'MIX_SHADER':
            shader_types = {link.from_node.type for socket in terminal.inputs[1:] for link in socket.links}
            if 'BSDF_TRANSPARENT' in shader_types:
                factor = terminal.inputs[0].default_value
                first = terminal.inputs[1].links[0].from_node.type if terminal.inputs[1].links else None
                p.inputs['Alpha'].default_value = factor if first == 'BSDF_TRANSPARENT' else 1-factor
                p.inputs['Transmission Weight'].default_value = 0
        elif terminal and terminal.type == 'BSDF_GLASS':
            p.inputs['Base Color'].default_value = terminal.inputs['Color'].default_value
            p.inputs['Roughness'].default_value = terminal.inputs['Roughness'].default_value
            p.inputs['Transmission Weight'].default_value = 1
        clone.surface_render_method = 'DITHERED'
        note = 'Procedural patterns replaced by stored source PBR scalar/base-color values; glass/transparent shader represented by source-weight alpha/transmission where needed.'
        material_notes.append({'source': material.name, 'browser': clone.name,
                               'procedural_nodes': procedural, 'source_surface': terminal.type if terminal else None,
                               'representation': note})
        clone['representationNote'] = note
    material_cache[material.name] = clone
    return clone

def triangle_hash(mesh):
    mesh.calc_loop_triangles()
    triangles = []
    for tri in mesh.loop_triangles:
        points = sorted(tuple(round(float(v), 5) for v in mesh.vertices[index].co) for index in tri.vertices)
        triangles.append(points)
    return hashlib.sha256(json.dumps(sorted(triangles), separators=(',', ':')).encode()).hexdigest()

def glb_json(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and length == len(data)
    chunk_length, chunk_type = struct.unpack_from('<I4s', data, 12)
    assert chunk_type == b'JSON'
    return json.loads(data[20:20+chunk_length])

floors = []
expected = {}
for floor_id, scene_name, preview_name in [
    ('ground-floor', 'R01 | 01 Ground floor selected layout', '01 - Ground floor - selected layout.png'),
    ('first-floor', 'R01 | 02 First floor selected layout', '02 - First floor - selected partition.png'),
]:
    original = bpy.data.scenes[scene_name]
    bpy.context.window.scene = original
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    physical = [o for o in original.objects if o.type in {'MESH', 'CURVE', 'SURFACE', 'META'} and o.visible_get() and not o.hide_render]
    excluded = [{'name':o.name, 'type':o.type} for o in original.objects if o not in physical]
    scene = bpy.data.scenes.new('Browser export | ' + floor_id)
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene['release'] = 'Coordinated Selected Layout R01'
    scene['sourceSha256'] = args.expected_sha
    per_object = {}
    points = []
    semantic_roots = set()
    for obj in physical:
        evaluated = obj.evaluated_get(graph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=graph)
        mesh.transform(evaluated.matrix_world)
        mesh.update()
        clone = bpy.data.objects.new(obj.name + ' | web', mesh)
        clone.matrix_world = Matrix.Identity(4)
        scene.collection.objects.link(clone)
        for index, material in enumerate(list(mesh.materials)):
            if material:
                mesh.materials[index] = portable_material(material)
        chain = [obj]
        ancestor = obj.parent
        while ancestor:
            chain.append(ancestor)
            ancestor = ancestor.parent
        collections = [c.name for c in obj.users_collection]
        room_ids = sorted(set(prefix+'-'+number for prefix,number in re.findall(r'\b(GF|FF)-?(\d{2})\b', ' '.join([o.name for o in chain]+collections))))
        clone['sourceName'] = obj.name
        clone['sourceCollections'] = collections
        clone['sourceParent'] = obj.parent.name if obj.parent else ''
        clone['roomIds'] = room_ids
        clone['floorId'] = floor_id
        for ancestor in chain:
            if ancestor.get('CAD_semantic_id'):
                clone['CAD_semantic_id'] = ancestor['CAD_semantic_id']
                semantic_roots.add(ancestor['CAD_semantic_id'])
                break
        coordinates = [list(v.co) for v in mesh.vertices]
        points.extend(coordinates)
        per_object[obj.name] = {'triangle_sha256_rounded_1e5':triangle_hash(mesh),
                                'source_vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),
                                'source_collections':collections,'room_ids':room_ids,
                                'bounds_blender_z_up_m':[[min(p[i] for p in coordinates),max(p[i] for p in coordinates)] for i in range(3)]}
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    path = output/(floor_id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,
                              use_visible=True,export_apply=False,export_yup=True,
                              export_extras=True,export_materials='EXPORT',export_cameras=False,
                              export_lights=False,export_animations=False,export_draco_mesh_compression_enable=False)
    assert path.stat().st_size < LIMIT, f'{path.name} exceeds 25 MiB'
    gltf = glb_json(path)
    assert not gltf.get('cameras')
    assert 'KHR_lights_punctual' not in gltf.get('extensions',{})
    exported = {n.get('extras',{}).get('sourceName') for n in gltf['nodes'] if 'mesh' in n}
    assert exported == set(per_object), {'missing':sorted(set(per_object)-exported)}
    for node in gltf['nodes']:
        if 'mesh' in node:
            triangles=sum(gltf['accessors'][p['indices']]['count']//3 for p in gltf['meshes'][node['mesh']]['primitives'])
            assert triangles==per_object[node['extras']['sourceName']]['triangles']
    bounds = [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    gltf_bounds = [bounds[0],bounds[2],[-bounds[1][1],-bounds[1][0]]]
    camera = original.camera
    pose = {'position_blender_z_up_m':list(camera.matrix_world.translation),
            'rotation_quaternion_blender':list(camera.matrix_world.to_quaternion()),
            'ortho_scale_m':camera.data.ortho_scale,'projection':camera.data.type}
    preview = output/(floor_id+'.png')
    assert sha(release/'Previews'/preview_name)==render_manifest['renders'][preview_name]
    shutil.copy2(release/'Previews'/preview_name,preview)
    floors.append({'id':floor_id,'label':'Ground floor' if floor_id=='ground-floor' else 'First floor',
                   'model':'/building-models/r01/'+path.name,'preview':'/building-models/r01/'+preview.name,
                   'bytes':path.stat().st_size,'sha256':sha(path),'physicalObjects':len(per_object),
                   'triangles':sum(r['triangles'] for r in per_object.values()),'materials':len(gltf.get('materials',[])),
                   'boundsGltfYUpMetres':gltf_bounds,'boundsBlenderZUpMetres':bounds,
                   'sourceScene':scene_name,'sourceCamera':pose,'retainedRoomNames':True,
                   'excludedCamerasLightsLabelsAndEmptyRoots':len(excluded),'previewSha256':sha(preview)})
    expected[floor_id] = {'objects':per_object,'excluded':excluded,'semantic_roots':sorted(semantic_roots),'bounds':bounds}
    print('EXPORTED',floor_id,len(per_object),path.stat().st_size,flush=True)

copy_specs = [
    (source,'selected-layout.blend','Native Blender — both floors and all retained R01 scenes','native-blender'),
    (release/'CAD/Ground Floor - Coordinated Planning R01.FCStd','ground-floor.FCStd','Ground floor — native FreeCAD','native-cad-ground'),
    (release/'CAD/First Floor - Coordinated Planning R01.FCStd','first-floor.FCStd','First floor — native FreeCAD','native-cad-first'),
    (release/'CAD/Ground Floor - Stair Partition Geometry R01.step','ground-floor-stair-partition-r01.step','Ground-floor stair partition only — STEP','step-partition-ground'),
    (release/'CAD/First Floor - Stair Partition Geometry R01.step','first-floor-stair-partition-r01.step','First-floor stair partition only — STEP','step-partition-first'),
]
downloads=[]
for src,name,label,identifier in copy_specs:
    before=sha(src);target=output/name;shutil.copy2(src,target)
    assert sha(src)==before==sha(target)
    assert target.stat().st_size<LIMIT
    downloads.append({'id':identifier,'label':label,'url':'/building-models/r01/'+name,
                      'bytes':target.stat().st_size,'sha256':before,'exactNativeCopy':True,
                      'sourceFilename':src.name,'units':'metres' if name.endswith('.blend') else 'millimetres'})

assert sha(source)==args.expected_sha
manifest={'schema':'armature.building-web-assets.v1','release':'Coordinated Selected Layout R01','date':'2026-09-10',
          'status':'EXPORTED / AWAITING INDEPENDENT GLB REIMPORT CHECK',
          'sourceNativeSha256':args.expected_sha,'sourcePreserved':True,'developmentB01Included':False,
          'floors':floors,'downloads':downloads,'browserUnits':'metres','browserAxes':'glTF Y-up; (X,Y,Z) = Blender (X,Z,-Y)',
          'caveats':['Selected planning geometry, not measured as-built or installation/occupancy certification.',
                     'GLBs are mesh viewing derivatives; editable CAD and source Blender remain separate downloads.',
                     'Source procedural wood/marble and complex transparency are simplified to portable source-derived PBR values; native renders retain original appearance.',
                     'Lighting rigs, cameras, room-label text, empty parents and hidden planning overlays are excluded from GLBs; source names and room hints remain in node extras.',
                     'STEP downloads contain only selected stair-partition solids, not full-floor architecture.',
                     'First-floor native CAD mixes inherited Z=0 plan linework with partition solids at the world-floor datum; its units are millimetres.',
                     'R01 contains no developmental private-cabin B01 desks, new workshop roof or GF01 cabin.'],
          'materialRepresentations':material_notes}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(audit_dir/'Expected GLB geometry.json').write_text(json.dumps(expected,indent=2)+'\n')
(audit_dir/'Export source audit.json').write_text(json.dumps({'status':'PASS','source_path':str(source),
    'source_sha256_before_and_after':args.expected_sha,'frozen_input':bpy.data.filepath,
    'native_source_never_saved':True,'material_representations':material_notes,'floor_counts':floors},indent=2)+'\n')
print('WEB_EXPORT_READY',flush=True)
