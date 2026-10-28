import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { validInteractive } from '../../course-app/interactive/registry.mjs';

export const originalCourses = ['pic-microcontrollers', 'manual-lathe', 'manual-milling'];
export async function prepareOriginalCourses(source, output) {
  source=path.resolve(source); output=path.resolve(output);
  assert(output !== source && !output.startsWith(source+path.sep), 'Do not overwrite source material');
  try { await access(output); throw new Error('Choose a fresh derivative output directory'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const files=new Map(), inputs=new Map(), catalog=[], inventory=[];
  for(const id of originalCourses) {
    const prefix=`courses/${id}`;
    const read=async name=>{
      const filename=`${prefix}/${name}`, bytes=await readFile(path.join(source,filename),'utf8');
      inputs.set(filename,hash(bytes));
      return JSON.parse(bytes);
    };
    const metadata=await read('course.json'), content=await read('content.json'), plan=await read('lesson-plan.json'), diagrams=await read('diagram-index.json');
    assert.equal(metadata.id,id); assert.equal(metadata.status,'draft'); assert(content.finalExam === undefined || (Array.isArray(content.finalExam) && content.finalExam.length === 0), 'Do not put final assessment in lessons'); delete content.finalExam;
    assert.equal(content.modules.length,plan.modules.length);
    const ids=new Set(); let lessonCount=0, blockCount=0, interactiveCount=0;
    const mappings=[];
    content.modules.forEach((m,mi)=>{
      assert.equal(m.title,plan.modules[mi].title);
      assert.deepEqual(Object.keys(m.lessonContent).sort(),[...m.subItems].sort());
      assert.deepEqual(m.subItems,plan.modules[mi].lessons.map(l=>l.title));
      m.subItems.forEach((title,li)=>{
        const blocks=m.lessonContent[title].blocks;
        assert(blocks.length>0 && blocks.length<=500); assert(Buffer.byteLength(JSON.stringify(blocks))<1048576);
        assert.deepEqual(blocks.map(b=>b.id),plan.modules[mi].lessons[li].blockIds);
        for(const b of blocks){
          assert(typeof b.id==='string'&&!ids.has(b.id),`Repeated block ${b.id}`); ids.add(b.id);
          if(b.type==='interactive_diagram'){assert(validInteractive(b.content),`Invalid interactive ${b.id}`);interactiveCount++;}
          if(['illustration','interactive_diagram'].includes(b.type)) assert(b.content.svgCode?.includes('<svg'),`Missing SVG ${b.id}`);
        }
        mappings.push({moduleIndex:mi,lessonIndex:li,title,blockIds:blocks.map(b=>b.id)});
        lessonCount++;blockCount+=blocks.length;
      });
    });
    for(const [name,value] of Object.entries({'course.json':metadata,'content.json':content,'lesson-plan.json':plan,'diagram-index.json':diagrams,'source-map.json':mappings,'policy.json':{accessTier:'free',membershipRequirement:'verified',finalAssessmentRoute:'unassigned',labPolicyStatus:'unassigned',samplePositions:[{module:0,lesson:0},{module:0,lesson:1}],publication:'draft'}})) files.set(`${prefix}/${name}`,JSON.stringify(value,null,2)+'\n');
    catalog.push({...metadata,moduleCount:content.modules.length,lessonCount}); inventory.push({id,modules:content.modules.length,lessons:lessonCount,blocks:blockCount,interactive:interactiveCount});
  }
  files.set('catalog.json',JSON.stringify(catalog,null,2)+'\n');
  files.set('provenance.json',JSON.stringify({formatVersion:1,originalCourses,author:'Armature AI Labs',sourceHashes:Object.fromEntries(inputs),publication:'draft',rights:'Original explanations and diagrams; external reference evidence retained privately. Coverage mapping is not review approval.'},null,2)+'\n');
  files.set('inventory.json',JSON.stringify(inventory,null,2)+'\n');
  files.set('SHA256SUMS',[...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,bytes])=>`${hash(bytes)}  ${name}\n`).join(''));
  for(const [filename,digest] of inputs) assert.equal(hash(await readFile(path.join(source,filename))),digest,`Source changed during packaging: ${filename}`);
  for(const [name,bytes] of files){await mkdir(path.dirname(path.join(output,name)),{recursive:true});await writeFile(path.join(output,name),bytes,{flag:'wx',mode:0o600});}
  console.log(JSON.stringify({output,inventory,publication:'draft-only'},null,2));
}
