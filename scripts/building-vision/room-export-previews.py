from pathlib import Path
import html
import json
import math
from PIL import Image, ImageDraw, ImageFont

S=Path(__file__).parent
build=json.loads((S/'Audit/build.json').read_text())
COLORS={'Architecture':'#1F2D38','Openings':'#216B92','FixedReferences':'#5B7046','StairReferences':'#7C8790','FurnitureAndFitout':'#956A39'}
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def feet(m):
    inches=round(m/.0254,1);f=int(inches//12)
    return f'{f} ft {inches-f*12:g} in'
for room in build['rooms']:
    rid=room['id'];short=rid.replace('-','');folder=S/'rooms'/short.lower()
    records=json.loads((S/'Audit'/(short+' plan.json')).read_text())
    allpoints=[p for r in records for line in r['lines_mm'] for p in line]
    x0=min(p[0] for p in allpoints);x1=max(p[0] for p in allpoints)
    y0=min(p[1] for p in allpoints);y1=max(p[1] for p in allpoints)
    w,h=1100,960;left,top,right,bottom=60,145,1040,770
    scale=min((right-left)/(x1-x0+500),(bottom-top)/(y1-y0+500))
    cx=(x0+x1)/2;cy=(y0+y1)/2
    def xy(p):return ((left+right)/2+(p[0]-cx)*scale,(top+bottom)/2-(p[1]-cy)*scale)
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{rid} R01 room reference plan">',
         '<rect width="100%" height="100%" fill="#FFFEFA"/>']
    im=Image.new('RGB',(w,h),'#FFFEFA');d=ImageDraw.Draw(im)
    def text(x,y,t,size=16,color='#1F2D38',bold=False):
        font=ImageFont.truetype(BOLD if bold else FONT,size)
        assert x+d.textlength(t,font=font)<w-24,(rid,t)
        svg.append(f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{size}" fill="{color}"'+(' font-weight="700"' if bold else '')+'>'+html.escape(t)+'</text>')
        d.text((x,y-size),t,font=font,fill=color)
    def line(points,color,width=1):
        if len(points)<2:return
        svg.append('<polyline points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in points)+f'" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"/>')
        d.line(points,fill=color,width=max(1,round(width)),joint='curve')
    text(48,47,rid+' / '+room['purpose'],27,bold=True)
    text(48,75,'COORDINATED R01 · source-derived room reference · no new design',15,color='#3A4655')
    text(48,101,'Ink: existing reference geometry   Blue: openings   Brown: selected fit-out   Grid: 1 ft',14,color='#6B7585')
    line([(48,120),(1052,120)],'#C5C9CB')
    ft=304.8
    for x in range(math.floor(x0/ft),math.ceil(x1/ft)+1):
        a,b=xy((x*ft,y0)),xy((x*ft,y1));line([a,b],'#E8EBE8',.7)
    for y in range(math.floor(y0/ft),math.ceil(y1/ft)+1):
        a,b=xy((x0,y*ft)),xy((x1,y*ft));line([a,b],'#E8EBE8',.7)
    seen=set()
    order={'StairReferences':0,'FixedReferences':1,'FurnitureAndFitout':2,'Architecture':3,'Openings':4}
    for rec in sorted(records,key=lambda r:order.get(r['role'],0)):
        for points in rec['lines_mm']:
            key=tuple((round(p[0],3),round(p[1],3)) for p in points)
            canonical=min(key,key[::-1])
            if canonical in seen:continue
            seen.add(canonical)
            line([xy(p) for p in points],COLORS[rec['role']],1.45 if rec['role'] in ['Architecture','Openings'] else .9)
    scale_width=3*ft*scale
    line([(65,795),(65+scale_width,795)],'#1F2D38',2)
    line([(65,790),(65,800)],'#1F2D38',1)
    line([(65+scale_width,790),(65+scale_width,800)],'#1F2D38',1)
    text(65,822,'3 ft model scale',13)
    doors=[]
    for o in room['room_definition']['openings']:
        if o['type'] in ['door','opening','window_door']:
            dest=o.get('destination') or 'destination unconfirmed'
            width=o.get('width_m')
            phrase=dest+(' '+feet(width) if width else ' width unmeasured')
            if phrase not in doors:doors.append(phrase)
    if rid=='GF-08':doors.append('GF-10 3 ft nominal / P02 approximate jamb')
    if rid=='GF-10':doors.append('GF-08 3 ft nominal / P02 approximate jamb')
    if doors:
        chunks=[];current='Model opening spans (not net clear): '
        for phrase in doors:
            if len(current)+len(phrase)>110:chunks.append(current);current=''
            current+=phrase+'; '
        if current:chunks.append(current.rstrip('; '))
        assert len(chunks)<=2,(rid,chunks)
        for i,t in enumerate(chunks):text(48,851+i*20,t,13,color='#216B92')
    note='Exact extracted shapes. Walls/openings are 2D references at Z0; proposal solids retain their original world heights.'
    text(48,905,note,13,color='#6B7585')
    if rid in ['FF-03','FF-06']:note='R01 has no new private-office desks. Later development-only furniture is deliberately excluded.'
    elif rid=='FF-02':note='R01 balcony only; preliminary glass paths hidden in native. New workshop bench and weatherproof cover are not included.'
    elif rid=='GF-10':note='Nine tables / 38 chair positions are a selected density layout, not verified simultaneous usable capacity.'
    else:note='Planning reference only. Measured, fitted and unmeasured conditions remain distinct; installation/access checks outstanding.'
    text(48,929,note,13,color='#9A5639')
    svg.append('</svg>')
    (folder/(rid+'.svg')).write_text('\n'.join(svg)+'\n')
    im.save(folder/(rid+'.png'))
print('15 exact-native top-view SVG/PNG previews written.')
