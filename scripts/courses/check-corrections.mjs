import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { buildDiagramMap, resolveLessonDiagrams } from './resolve-diagrams.mjs';

const input=path.resolve(process.argv[2] ?? 'output/courses-corrected-v4');
const output=path.resolve(process.argv[3] ?? 'output/courses-correction-checks.json');
const map=await buildDiagramMap(input);
const dom=new JSDOM(''), purify=createDOMPurify(dom.window);
const results=[];
for(const slug of ['computation-structures','maths-ai','embedded-firmware']) {
 const raw=JSON.parse(await readFile(path.join(input,`courses/${slug}/content.json`),'utf8'));
 const content=resolveLessonDiagrams(raw,map,slug);
 let lessons=0,diagrams=0,questions=0;
 for(const module of content.modules) for(const title of module.subItems) {
  lessons++; const ids=new Set();
  for(const block of module.lessonContent[title].blocks) {
   if(block.type==='quiz') for(const q of block.content.questions) {
    questions++;
    const text=html=>{const e=dom.window.document.createElement('div');e.innerHTML=purify.sanitize(html);return e.textContent.trim();};
    assert(text(q.question).length>0,`Blank rendered question ${slug}/${q.id}`);
    assert(q.options.every(o=>text(o.text).length>0),`Blank rendered option ${slug}/${q.id}`);
    assert.equal(new Set(q.options.map(o=>o.id)).size,q.options.length,`Duplicate options ${slug}/${q.id}`);
    assert.equal(q.options.filter(o=>o.isCorrect).length,1,`Answer count ${slug}/${q.id}`);
   }
   if(block.type!=='illustration')continue;
   diagrams++;const svg=block.content.svgCode;
   assert(svg && !/NaN|Infinity/.test(svg),`Invalid diagram ${slug}/${block.id}`);
   const parsed=new dom.window.DOMParser().parseFromString(svg,'image/svg+xml');
   assert.equal(parsed.querySelectorAll('parsererror').length,0,`Malformed SVG ${slug}/${block.id}`);
   const original=parsed.documentElement;
   assert.equal(original.localName,'svg');assert(original.getAttribute('viewBox'));
   const clean=purify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['image','foreignObject','script','style']});
   const el=dom.window.document.createElement('div');el.innerHTML=clean;
   assert.equal(el.querySelectorAll('svg').length,1);
   assert.equal(el.textContent.replace(/\s+/g,' ').trim(),original.textContent.replace(/\s+/g,' ').trim(),`Sanitizer removed diagram text ${slug}/${block.id}`);
   assert.equal(el.querySelectorAll('script,foreignObject,image').length,0);
   for(const e of el.querySelectorAll('[id]')) { assert(!ids.has(e.id),`Duplicate SVG ID ${slug}/${title}/${e.id}`);ids.add(e.id); }
   for(const e of el.querySelectorAll('[marker-end],[marker-start]')) for(const attr of ['marker-end','marker-start']) {
    const ref=e.getAttribute(attr)?.match(/^url\(#(.+)\)$/)?.[1];if(ref)assert(el.querySelector(`[id="${ref}"]`),`Missing SVG marker ${slug}/${block.id}`);
   }
  }
 }
 results.push({courseId:slug,lessons,diagrams,questions});
}
dom.window.close();
const report={passed:true,scope:'Every corrected lesson: nonempty rendered practice fields, answer cardinality/IDs, SVG parsing, sanitizer label retention, diagram IDs and markers. Semantic/hardware claims remain separately evidenced.',courses:results};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
