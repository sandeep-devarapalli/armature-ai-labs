import argparse
import sys
import bpy
import hashlib
import json
import struct
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

parser = argparse.ArgumentParser()
parser.add_argument('--audit-dir', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--source-original', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
stage=Path(args.audit_dir)
out=Path(args.output)
expected=json.loads((stage/'Expected GLB geometry.json').read_text())
manifest=json.loads((out/'manifest.json').read_text())
source=Path(args.source_original)
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
source_sha=sha(source)
assert source_sha==manifest['sourceNativeSha256']
assert sha(bpy.data.filepath)==source_sha
assert Path(bpy.data.filepath).resolve() != source.resolve(), 'Verify only a frozen source copy'

def geometry(obj,graph):
    ev=obj.evaluated_get(graph);mesh=ev.to_mesh();mesh.calc_loop_triangles()
    verts=[ev.matrix_world@v.co for v in mesh.vertices]
    triangles=[[verts[i] for i in tri.vertices] for tri in mesh.loop_triangles]
    ev.to_mesh_clear()
    return verts,triangles

def tree(points):
    result=KDTree(len(points))
    for i,point in enumerate(points):result.insert(point,i)
    result.balance();return result

def max_distance(points,reference):
    kd=tree(reference)
    return max(kd.find(p)[2] for p in points)

def raw_counts(path):
    data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    document=json.loads(data[20:20+length]);counts={}
    for node in document['nodes']:
        if 'mesh' not in node:continue
        name=node['extras']['sourceName']
        counts[name]=sum(document['accessors'][p['indices']]['count']//3 for p in document['meshes'][node['mesh']]['primitives'])
    return counts

def degenerates(triangles):
    return sum((t[1]-t[0]).cross(t[2]-t[0]).length/2 < 1e-15 for t in triangles)

results=[]
for floor in manifest['floors']:
    identifier=floor['id'];scene=bpy.data.scenes[floor['sourceScene']]
    bpy.context.window.scene=scene;bpy.context.view_layer.update()
    graph=bpy.context.evaluated_depsgraph_get()
    names=set(expected[identifier]['objects'])
    counts=raw_counts(out/(identifier+'.glb'))
    assert set(counts)==names
    assert all(counts[n]==expected[identifier]['objects'][n]['triangles'] for n in names), 'Raw GLB lost source triangles'
    originals={name:geometry(scene.objects[name],graph) for name in names}
    imported_scene=bpy.data.scenes.new('VERIFY '+identifier)
    bpy.context.window.scene=imported_scene
    bpy.ops.import_scene.gltf(filepath=str(out/(identifier+'.glb')))
    bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
    imported={o.get('sourceName'):o for o in imported_scene.objects if o.type=='MESH'}
    assert set(imported)==names, (identifier,len(imported),len(names))
    max_vertex=max_centroid=0.0;triangles=0
    failures=[];importer_degenerate_changes=[]
    for name,obj in imported.items():
        iv,it=geometry(obj,graph);sv,st=originals[name]
        if len(it)!=len(st):
            source_zero=degenerates(st);import_zero=degenerates(it)
            change={'name':name,'source_triangles':len(st),'raw_glb_triangles':counts[name],
                    'import_triangles':len(it),'source_zero_area_triangles':source_zero,'import_zero_area_triangles':import_zero}
            if len(st)-source_zero==len(it)-import_zero:
                importer_degenerate_changes.append(change)
            else:failures.append(change)
        vertex_error=max(max_distance(iv,sv),max_distance(sv,iv))
        ic=[sum(t,Vector())/3 for t in it];sc=[sum(t,Vector())/3 for t in st]
        centroid_error=max(max_distance(ic,sc),max_distance(sc,ic))
        max_vertex=max(max_vertex,vertex_error);max_centroid=max(max_centroid,centroid_error)
        if vertex_error>2e-6 or centroid_error>2e-6:
            failures.append({'name':name,'vertex_error_m':vertex_error,'triangle_centroid_error_m':centroid_error})
        triangles+=len(it)
    results.append({'floor':identifier,'imported_physical_objects':len(imported),'triangles':triangles,
                    'max_symmetric_vertex_error_m':max_vertex,'max_symmetric_triangle_centroid_error_m':max_centroid,
                    'source_object_names_preserved_in_extras':True,'failure_count':len(failures),'failures':failures,
                    'raw_glb_source_triangle_counts_exact':True,'importer_zero_area_changes':importer_degenerate_changes,
                    'glb_sha256':sha(out/(identifier+'.glb')),'status':'PASS' if not failures else 'FAIL'})
    print('CHECKED',identifier,len(imported),max_vertex,max_centroid,len(failures),flush=True)
assert sha(source)==source_sha
assert all(sha((out if d['url'].startswith('/') else stage/'external-downloads')/Path(d['url']).name)==d['sha256'] for d in manifest['downloads'])
assert all(sha(out/Path(f['preview']).name)==f['previewSha256'] for f in manifest['floors'])
report={'status':'PASS' if all(r['status']=='PASS' for r in results) else 'FAIL','checks':results,
        'source_sha256_before_and_after':source_sha,'native_source_saved':False,'fresh_background_reopen':True,
        'geometry_tolerance_m':2e-6,'method':'Raw GLB index counts match every source object exactly. Fresh import checks symmetric vertices/triangle centroids and nonzero-area triangle counts; any importer zero-area removal is disclosed.',
        'exact_native_download_hashes_verified':True,'preview_copy_hashes_verified':True}
(stage/'GLB fresh reimport audit.json').write_text(json.dumps(report,indent=2)+'\n')
assert report['status']=='PASS',results
manifest['status']='PASS_GEOMETRY_REIMPORT_AND_EXACT_COPY_CHECKS'
manifest['verification']={'geometryToleranceMetres':2e-6,'freshReimport':True,'physicalObjectAndRawGlbTriangleCountsMatch':True,
                          'nativeDownloadHashesMatch':True,'sourceNativePreserved':True,'browserVisualReview':'Pending website integration review'}
manifest['verification']['importerZeroAreaChanges'] = {r['floor']: r['importer_zero_area_changes'] for r in results}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('GLB_REIMPORT_PASS',flush=True)
