from pathlib import Path
import hashlib
import json
import os
import xml.etree.ElementTree as ET
import zipfile

S=Path(__file__).parent
build=json.loads((S/'Audit/build.json').read_text());changes=[]
def clean(value):
    if isinstance(value,list):return [clean(v) for v in value]
    if isinstance(value,dict):return {k:clean(v) for k,v in value.items()}
    if not isinstance(value,str):return value
    try:
        decoded=json.loads(value)
        if isinstance(decoded,(dict,list)):return json.dumps(clean(decoded),sort_keys=True)
    except (ValueError,TypeError):pass
    if value.startswith(('/Users/','/private/tmp/','/var/folders/')):return Path(value).name
    return value
for room in build['rooms']:
    p=Path(room['native'])
    with zipfile.ZipFile(p) as z:data={n:z.read(n) for n in z.namelist()}
    original=dict(data);tree=ET.fromstring(data['Document.xml']);count=0
    for e in tree.iter('String'):
        v=e.get('value')
        if v and any(token in v for token in ['/Users/','/private/tmp/','/var/folders/']):
            result=clean(v)
            assert not any(token in result for token in ['/Users/','/private/tmp/','/var/folders/']),result
            e.set('value',result);count+=1
    if count:
        data['Document.xml']=ET.tostring(tree,encoding='utf-8',xml_declaration=True)
        temp=p.with_suffix('.public.FCStd')
        with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as z:
            for n,content in data.items():z.writestr(n,content)
        os.replace(temp,p)
    assert all(original[k]==data[k] for k in data if k!='Document.xml')
    assert not any(token.encode() in data['Document.xml'] for token in ['/Users/','/private/tmp/','/var/folders/'])
    assert not any(token in Path(room['step']).read_text() for token in ['/Users/','/private/tmp/','/var/folders/'])
    room['native_sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
    changes.append({'id':room['id'],'metadata_values_path_basename_sanitized':count,'all_shape_and_GUI_members_byte_identical':True})
(S/'Audit/build.json').write_text(json.dumps(build,indent=2))
(S/'Audit/public-path-sanitization.json').write_text(json.dumps({'status':'PASS','rooms':changes},indent=2))
print('Public path sanitization PASS; geometry members unchanged.')
