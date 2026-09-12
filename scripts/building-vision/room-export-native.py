from pathlib import Path
import hashlib
import json
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0,'/Applications/FreeCAD.app/Contents/Resources/lib')
import FreeCAD as App
import Part

S=Path(__file__).parent
FROZEN=json.loads((S/'Audit/frozen.json').read_text())
G=json.loads(Path(FROZEN['geometry']['frozen']).read_text())
SELECTION=json.loads(Path(FROZEN['selection']['frozen']).read_text())
assert SELECTION['revision']=='R03' and SELECTION['sourceSha256']==FROZEN['FF']['sha256']
assert sorted(r['id'] for r in SELECTION['rooms'])==['FF-04','FF-06']
STATUS='R03 selected FF04/FF06 P03 planning proposals / exact saved source references / occupied-space and installation checks outstanding'
ROLES=['Architecture','Openings','FixedReferences','StairReferences','BlenderContext','FurnitureAndFitout','OptionalReferences']
PURPOSES={
    'GF-01':'Four-person cabin A / retained cupboard', 'GF-02':'Reception and display',
    'GF-03':'Rear small room', 'GF-04':'Kitchen', 'GF-06':'Bathroom reference',
    'GF-07':'Glass booth', 'GF-08':'Enclosed balcony seating',
    'GF-09':'Presentation lounge and stair access', 'GF-10':'Coworking commons',
    'FF-01':'Rear small room reference', 'FF-02':'Workshop and proposed weatherproof cover',
    'FF-03':'Two-person and four-person cabins', 'FF-04':'Enlarged twin cabins / selected stair slider',
    'FF-05':'Bathroom reference', 'FF-06':'Stacked twin cabins / dedicated balcony',
}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def world(o):
    sh=o.Shape.copy()
    sh.Placement=o.getGlobalPlacement()
    return sh
def signature(sh):
    b=sh.BoundBox
    def vec(p):return [round(float(v),6) for v in p]
    edges=[]
    for e in sh.Edges:
        try:k=type(e.Curve).__name__
        except TypeError:k='Degenerate'
        edges.append([k,round(e.Length,6),sorted([vec(v.Point) for v in e.Vertexes])])
    return {'bounds_mm':vec([b.XMin,b.YMin,b.ZMin,b.XMax,b.YMax,b.ZMax]),
            'solids':len(sh.Solids),'faces':len(sh.Faces),'edges':len(sh.Edges),
            'volume_mm3':round(sum(s.Volume for s in sh.Solids),4),
            'area_mm2':round(sh.Area,5),'edge_geometry':sorted(edges)}
def string(o,k):return str(getattr(o,k,''))
def prop(o,name,value):
    o.addProperty('App::PropertyString',name,'Room reference')
    setattr(o,name,value if isinstance(value,str) else json.dumps(value,sort_keys=True))
def shape_ok(o):
    return hasattr(o,'Shape') and not hasattr(o,'Group') and not o.TypeId.startswith('App::') and not o.Shape.isNull()
def packed(c):return sum(round(v*255)<<s for v,s in zip(c,[24,16,8]))+255
def xmlprop(vp,name,typ,tag,attrs):
    p=vp.find('Properties');old=p.find(f'Property[@name="{name}"]')
    if old is not None:p.remove(old)
    n=ET.SubElement(p,'Property',name=name,type=typ,status='1');ET.SubElement(n,tag,**{k:str(v) for k,v in attrs.items()})
    p.set('Count',str(len(p)))
