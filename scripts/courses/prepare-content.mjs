import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { values } = parseArgs({ options: { source: { type: 'string' }, output: { type: 'string' }, original: { type: 'boolean', default: false } } });
if (values.original) {
  const { prepareOriginalCourses } = await import('./prepare-original-courses.mjs');
  await prepareOriginalCourses(path.resolve(root, values.source ?? 'course-content'), path.resolve(root, values.output ?? 'output/original-courses'));
  process.exit(0);
}
const source = await realpath(path.resolve(root, values.source ?? 'course-content'));
async function resolvedDestination(destination) {
  try { return await realpath(destination); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(await resolvedDestination(path.dirname(destination)), path.basename(destination));
  }
}
const output = await resolvedDestination(path.resolve(root, values.output ?? 'output/courses-selected'));
assert(!output.startsWith(`${source}${path.sep}`) && !source.startsWith(`${output}${path.sep}`) && output !== source, 'Preserved source and output must not overlap');
const selected = [
  { id: 'computation-structures', modules: 20, lessons: 208, bank: 'comp-structures' },
  { id: 'maths-ai', modules: 16, lessons: 83, group: 'mathsAi', bank: 'maths-ai' },
  { id: 'embedded-firmware', modules: 19, lessons: 86, group: 'embeddedFirmware', bank: 'embedded-firmware' },
  { id: 'intro-to-robotics', modules: 33, lessons: 190, group: 'introRobotics', bank: 'intro-to-robotics' },
  { id: 'robot-actuators', modules: 14, lessons: 75, group: 'robotActuators', bank: 'robot-actuators' },
];
const digest = (data) => createHash('sha256').update(data).digest('hex');
const files = new Map();
const provenance = [];
const normalizations = [];
const inputHashes = new Map();
async function input(relative) {
  const bytes = await readFile(path.join(source, relative));
  inputHashes.set(relative, digest(bytes));
  return bytes;
}
function json(relative, value) {
  files.set(relative, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}
async function copy(relative, destination = relative) {
  const bytes = await input(relative);
  files.set(destination, bytes);
  provenance.push({ source: relative, destination, sha256: digest(bytes), transformation: 'byte-identical' });
}
async function list(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? list(path.join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));
  return nested.flat().sort();
}

