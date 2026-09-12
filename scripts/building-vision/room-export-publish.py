from pathlib import Path
import copy
import hashlib
import json
import os
import shutil
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

S=Path(__file__).parent
DEST=Path(os.environ['ARMATURE_ROOM_DEST'])
PREFIX=os.environ.get('ARMATURE_ROOM_PUBLIC_URL','/building-models/r03/rooms/').rstrip('/')+'/'
EXPECTED=['GF-01','GF-02','GF-03','GF-04','GF-06','GF-07','GF-08','GF-09','GF-10','FF-01','FF-02','FF-03','FF-04','FF-05','FF-06']
CHANGED=['FF-04','FF-06']
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
build=json.loads((S/'Audit/build.json').read_text())
verify=json.loads((S/'Audit/verify.json').read_text())
retained=json.loads((S/'Audit/retained.json').read_text())
oldroot=Path(retained['root'])
assert sha(oldroot/'release.json')==retained['releaseSha256']
assert sha(oldroot/'rooms/manifest.json')==retained['roomManifestSha256']
oldrelease=json.loads((oldroot/'release.json').read_text())
oldrooms=json.loads((oldroot/'rooms/manifest.json').read_text())
assert oldrelease['release']==oldrooms['revision']=='R02'
assert sorted(r['id'] for r in oldrooms['rooms'])==sorted(EXPECTED)
assert build['status']==verify['status']=='PASS'
assert [r['id'] for r in build['rooms']]==[r['id'] for r in verify['rooms']]==CHANGED
external_path=os.environ.get('ARMATURE_ROOM_EXTERNAL_DOWNLOADS')
external=json.loads(Path(external_path).read_text())['files'] if external_path else []
assert len({r['file'] for r in external})==len(external),'Duplicate external room file'
assert all(r['file'] in ['rooms/'+rid+ext for rid in CHANGED for ext in ['.FCStd','.step']] for r in external),'Unexpected external room asset'
used_external=set()
def asset_record(source, filename):
    byte_count=source.stat().st_size;digest=sha(source)
    key='rooms/'+filename
    record=next((r for r in external if r['file']==key),None)
    if record:
        url=urlparse(record['url'])
        assert url.scheme=='https' and url.hostname=='github.com' and url.path.startswith('/sandeep-devarapalli/armature-ai-labs/releases/download/'),key
        assert record['status']=='PASS' and record['method']=='download-sha256' and record['bytes']==byte_count and record['sha256']==digest,key
        used_external.add(key)
        return {'url':record['url'],'filename':filename,'bytes':byte_count,'sha256':digest}
    assert byte_count<25*1024*1024,(filename,'Exceeds Pages limit: upload unchanged file to approved GitHub destination and supply downloaded-byte verification')
    return {'url':PREFIX+filename,'filename':filename,'bytes':byte_count,'sha256':digest}
for room in build['rooms']:
    for key,extension in [('native','.FCStd'),('step','.step')]:asset_record(Path(room[key]),room['id']+extension)
assert not DEST.exists(),DEST
DEST.mkdir(parents=True)
common=[
    'R03 planning-reference publication: two new P03 room extracts and thirteen retained R02 extracts.',
    'Native room files retain exact selected world-space B-reps as named editable Part features, not full parametric dependency history.',
    'Open or cropped context faces are not capped or counted as closed room volumes. World heights are retained.',
    'The PB09 room map remains baseline reference data, not a new survey of proposed cabins or revised door openings.',
    'Eight modeled table/chair positions do not establish occupied capacity. Door checks are not product, installation, accessibility or egress certification.',
    'S01 services are historical discussion allowances, not recalculated provision for the revised rooms.'
]
def safe_file(root, name):
    path=(root/name).resolve()
    assert path.parent==root.resolve(),name
    return path
def private_path_check(value):
    assert not any(token in value for token in ['/Users/','/private/tmp/','/var/folders/']), 'Private path in public metadata'
room_rows=[]
retained_evidence=[]
for original in oldrooms['rooms']:
    rid=original['id']
    if rid in CHANGED:continue
    row=copy.deepcopy(original)
    assert row['verification']['nativeSaveReopen']==row['verification']['stepReadback']=='PASS',rid
    filenames=[a['filename'] for a in row['files'].values()]+[rid+'-README.md',rid+'-provenance.json']
    evidence={'id':rid,'sourceSha256':row['sourceSha256'],'files':[]}
    for name in sorted(filenames):
        registered=next(f for f in oldrelease['files'] if f['path']=='rooms/'+name)
        source=safe_file(oldroot/'rooms',name)
        assert source.stat().st_size==registered['bytes'] and sha(source)==registered['sha256'],name
        evidence['files'].append({'filename':name,'bytes':registered['bytes'],'sha256':registered['sha256']})
        if name!=rid+'-provenance.json':
            shutil.copy2(source,DEST/name)
            assert sha(DEST/name)==registered['sha256'],name
    retained_evidence.append(evidence)
    for asset in row['files'].values():asset['url']=PREFIX+asset['filename']
    row['includedInRelease']='R03'
    row['retainedFrom']={'revision':'R02','releaseSha256':retained['releaseSha256'],'roomManifestSha256':retained['roomManifestSha256'],'files':evidence['files']}
    row['provenanceUrl']=PREFIX+rid+'-provenance.json'
    provenance=json.loads((oldroot/'rooms'/(rid+'-provenance.json')).read_text())
    provenance.update({k:copy.deepcopy(v) for k,v in row.items() if k!='provenanceUrl'})
    (DEST/(rid+'-provenance.json')).write_text(json.dumps(provenance,indent=2)+'\n')
    room_rows.append(row)
