import ast
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0,'/Applications/FreeCAD.app/Contents/Resources/lib')
import FreeCAD as App
import Part
S=Path(__file__).parent
tree=ast.parse((S/'build.py').read_text())
tree.body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['sha','world','signature']]
exec(compile(tree,'build-functions','exec'))
build=json.loads((S/'Audit/build.json').read_text());assert build['status']=='PASS'
frozen=json.loads((S/'Audit/frozen.json').read_text());reports=[]
selection=json.loads(Path(frozen['selection']['frozen']).read_text())
assert selection['sourceSha256']==frozen['FF']['sha256'] and selection['revision']=='R03'
assert [room['id'] for room in build['rooms']]==['FF-04','FF-06']
for room in build['rooms']:
    rid=room['id'];short=rid.replace('-','');native=room['native'];expected=json.loads((S/'Audit'/(short+' expected.json')).read_text())
    assert sha(native)==room['native_sha256']
    doc=App.openDocument(native)
    try:
        actual={o.Name:signature(world(o)) for o in doc.Objects if hasattr(o,'Shape') and not hasattr(o,'Group') and not o.Shape.isNull()}
        assert actual==expected,(rid,[k for k in expected if actual.get(k)!=expected[k]][:10])
        assert len(doc.Objects)==room['native_objects']
        assert doc.RoomReferenceInfo.RoomID==rid
        assert doc.RoomReferenceInfo.SourceSHA256==room['source_sha256']
        assert doc.RoomReferenceInfo.SelectionSHA256==frozen['selection']['sha256']==room['selection_sha256']
        allowed=next(r for r in selection['rooms'] if r['id']==rid)
        assert set(actual)==set(allowed['fitoutObjectIds'])|set(allowed['contextObjectIds']),rid
    finally:App.closeDocument(doc.Name)
    assert sha(native)==room['native_sha256']
    with zipfile.ZipFile(native) as z:
        assert z.testzip() is None
        gui=ET.fromstring(z.read('GuiDocument.xml'))
        refs=[e.get('file') for vp in gui.find('ViewProviderData') for p in vp.findall('Properties/Property') for e in p if e.get('file')]
        assert all(n in z.namelist() for n in refs)
        assert not any(s in z.read('Document.xml') for s in [b'/Users/',b'/private/tmp/',b'/var/folders/'])
    step=Part.Shape();step.read(room['step']);e=room['step_expected'];a=signature(step)
    checks={
        'valid':step.isValid(),
        'solids':a['solids']==e['solids'],
        'bounds':max(abs(x-y) for x,y in zip(a['bounds_mm'],e['bounds_mm']))<.0001,
        'volume':abs(a['volume_mm3']-e['volume_mm3'])<max(.1,abs(e['volume_mm3'])*1e-7),
        'area':abs(a['area_mm2']-e['area_mm2'])<max(.01,abs(e['area_mm2'])*1e-7),
        'summed_edge_length':abs(sum(x[1] for x in a['edge_geometry'])-sum(x[1] for x in e['edge_geometry']))<max(.01,sum(x[1] for x in e['edge_geometry'])*1e-7),
    }
    assert all(checks.values()),(rid,checks,a['solids'],e['solids'],a['bounds_mm'],e['bounds_mm'])
    report={'id':rid,'native_reopen':'PASS','exact_world_shape_signatures':len(expected),'step_readback':'PASS','step_checks':checks,
            'native_sha256':room['native_sha256'],'step_sha256':room['step_sha256'],'GUI_blob_references_complete':True}
    reports.append(report)
    (S/'Audit/verify.json').write_text(json.dumps({'status':'VERIFYING','rooms':reports},indent=2))
    print('VERIFIED',rid,len(expected),'exact shapes; STEP PASS',flush=True)
for source in frozen.values():assert sha(source['source'])==sha(source['frozen'])==source['sha256']
(S/'Audit/verify.json').write_text(json.dumps({'status':'PASS','protected_sources_unchanged':True,'rooms':reports},indent=2))
print('All native/STEP room read-back gates PASS.',flush=True)