def gui_pack(path,objects,bounds,source_xml,source_blobs):
    colors={'Architecture':(.12,.18,.22),'Openings':(.13,.39,.58),'FixedReferences':(.37,.46,.31),
            'StairReferences':(.48,.53,.58),'BlenderContext':(.10,.32,.34),'FurnitureAndFitout':(.60,.42,.22),'OptionalReferences':(.60,.64,.68)}
    tree=ET.Element('Document',SchemaVersion='1',HasExpansion='1');ET.SubElement(tree,'Expand')
    vps=ET.SubElement(tree,'ViewProviderData',Count='0');newblobs={}
    old={n.get('name'):n for n in source_xml.find('ViewProviderData')}
    for rec in objects:
        name,role=rec['name'],rec['role']
        vp=ET.SubElement(vps,'ViewProvider',name=name,expanded='0',treeRank='-1')
        ET.SubElement(vp,'Properties',Count='0',TransientCount='0')
        xmlprop(vp,'Visibility','App::PropertyBool','Bool',{'value':'false' if role=='OptionalReferences' else 'true'})
        xmlprop(vp,'ShowInTree','App::PropertyBool','Bool',{'value':'true'})
        xmlprop(vp,'DisplayMode','App::PropertyEnumeration','Integer',{'value':0})
        if not rec.get('shape'):continue
        col=colors[role];original=old.get(name)
        if original is not None:
            c=original.find('Properties/Property[@name="ShapeColor"]/PropertyColor')
            if c is not None:
                raw=int(c.get('value'));col=tuple(((raw>>s)&255)/255 for s in [24,16,8])
        xmlprop(vp,'LineColor','App::PropertyColor','PropertyColor',{'value':packed(colors[role])})
        xmlprop(vp,'LineWidth','App::PropertyFloatConstraint','Float',{'value':1.5})
        xmlprop(vp,'ShapeColor','App::PropertyColor','PropertyColor',{'value':packed(col)})
        if rec.get('solids',0):
            blobname=name+'_RoomMaterials.bin'
            source_mat=original.find('Properties/Property[@name="ShapeAppearance"]/MaterialList') if original is not None else None
            if source_mat is not None and source_mat.get('file') in source_blobs:
                newblobs[blobname]=source_blobs[source_mat.get('file')]
                count=source_mat.get('count','1')
            else:
                tr=75.0 if 'glass' in name.lower() or 'glaz' in name.lower() else 0.0
                newblobs[blobname]=struct.pack('<IIIIIffIII',1,0x555555ff,packed(col),0x888888ff,255,.9,tr,0,0,0)
                count='1'
            xmlprop(vp,'ShapeAppearance','App::PropertyMaterialList','MaterialList',{'file':blobname,'count':count})
    vps.set('Count',str(len(vps)))
    xmin,ymin,_,xmax,ymax,_=bounds
    ET.SubElement(tree,'Camera',settings=f'OrthographicCamera {{\n viewportMapping ADJUST_CAMERA\n position {(xmin+xmax)/2} {(ymin+ymax)/2} 50000\n orientation 0 0 1 0\n nearDistance 1\n farDistance 100000\n aspectRatio 1\n focalDistance 50000\n height {max(xmax-xmin,ymax-ymin)*1.28}\n}}\n')
    with zipfile.ZipFile(path) as z:data={n:z.read(n) for n in z.namelist() if n!='GuiDocument.xml'}
    data.update(newblobs);data['GuiDocument.xml']=ET.tostring(tree,encoding='utf-8',xml_declaration=True)
    tmp=path.with_suffix('.packed.FCStd')
    with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as z:
        for n,c in data.items():z.writestr(n,c)
    os.replace(tmp,path)