// Validate the preserved transfer before constructing a private import derivative.
const sourceChecksums = await readFile(path.join(source, 'SHA256SUMS'), 'utf8');
for (const line of sourceChecksums.trim().split('\n')) {
  const [expected, relative] = line.split('  ');
  assert.equal(digest(await readFile(path.join(source, relative))), expected, `Source checksum: ${relative}`);
}
const inventory = [];
const catalog = [];
const namedKeys = new Set();
for (const course of selected) {
  const prefix = `courses/${course.id}`;
  const sourceBytes = await input(`${prefix}/content.json`);
  const original = JSON.parse(sourceBytes);
  const content = structuredClone(original);
  if (course.id === 'computation-structures') {
    const lessonTitle = 'Lesson 11.5 — Compiling Statements: Conditionals and Loops';
    const blocks = content.modules[10].lessonContent[lessonTitle].blocks;
    const targets = blocks.filter((block) => block.id === 'm11-5-t3');
    assert.equal(targets.length, 1, 'Expected exactly one approved HTML repair target');
    const block = targets[0];
    const before = structuredClone(block);
    const html = '<p>A <code>for</code> loop like <code>for(i=0; i<N; i++) { body; }</code> is first converted to an equivalent <code>while</code> loop, then compiled using the while template.</p>';
    assert.equal(block.content.html, html, 'Approved HTML repair source must match exactly');
    block.content.html = html.replace('i<N;', 'i&lt;N;');
    normalizations.push({ courseId: course.id, moduleIndex: 10, lessonTitle, blockId: block.id, field: 'content.html', sourceBlockSha256: digest(JSON.stringify(before)), outputBlockSha256: digest(JSON.stringify(block)), hashEncoding: 'UTF-8 JSON.stringify(block)', reason: 'Escape the less-than operator in inline code so HTML parsing preserves the for-loop condition and following text.' });
    const restored = structuredClone(content);
    restored.modules[10].lessonContent[lessonTitle].blocks[blocks.indexOf(block)] = before;
    assert.deepEqual(restored, original, 'Only the approved block may differ from the original');
  } else assert.deepEqual(content, original);

  const metadata = JSON.parse(await input(`${prefix}/course.json`));
  assert.equal(metadata.id, course.id);
  assert.equal(metadata.status, 'draft');
  assert.equal(content.modules.length, course.modules);
  let lessons = 0;
  let blocks = 0;
  let inlineSvgBlocks = 0;
  const types = new Set();
  const courseKeys = new Set();
  const moduleTitles = new Set();
  const lessonMappings = [];
  for (const [moduleIndex, module] of content.modules.entries()) {
    assert(!moduleTitles.has(module.title), `Repeated module title in ${course.id}`);
    moduleTitles.add(module.title);
    assert.equal(new Set(module.subItems).size, module.subItems.length, 'Repeated lesson title');
    assert.deepEqual(Object.keys(module.lessonContent).sort(), [...module.subItems].sort(), 'Syllabus and lesson keys must match');
    for (const [lessonIndex, title] of module.subItems.entries()) {
      const lesson = module.lessonContent[title];
      assert(Array.isArray(lesson.blocks), `Missing lesson blocks: ${title}`);
      assert.equal(new Set(lesson.blocks.map((block) => block.id)).size, lesson.blocks.length, `Duplicate block ID: ${title}`);
      lessonMappings.push({ id: `${course.id}/m${String(moduleIndex + 1).padStart(2, '0')}/l${String(lessonIndex + 1).padStart(2, '0')}`, moduleIndex, lessonIndex, title, source: `${prefix}/content.json` });
      lessons++;
      for (const block of lesson.blocks) {
        assert.equal(typeof block.id, 'string');
        assert(block.id.length > 0);
        blocks++;
        types.add(block.type);
        if (block.type === 'illustration') {
          if (block.content.svgCode) inlineSvgBlocks++;
          else {
            assert.equal(typeof block.content.name, 'string');
            courseKeys.add(block.content.name);
            namedKeys.add(block.content.name);
          }
        }
      }
    }
  }
  assert.equal(lessons, course.lessons);
  const lessonPlan = JSON.parse(await input(`${prefix}/lesson-plan.json`));
  assert.equal(lessonPlan.courseId, course.id);
  assert.equal(lessonPlan.modules.length, content.modules.length);
  for (const [index, module] of lessonPlan.modules.entries()) {
    const original = content.modules[index];
    assert.equal(module.title, original.title);
    assert.deepEqual(module.lessons.map((lesson) => lesson.title), original.subItems);
    for (const lesson of module.lessons) assert.deepEqual(lesson.blockIds, original.lessonContent[lesson.title].blocks.map((block) => block.id));
  }
  const diagramIndex = JSON.parse(await input(`${prefix}/diagram-index.json`));
  assert.deepEqual([...courseKeys].sort(), diagramIndex.namedIllustrations);
  assert.equal(inlineSvgBlocks, diagramIndex.inlineSvgBlocks);
  for (const name of ['course.json', 'lesson-plan.json', 'diagram-index.json']) await copy(`${prefix}/${name}`);
  json(`${prefix}/content.json`, { modules: content.modules });
  json(`${prefix}/source-map.json`, lessonMappings);
  json(`${prefix}/policy.json`, { assessmentRoute: null, labRequirements: null, sampleLessonIds: [], publication: 'draft' });
  assert(content.finalExam, `Missing retained final exam for ${course.id}`);
  json(`private-assessments/${course.id}/legacy-final-exam.json`, content.finalExam);
  await copy(`assessment-source/${course.bank}-final-exam.json`, `private-assessments/${course.id}/question-bank.json`);
  provenance.push({ source: `${prefix}/content.json`, sha256: digest(sourceBytes), destination: `${prefix}/content.json`, assessmentDestination: `private-assessments/${course.id}/legacy-final-exam.json`, transformation: 'Preserve modules except the explicit block normalization below; move finalExam to private assessment source; add no certification policy' });
  catalog.push(metadata);
  inventory.push({ id: course.id, modules: course.modules, lessons, blocks, inlineSvgBlocks, namedDiagrams: courseKeys.size, blockTypes: [...types].sort() });
}
json('catalog.json', catalog);

