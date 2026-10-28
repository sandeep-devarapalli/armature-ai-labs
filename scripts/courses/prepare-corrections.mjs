import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { correctComputation } from './corrections/computation.mjs';
import { correctMathematics } from './corrections/mathematics.mjs';
import { correctEmbedded } from './corrections/embedded.mjs';

const input = await realpath(path.resolve(process.argv[2] ?? 'course-generated'));
const output = path.resolve(process.argv[3] ?? 'output/courses-corrected-v4');
assert(input !== output && !output.startsWith(input + path.sep) && !input.startsWith(output + path.sep), 'Source and derivative must not overlap');
assert(!output.startsWith(path.resolve('public') + path.sep), 'Corrected content must remain private');
const hash = value => createHash('sha256').update(value).digest('hex');
const files = new Map();
const sourceManifest = await readFile(path.join(input, 'SHA256SUMS'), 'utf8');
for (const line of sourceManifest.trim().split('\n')) {
  const [expected, relative] = line.split('  ');
  assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'), 'Unsafe source path');
  const bytes = await readFile(path.join(input, relative));
  assert.equal(hash(bytes), expected, `Source checksum: ${relative}`);
  files.set(relative, bytes);
}
const json = relative => JSON.parse(files.get(relative).toString());
const put = (relative, value) => files.set(relative, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
const changes = [], findings = [], courses = [];
for (const [slug, correct] of [['computation-structures', correctComputation], ['maths-ai', correctMathematics], ['embedded-firmware', correctEmbedded]]) {
  const bodyPath = `courses/${slug}/content.json`, bankPath = `private-assessments/${slug}/question-bank.json`, legacyPath = `private-assessments/${slug}/legacy-final-exam.json`;
  const content = json(bodyPath), original = structuredClone(content), bank = json(bankPath), legacy = json(legacyPath);
  const result = correct({ content, bank, legacy });
  assert(Array.isArray(result), `${slug}: correction results required`);
  findings.push(...result.map(item => ({ courseId: slug, ...item })));
  assert.equal(content.modules.length, original.modules.length, 'Module count changed');
  let lessons = 0, blocks = 0, diagrams = 0, inlineSvgBlocks = 0, questions = 0;
  const names = new Set(), types = new Set();
  const plan = json(`courses/${slug}/lesson-plan.json`);
  for (const [mi, module] of content.modules.entries()) {
    const beforeModule = original.modules[mi];
    assert.equal(module.title, beforeModule.title); assert.deepEqual(module.subItems, beforeModule.subItems, 'Lesson order changed');
    for (const [li, title] of module.subItems.entries()) {
      lessons++;
      const before = beforeModule.lessonContent[title].blocks, after = module.lessonContent[title].blocks;
      assert.deepEqual(after.filter(b => before.some(old => old.id === b.id)).map(b => b.id), before.map(b => b.id), 'Existing block IDs/order must survive');
      assert.equal(new Set(after.map(b => b.id)).size, after.length, 'Duplicate block ID');
      for (const block of after) {
        blocks++; types.add(block.type);
        const old = before.find(b => b.id === block.id);
        if (JSON.stringify(old) !== JSON.stringify(block)) changes.push({ courseId: slug, lessonId: `${slug}/m${String(mi+1).padStart(2,'0')}/l${String(li+1).padStart(2,'0')}`, title, blockId: block.id, operation: old ? 'correct' : 'add', beforeSha256: old ? hash(JSON.stringify(old)) : null, afterSha256: hash(JSON.stringify(block)), before: old ?? null, after: block });
        if (block.type === 'illustration') { diagrams++; if (block.content.svgCode) inlineSvgBlocks++; else { assert(block.content.name); names.add(block.content.name); } }
        if (block.type === 'quiz' && old) assert.deepEqual(block.content.questions.map(q => q.id), old.content.questions.map(q => q.id), 'Practice question IDs/order changed');
        if (block.type === 'quiz') for (const q of block.content.questions) {
          questions++; assert(q.question?.trim() && q.explanation?.trim(), `Missing question/explanation ${q.id}`);
          assert(q.options.length >= 2 && q.options.every(o => o.text?.trim()), `Empty options ${q.id}`);
          assert.equal(new Set(q.options.map(o => o.id)).size, q.options.length, `Duplicate option IDs ${q.id}`);
          assert.equal(q.options.filter(o => o.isCorrect).length, 1, `Answer cardinality ${q.id}`);
        }
      }
      const lessonPlan = plan.modules[mi].lessons[li];
      assert.equal(lessonPlan.title, title);
      lessonPlan.blockIds = after.map(b => b.id);
      lessonPlan.sectionHeadings = after.filter(b => b.type === 'heading').map(b => b.content.text || b.content.html || '');
    }
  }
  for (const [relative, value] of [[bankPath,bank],[legacyPath,legacy]]) {
    const old = files.get(relative);
    const originalQuestions = JSON.parse(old.toString());
    const questions = Array.isArray(value) ? value : value.questions;
    const oldQuestions = Array.isArray(originalQuestions) ? originalQuestions : originalQuestions.questions;
    if (questions && oldQuestions) {
      assert.deepEqual(questions.map(q => q.id), oldQuestions.map(q => q.id), 'Private question IDs/order changed');
      for (const q of questions) {
        if (q.options.every(o => typeof o === 'string')) {
          assert(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length, 'Invalid legacy answer index');
        } else {
          assert.equal(new Set(q.options.map(o => o.id)).size, q.options.length, 'Duplicate private option ID');
          assert(q.options.some(o => o.id === q.correctAnswerId), `Missing private answer ${q.id}`);
        }
      }
    }
    const bytes = Buffer.from(JSON.stringify(value,null,2)+'\n');
    if (hash(old) !== hash(bytes)) changes.push({ courseId:slug, file:relative, operation:'private-assessment-correction', beforeSha256:hash(old), afterSha256:hash(bytes) });
    files.set(relative,bytes);
  }
  put(bodyPath, content); put(`courses/${slug}/lesson-plan.json`, plan);
  put(`courses/${slug}/diagram-index.json`, { namedIllustrations:[...names].sort(), inlineSvgBlocks });
  courses.push({id:slug,modules:content.modules.length,lessons,blocks,diagrams,inlineSvgBlocks,namedDiagrams:names.size,questions,blockTypes:[...types].sort()});
  assert.deepEqual(json(`courses/${slug}/policy.json`), { assessmentRoute:null,labRequirements:null,sampleLessonIds:[],publication:'draft' });
}
const totals = Object.fromEntries(['modules','lessons','blocks','diagrams','inlineSvgBlocks','namedDiagrams','questions'].map(key=>[key,courses.reduce((sum,c)=>sum+c[key],0)]));
put('inventory.json',{courses,totals:{courses:3,...totals}});
put('corrections.json',{format:'armature-course-corrections-v1',version:4,baseManifestSha256:hash(sourceManifest),findings,changes});
const provenance = json('provenance.json');
provenance.correctionDerivative = { version:4,baseManifestSha256:hash(sourceManifest),details:'corrections.json',policy:'draft; no assessment/lab/sample assignments' };
put('provenance.json',provenance);
files.set('README.md',Buffer.from('# Corrected Armature course drafts — version 4\n\nGenerated by `node scripts/courses/prepare-corrections.mjs` from the preserved selected package. See corrections.json for finding status, exact before/after changed blocks and source hashes. Existing module/lesson/block IDs and order are retained; additions are explicit. Lesson plans and diagram inventory are regenerated. Original guides and diagram registry files are unchanged; corrected drawings are inline SVG blocks. Private exams remain unapproved and outside learner content. All policies/samples remain unassigned. No publication or certification is implied. This directory must never be a public web root.\n'));
files.set('SHA256SUMS',Buffer.from([...files.keys()].sort().map(relative=>`${hash(files.get(relative))}  ${relative}\n`).join('')));
let exists=false;
try { await realpath(output); exists=true; } catch(error) { if(error.code!=='ENOENT') throw error; }
if(exists) {
  const walk=async(dir,prefix='')=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(async e=>e.isDirectory()?walk(path.join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]))).flat();
  assert.deepEqual((await walk(output)).sort(),[...files.keys()].sort(),'Existing derivative differs; choose a new output directory');
}
for(const [relative,bytes] of files) {
  const destination=path.join(output,relative);
  if(exists) assert.equal(hash(await readFile(destination)),hash(bytes),`Refusing to overwrite changed derivative: ${relative}`);
  else { await mkdir(path.dirname(destination),{recursive:true}); await writeFile(destination,bytes,{flag:'wx',mode:0o600}); }
}
for (const line of sourceManifest.trim().split('\n')) { const [expected,relative]=line.split('  '); assert.equal(hash(await readFile(path.join(input,relative))),expected,'Source modified during correction'); }
console.log(JSON.stringify({output,reused:exists,findings:findings.length,changedItems:changes.length,...totals},null,2));