for room,check in zip(build['rooms'],verify['rooms']):
    rid=room['id'];assert check['id']==rid
    local=Path(room['native']).parent
    files={}
    for key,source,ext in [('freecad',Path(room['native']),'.FCStd'),('step',Path(room['step']),'.step'),('preview',local/(rid+'.svg'),'.svg'),('previewPng',local/(rid+'.png'),'.png')]:
        target=DEST/(rid+ext);files[key]=asset_record(source,target.name)
        if files[key]['url'].startswith('/'):
            shutil.copy2(source,target);assert sha(source)==sha(target)
    ET.parse(DEST/(rid+'.svg'))
    expected=json.loads((S/'Audit'/(rid.replace('-','')+' expected.json')).read_text())
    selection=[{'sourceObjectId':r['name'],'label':r['label'],'role':r['role'],'sourceType':r['source_type'],
                'solidCount':r['solids'],'selectionBasis':r['reason'],
                'worldShapeSignatureSha256':hashlib.sha256(json.dumps(expected[r['name']],sort_keys=True).encode()).hexdigest()} for r in room['selection']]
    notes=['Selected P03 twin cabins, eight full-size tables and eight chair proxies. Retained source context includes neighbouring openings without creating closure walls.']
    if rid=='FF-06':notes.append('Retained cupboard, dresser/mirror and B02 balcony; lower cabin has dedicated balcony access. Occupied-chair and storage-use limitations remain.')
    if rid=='FF-04':notes.append('Retained enlarged cabin geometry, curved stair enclosure, selected curved leaf paths and stair/gallery context. No geometry derived from older concepts.')
    public={'id':rid,'purpose':room['purpose'],'floor':room['source_floor'],'revision':'R03','includedInRelease':'R03',
            'sourceFile':room['source_filename'],'sourceSha256':room['source_sha256'],'selectionSha256':room['selection_sha256'],'files':files,
            'shapeCount':room['leaf_shapes'],'solidCount':room['native_solid_count'],'geometryKind':'mixed source context and 3D fit-out',
            'verification':{'nativeSaveReopen':'PASS','exactWorldShapes':room['leaf_shapes'],'stepReadback':'PASS','stepChecks':check['step_checks']},
            'notes':notes,'objects':selection}
    (DEST/(rid+'-provenance.json')).write_text(json.dumps(public,indent=2)+'\n')
    public.pop('objects');public['provenanceUrl']=PREFIX+rid+'-provenance.json';room_rows.append(public)
    (DEST/(rid+'-README.md')).write_text('# '+rid+' — R03 P03 room reference\n\n'+room['purpose']+'\n\n'+'\n'.join('- '+s for s in common+notes)+'\n\nSource: '+room['source_filename']+'\nSource SHA-256: '+room['source_sha256']+'\nSelection SHA-256: '+room['selection_sha256']+'\n\nNative reopen matched every world shape; STEP validity, solids, bounds, volume, area and summed edge length passed.\n')
room_rows.sort(key=lambda r:EXPECTED.index(r['id']))
assert used_external=={r['file'] for r in external},'Unexpected external room file'
retained_evidence.sort(key=lambda r:r['id'])
assert [r['id'] for r in room_rows]==EXPECTED
manifest={'revision':'R03','status':'VERIFIED_SOURCE_EXTRACTS / PLANNING_REFERENCE_ONLY','rooms':room_rows,
          'changedRoomIds':CHANGED,'retainedRoomIds':[r for r in EXPECTED if r not in CHANGED],'retainedEvidence':retained_evidence,
          'excludedRoomIds':['GF-05'],'sourceGeometrySha256':json.loads((S/'Audit/frozen.json').read_text())['geometry']['sha256'],
          'extractionMethod':'Exact independently allowlisted current P03 B-reps for FF04/FF06; thirteen checked R02 room assets retained without geometry changes.',
          'protectedSourcesUnchanged':True,'limitations':common,
          'visualReview':'Generated previews require review before publication; generation is not visual acceptance.'}
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(DEST/'README.md').write_text('# R03 room-reference downloads\n\n'+'\n'.join('- '+s for s in common)+'\n\nR02 was an unpublished checkpoint. Retained extracts preserve their original R02 labels and source hashes; inclusion in R03 is not a new room design revision.\n')
for p in DEST.iterdir():
    if p.suffix in ['.json','.md','.svg']:private_path_check(p.read_text())
for record in json.loads((S/'Audit/frozen.json').read_text()).values():assert sha(record['source'])==sha(record['frozen'])==record['sha256']
assert sha(oldroot/'release.json')==retained['releaseSha256'] and sha(oldroot/'rooms/manifest.json')==retained['roomManifestSha256']
(S/'Audit/published.json').write_text(json.dumps({'status':'PASS','destination':str(DEST),'manifest_sha256':sha(DEST/'manifest.json'),'rooms':len(room_rows),'protected_sources_unchanged':True},indent=2))
print('Prepared 15 R03 room sets: two new native extracts plus thirteen unchanged R02 geometry sets; not deployed.')
