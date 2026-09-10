from pathlib import Path
import hashlib
import json
import os
import shutil
import xml.etree.ElementTree as ET

S=Path(__file__).parent
DEST=Path(os.environ['ARMATURE_ROOM_DEST'])
PREFIX=os.environ.get('ARMATURE_ROOM_PUBLIC_URL','/building-models/r01/rooms/').rstrip('/')+'/'
build=json.loads((S/'Audit/build.json').read_text())
verify=json.loads((S/'Audit/verify.json').read_text())
assert build['status']==verify['status']=='PASS'
assert len(build['rooms'])==len(verify['rooms'])==15
assert not DEST.exists(),DEST
DEST.mkdir(parents=True)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
common=[
    'Source-derived R01 room-reference extract, not a new room design or complete parametric dependency tree.',
    'FCStd contains exact source world-space B-reps as individually named editable Part features; analytic curves and solids are retained.',
    'Architecture/openings and fixed furniture references remain 2D source linework at Z0. Proposed fit-out solids retain source world heights. These are not fabricated full-height room shells.',
    'Shared openings and relevant boundary objects can appear in both adjoining-room files. Neighbouring furniture and unrelated floor geometry are excluded.',
    'Hidden primitive construction operands and duplicate profile sketches are excluded. Native optional references are retained hidden and excluded from STEP and previews.',
    'STEP retains source shapes, not FreeCAD property/group history or approval metadata. Read this manifest with exchanged geometry.',
    'Source approximations, unmeasured heights, 60 mm wall-reference convention differences and outstanding installation/access checks remain.',
    'Visual layout selection is not fire, accessibility, structural, electrical, occupancy or simultaneous-workstation certification.',
]
room_rows=[]
for room,check in zip(build['rooms'],verify['rooms']):
    rid=room['id'];assert check['id']==rid
    local=Path(room['native']).parent
    files={}
    for key,source,ext in [('freecad',Path(room['native']),'.FCStd'),('step',Path(room['step']),'.step'),('preview',local/(rid+'.svg'),'.svg'),('previewPng',local/(rid+'.png'),'.png')]:
        target=DEST/(rid+ext);shutil.copy2(source,target);assert sha(source)==sha(target)
        files[key]={'url':PREFIX+target.name,'filename':target.name,'bytes':target.stat().st_size,'sha256':sha(target)}
    ET.parse(DEST/(rid+'.svg'))
    notes=[]
    if rid=='GF-01':notes.append('No new private-cabin furniture/enclosure is included. Retained cupboard remains unlocated in R01; absence of a footprint does not authorize removal.')
    if rid=='GF-07':notes.append('Shared GF07/GF10 wall band includes its exact 6 in source end remainder. Booth door reduces the original opening; compact internal clearances remain.')
    if rid=='GF-08':notes.append('Includes P02 existing-door and curved-step approximation, 2 cafe tables, 4 chairs, bar and 2 stools. Frame/roof heights and installation details remain provisional.')
    if rid=='GF-09':notes.append('Includes Forward Shift01 furniture/AV and selected stair partition A01. Outward-door kitchen restriction, GF06 approach and reduced step-head clearance remain.')
    if rid=='GF-10':notes.append('9 T-01 tables, 17 counter chairs and 21 table chairs are selected model positions, not a certified 38-person simultaneous usable layout. Includes only the shared GF08 doorway from that adjacent-room fit-out.')
    if rid=='FF-02':notes.append('Balcony R01 outline only; preliminary glass route is retained as hidden native paths. New workshop bench and new weatherproof cover are not implemented in this extract.')
    if rid in ['FF-03','FF-06']:notes.append('Private-office programme is a current intended use, but the later development desk draft is excluded. This R01 reference contains no new office desks. FF06 dresser location/retention remains an outstanding model issue.')
    if rid=='FF-04':notes.append('Includes selected P01 stair partition and source stair/void references. Does not fill the gallery void or add the opposite exterior wall as room furniture.')
    if room['native_solid_count']==0:notes.append('This room has source plan/reference geometry only: its STEP contains curves/wires, not a volumetric room model.')
    expected=json.loads((S/'Audit'/(rid.replace('-','')+' expected.json')).read_text())
    selection=[{'sourceObjectId':r['name'],'label':r['label'],'role':r['role'],'sourceType':r['source_type'],
                'solidCount':r['solids'],'selectionBasis':r['reason'],
                'worldShapeSignatureSha256':hashlib.sha256(json.dumps(expected[r['name']],sort_keys=True).encode()).hexdigest()} for r in room['selection']]
    public={'id':rid,'purpose':room['purpose'],'floor':room['source_floor'],'revision':'R01',
            'sourceFile':room['source_filename'],'sourceSha256':room['source_sha256'],'files':files,
            'shapeCount':room['leaf_shapes'],'solidCount':room['native_solid_count'],'geometryKind':'mixed 2D references and 3D fit-out' if room['native_solid_count'] else '2D plan/reference geometry',
            'verification':{'nativeSaveReopen':'PASS','exactWorldShapes':room['leaf_shapes'],'stepReadback':'PASS','stepChecks':check['step_checks']},
            'notes':notes,'objects':selection}
    provenance=DEST/(rid+'-provenance.json');provenance.write_text(json.dumps(public,indent=2)+'\n')
    public.pop('objects')
    public['provenanceUrl']=PREFIX+provenance.name
    room_rows.append(public)
    (DEST/(rid+'-README.md')).write_text('# '+rid+' — R01 room reference\n\n'+room['purpose']+'\n\n'+'\n'.join('- '+s for s in common+notes)+'\n\nSource: `'+room['source_filename']+'`\n\nSource SHA-256: `'+room['source_sha256']+'`\n\nSave/reopen: exact world-shape signatures matched for '+str(room['leaf_shapes'])+' extracted shapes. STEP readback passed validity, solid count, bounds, volume, area and summed-edge-length checks.\n')