results=[]
for floor in G['floors']:
    fid=floor['id']
    if fid!='FF':continue
    source=FROZEN[fid]
    assert sha(source['frozen'])==sha(source['source'])==source['sha256']
    doc=App.openDocument(source['frozen'])
    with zipfile.ZipFile(source['frozen']) as z:
        source_xml=ET.fromstring(z.read('GuiDocument.xml'));source_blobs={n:z.read(n) for n in z.namelist() if n!='GuiDocument.xml'}
    try:
        for room in floor['rooms']:
            rid=room['id']
            if rid not in ['FF-04','FF-06']:continue
            short=rid.replace('-','');folder=S/'rooms'/short.lower();folder.mkdir(exist_ok=True)
            target=folder/(short+'-R03-room-reference.FCStd')
            assert not target.exists(),target
            allowlist=next(r for r in SELECTION['rooms'] if r['id']==rid)
            descendants=set(allowlist['fitoutObjectIds']);context_names=set(allowlist['contextObjectIds'])
            assert descendants and context_names and not descendants&context_names,rid
            assert len(descendants)==len(allowlist['fitoutObjectIds']) and len(context_names)==len(allowlist['contextObjectIds']),rid
            selected={};omitted=[]
            for name in sorted(descendants|context_names):
                o=doc.getObject(name)
                assert o and shape_ok(o) and string(o,'RoomID')==rid,(rid,name,'Pinned current source member missing or mislabeled')
                role='BlenderContext' if name in context_names else 'FurnitureAndFitout'
                reason='Independent current P03 room allowlist / exact world-space source shape'
                selected[name]=(o,role,reason)
            assert set(selected)==descendants|context_names,rid
            nd=App.newDocument(short+'_R03_Reference');nd.Label=rid+' / R03 selected cabin reference'
            groups={role:nd.addObject('App::DocumentObjectGroup',role) for role in ROLES}
            expected={};records=[];plan=[]
            try:
                info=nd.addObject('App::FeaturePython','RoomReferenceInfo')
                prop(info,'Authority',STATUS);prop(info,'RoomID',rid);prop(info,'RoomPurpose',PURPOSES[rid]);prop(info,'SourceSHA256',source['sha256'])
                prop(info,'GeometrySHA256',FROZEN['geometry']['sha256']);prop(info,'RoomDefinitionJSON',room)
                prop(info,'SelectionSHA256',FROZEN['selection']['sha256'])
                prop(info,'SourceFileName',Path(source['source']).name)
                prop(info,'Scope','Exact new selected cabin B-reps and room-qualified cropped Blender context at source world height. Editable Part features, not complete parametric history. Archived old fit-out, old Z0 drafting duplicates and the separate full-floor render-context duplicates are excluded. Open/cropped reference faces are not capped or counted as solid volume. R03 full-floor CAD remains authoritative.')
                prop(info,'Limits','Planning reference only. Eight modeled desks in each room do not establish simultaneous usable capacity. Modeled door checks are not product, installation, egress or accessibility certification. Occupied/pull-out routes remain constrained. RoomDefinitionJSON retains the PB09 baseline only; it is not a new survey of the enlarged cabin layout.')
                for name,(old,role,reason) in selected.items():
                    sh=world(old);assert sh.isValid(),(rid,name)
                    new=nd.addObject('Part::Feature',name);assert new.Name==name
                    new.Shape=sh;new.Label=old.Label
                    groups[role].addObject(new)
                    prop(new,'SourceObjectID',name);prop(new,'SourceObjectType',old.TypeId);prop(new,'SourceSelectionReason',reason)
                    prop(new,'SourceGlobalPlacement',[*old.getGlobalPlacement().Base,*old.getGlobalPlacement().Rotation.Q])
                    prop(new,'SourceMetadataJSON',{p:str(getattr(old,p)) for p in old.PropertiesList if old.getTypeIdOfProperty(p)=='App::PropertyString' and p not in ['Label','Label2','_ElementMapVersion']})
                    sig=signature(sh);assert signature(world(new))==sig,(rid,name,'world-copy mismatch')
                    expected[name]=sig
                    rec={'name':name,'label':old.Label,'role':role,'shape':True,'solids':len(sh.Solids),'source_type':old.TypeId,'reason':reason}
                    records.append(rec)
                    if role!='OptionalReferences':
                        lines=[]
                        for e in sh.Edges:
                            if e.Length<1e-7:continue
                            p=e.discretize(Deflection=2.0) if not isinstance(e.Curve,Part.Line) else [v.Point for v in e.Vertexes]
                            xy=[[float(v.x),float(v.y)] for v in p]
                            if len(xy)>1 and any(abs(v[0]-xy[0][0])+abs(v[1]-xy[0][1])>1e-4 for v in xy[1:]):lines.append(xy)
                        plan.append({'name':name,'role':role,'solids':len(sh.Solids),'lines_mm':lines})
                nd.recompute()
                for name,sig in expected.items():assert signature(world(nd.getObject(name)))==sig,(rid,name,'recompute mismatch')
                nd.saveAs(str(target))
                step=target.with_suffix('.step');exported=[nd.getObject(n) for n,(_,role,_) in selected.items() if role!='OptionalReferences']
                Part.export(exported,str(step))
                (S/'Audit'/(short+' expected.json')).write_text(json.dumps(expected,separators=(',',':')))
                (S/'Audit'/(short+' plan.json')).write_text(json.dumps(plan,separators=(',',':')))
                record={'id':rid,'slug':short.lower(),'purpose':PURPOSES[rid],'source_floor':fid,
                        'source_filename':Path(source['source']).name,'source_sha256':source['sha256'],
                        'selection_sha256':FROZEN['selection']['sha256'],
                        'room_definition':room,'selection':records,'omitted_construction':omitted,
                        'native':str(target),'step':str(step),'native_objects':len(nd.Objects),
                        'leaf_shapes':len(records),'solid_components':sum(r['solids']>0 for r in records),
                        'native_solid_count':sum(r['solids'] for r in records),
                        'step_leaf_shapes':len(exported),
                        'step_expected':signature(Part.makeCompound([world(o) for o in exported]))}
                gui_records=[{'name':o.Name,'role':o.Name if o.Name in ROLES else 'Architecture','shape':False} for o in [*groups.values(),info]]+records
            finally:App.closeDocument(nd.Name)
            bounds=[min(sig['bounds_mm'][i] for sig in expected.values()) for i in range(3)]+[max(sig['bounds_mm'][i] for sig in expected.values()) for i in range(3,6)]
            gui_pack(target,gui_records,bounds,source_xml,source_blobs)
            record.update(native_sha256=sha(target),step_sha256=sha(step))
            results.append(record)
            (S/'Audit/build.json').write_text(json.dumps({'status':'BUILDING','rooms':results},indent=2))
            print('BUILT',rid,len(records),'shapes',record['native_solid_count'],'solids',flush=True)
    finally:App.closeDocument(doc.Name)
    assert sha(source['source'])==sha(source['frozen'])==source['sha256']
for source in FROZEN.values():assert sha(source['source'])==sha(source['frozen'])==source['sha256']
(S/'Audit/build.json').write_text(json.dumps({'status':'PASS','rooms':results},indent=2))
assert [r['id'] for r in results]==['FF-04','FF-06']
print('Two changed R03 room extracts built; original sources unchanged. Thirteen unchanged R02 extracts remain separate.',flush=True)