const registryImports = [];
const registryEntries = [];
const diagramFiles = new Set();
async function dependencyClosure(relative) {
  if (diagramFiles.has(relative)) return;
  diagramFiles.add(relative);
  const text = (await input(relative)).toString();
  for (const match of text.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      assert.equal(specifier, 'react', `Unexpected diagram runtime import: ${specifier}`);
      continue;
    }
    const base = path.posix.join(path.posix.dirname(relative), specifier);
    let resolved;
    for (const extension of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
      try { await input(base + extension); resolved = base + extension; break; }
      catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error; }
    }
    assert(resolved, `Unresolved diagram dependency: ${relative} -> ${specifier}`);
    await dependencyClosure(resolved);
  }
  await copy(relative);
}
for (const course of selected.filter((item) => item.group)) {
  const folder = `diagrams/src/app/components/illustrations/${course.group}`;
  const name = course.group[0].toUpperCase() + course.group.slice(1);
  const specs = (await input(`${folder}/${course.group}Specs.ts`)).toString();
  const keys = [...specs.slice(0, specs.indexOf(']')).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const expected = JSON.parse(await input(`courses/${course.id}/diagram-index.json`)).namedIllustrations;
  assert.deepEqual([...keys].sort(), expected, 'Shared spec must contain only referenced selected-course diagrams');
  registryImports.push(`import { ${course.group}IllustrationComponents } from '../components/illustrations/${course.group}/${name}Illustrations';`);
  for (const key of keys.sort()) registryEntries.push(`  ${key}: ${course.group}IllustrationComponents.${key},`);
  await dependencyClosure(`${folder}/${name}Illustrations.tsx`);
}
const registryPath = 'diagrams/src/app/data/illustrationRegistry.tsx';
files.set(registryPath, Buffer.from([
  '// Generated selected-course registry. Run scripts/courses/prepare-content.mjs.',
  "import type { ComponentType } from 'react';", ...registryImports,
  'export type IllustrationProps = { caption?: string; className?: string };',
  'export const illustrationComponents = {', ...registryEntries, '};',
  'export type PredefinedIllustrationName = keyof typeof illustrationComponents;',
  'export const ILLUSTRATION_OPTIONS = Object.keys(illustrationComponents).map(name => ({ name: name as PredefinedIllustrationName, label: name.replace(/_/g, " ") }));',
  'export function getIllustrationComponent(name: PredefinedIllustrationName): ComponentType<IllustrationProps> | undefined { return illustrationComponents[name]; }', '',
].join('\n')));
assert.equal(registryEntries.length, namedKeys.size);
for (const name of ['COURSE-AUTHORING-PROMPT.md', 'MODULE-INTEGRATION-GUIDE.md', 'SVG-ILLUSTRATION-GUIDE.md']) await copy(`guidelines/source-reference/${name}`);
json('inventory.json', { courses: inventory, totals: { courses: selected.length, modules: inventory.reduce((sum, item) => sum + item.modules, 0), lessons: inventory.reduce((sum, item) => sum + item.lessons, 0), blocks: inventory.reduce((sum, item) => sum + item.blocks, 0), inlineSvgBlocks: inventory.reduce((sum, item) => sum + item.inlineSvgBlocks, 0), namedDiagrams: namedKeys.size, diagramDependencyFiles: diagramFiles.size } });
json('provenance.json', { formatVersion: 2, normalizations, sourceRoot: 'course-content', sourceChecksumManifestSha256: digest(sourceChecksums), courses: selected.map(({ id }) => id), sourceFiles: provenance, generatedRegistry: registryPath, limitations: ['Private draft import, not public assets or publication approval.', 'Practice quizzes retain answers inside protected lesson content.', 'Legacy final exams and newer banks are unapproved source alternatives; grading policy is unassigned.', 'Lesson/source IDs and source order are preserved; derivative positional IDs must stay pinned to the content version.', 'Instructional accuracy, external attribution rights, HTML/SVG sanitization and browser rendering require later review.'] });
files.set('README.md', Buffer.from('# Selected Armature course import\n\nGenerated by `node scripts/courses/prepare-content.mjs`. This private draft derivative contains only the three approved courses. Do not expose this directory through a public web root or ship it as a frontend asset bundle.\n\n`catalog.json` contains draft metadata. `courses/*/content.json` preserves ordered modules and practice quizzes, without final exams, with one scoped HTML repair: computation-structures lesson 11.5 block m11-5-t3 escapes the less-than operator in its for-loop example as `i&lt;N;` so browser parsing retains the condition and following text. All other lesson content remains unchanged; it remains protected learning content including formative answers. `private-assessments/` contains retained legacy exams and newer question banks, separated from lessons and never imported by the frontend. Neither is an approved final assessment. `policy.json` leaves assessment routes and learning labs unassigned; null does not mean no labs.\n\n`source-map.json` supplies deterministic positional lesson identifiers tied to this content version. `inventory.json` reconciles the selected scope; `provenance.json` records source hashes and transformations, including source/output block hashes for the single HTML repair. Three original authoring guides are byte-identical. The narrowed diagram registry contains only referenced keys, with their transitive local source dependencies.\n\nUse `--source /absolute/path/course-content --output /absolute/path/private-derivative` when preparing from another checkout; neither directory may overlap. Keep both outside public/static hosting roots. Run again to verify reproducibility. An existing output must match exactly; use a new output path to issue a changed derivative without overwriting reviewed material. Course publication, sample designation, final assessment and lab policies remain separate review gates.\n'));
files.set('SHA256SUMS', Buffer.from([...files.keys()].sort().map((relative) => `${digest(files.get(relative))}  ${relative}\n`).join('')));
let existing;
try { existing = await list(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  assert.deepEqual(existing, [...files.keys()].sort(), 'Existing output has different files; choose a new output path');
  for (const [relative, bytes] of files) assert.equal(digest(await readFile(path.join(output, relative))), digest(bytes), `Existing derivative differs: ${relative}; choose a new output path`);
} else {
  for (const [relative, bytes] of files) {
    await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
    await writeFile(path.join(output, relative), bytes, { flag: 'wx' });
  }
}
for (const [relative, hash] of inputHashes) assert.equal(digest(await readFile(path.join(source, relative))), hash, `Source changed during preparation: ${relative}`);
for (const [relative, bytes] of files) assert.equal(digest(await readFile(path.join(output, relative))), digest(bytes), `Output verification: ${relative}`);
console.log(JSON.stringify({ output, reused: Boolean(existing), ...JSON.parse(files.get('inventory.json')).totals, files: files.size, sourceUnchanged: true }, null, 2));