manifest={'revision':'R01','status':'VERIFIED_SOURCE_EXTRACTS / PLANNING_REFERENCE_ONLY','rooms':room_rows,
          'excludedRoomIds':['GF-05'],'sourceGeometrySha256':json.loads((S/'Audit/frozen.json').read_text())['geometry']['sha256'],
          'extractionMethod':'Exact room-qualified source B-reps and room-specific fit-out leaves, transformed once by source global placement. No geometry inferred from preview images.',
          'protectedSourcesUnchanged':True,'limitations':common,
          'visualReview':'Native-derived previews generated and text bounds checked; inspect every preview before deployment. A generated manifest is not evidence of human visual approval.'}
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(DEST/'README.md').write_text('# R01 room-reference downloads\n\n15 room extracts from the latest verified coordinated R01 ground/first-floor CAD. GF05 remains excluded.\n\nEach room has a FreeCAD FCStd, STEP, SVG/PNG preview, README and object-level provenance JSON. These are source references, not newly designed or certified room layouts.\n\n'+'\n'.join('- '+s for s in common)+'\n')
assert not any(token in (DEST/'manifest.json').read_text() for token in ['/Users/','/private/tmp/','/var/folders/'])
for p in DEST.glob('*.json'):
    assert not any(token in p.read_text() for token in ['/Users/','/private/tmp/','/var/folders/']),p
for record in json.loads((S/'Audit/frozen.json').read_text()).values():assert sha(record['source'])==sha(record['frozen'])==record['sha256']
(S/'Audit/published.json').write_text(json.dumps({'status':'PASS','destination':str(DEST),'manifest_sha256':sha(DEST/'manifest.json'),'rooms':len(room_rows),'protected_sources_unchanged':True,'files':[{'file':str(p),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(DEST.iterdir())]},indent=2))
print('Published',len(room_rows),'verified room-reference file sets to',DEST)
