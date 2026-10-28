import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagramMap, resolveLessonDiagrams } from './resolve-diagrams.mjs';

import { validInteractive } from '../../course-app/interactive/registry.mjs';

const input = path.resolve(process.argv[2] ?? 'course-generated');
const output = path.resolve(process.argv[3] ?? 'output/courses-private-import.sql');
assert(!output.startsWith(path.resolve('public') + path.sep), 'Import SQL must not be public');
assert(!output.startsWith(input + path.sep), 'Do not alter the checksummed input package');
const revision = Number(process.argv[4] ?? 1);
assert(Number.isSafeInteger(revision) && revision > 0, 'Positive integer content version required');
const allCourses = ['computation-structures', 'maths-ai', 'embedded-firmware', 'intro-to-robotics', 'robot-actuators', 'pic-microcontrollers', 'manual-lathe', 'manual-milling', 'ai-in-robotics'];
// COURSES_IMPORT_ONLY=slug[,slug] restricts the import, so adding a course never re-imports the live ones.
const only = (process.env.COURSES_IMPORT_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
for (const slug of only) assert(allCourses.includes(slug), `Unknown course: ${slug}`);
const selected = only.length ? only : allCourses.slice(0, 3);
const hash = data => createHash('sha256').update(data).digest('hex');
for (const line of (await readFile(path.join(input, 'SHA256SUMS'), 'utf8')).trim().split('\n')) {
  const [expected, relative] = line.split('  ');
  assert(!relative.split('/').includes('..') && !path.isAbsolute(relative), 'Invalid checksum path');
  assert.equal(hash(await readFile(path.join(input, relative))), expected, `Input checksum: ${relative}`);
}
const diagramMap = await buildDiagramMap(input);
const provenance = JSON.parse(await readFile(path.join(input, 'provenance.json'), 'utf8'));
const correctionVersion = provenance.correctionDerivative?.version;
if (correctionVersion) assert.equal(revision, correctionVersion, 'Corrected package must use its recorded course version');
const sql = value => "'" + String(value).replaceAll("'", "''") + "'";
function id(key) {
  const bytes = createHash('sha1').update('armature-courses-v1:' + key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
}
async function json(relative) { return JSON.parse(await readFile(path.join(input, relative), 'utf8')); }
// Import is deliberately non-executing and draft-only. Apply only to an isolated database until reviewed.
const statements = [`-- Resolved diagrams: ${diagramMap.format}; source SHA-256 ${diagramMap.sourceSha256}`, '-- Private draft course import. Contains protected content and assessment answers.', 'begin;', 'set local standard_conforming_strings = on;'];
for (const slug of selected) {
  const meta = await json(`courses/${slug}/course.json`);
  const sourceContent = await json(`courses/${slug}/content.json`);
  const content = resolveLessonDiagrams(sourceContent, diagramMap, slug);
  let legacy;
  try { legacy = await json(`private-assessments/${slug}/legacy-final-exam.json`); } catch (error) { if (error.code !== 'ENOENT' || !provenance.originalCourses?.includes(slug)) throw error; }
  let bank;
  try { bank = await json(`private-assessments/${slug}/question-bank.json`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const material = { ...(legacy ? { legacyFinalExam: legacy } : {}), ...(bank ? { questionBank: bank } : {}) };
  assert.equal(meta.id, slug); assert.equal(meta.status, 'draft'); assert(!('finalExam' in content));
  const digest = hash(JSON.stringify({ meta, content, material, diagramFormat: diagramMap.format, diagramSourceSha256: diagramMap.sourceSha256 }));
  const course = id(slug), version = id(`${slug}/v${revision}`);
  statements.push(`insert into public.courses(id,slug${provenance.originalCourses?.includes(slug) ? ',requires_verified_membership' : ''}) values(${sql(course)},${sql(slug)}${provenance.originalCourses?.includes(slug) ? ',true' : ''}) on conflict(id) do nothing;`);
  statements.push(`do $$ begin if exists(select 1 from public.course_versions where course_id=${sql(course)} and version=${revision} and (id<>${sql(version)} or source_sha256<>${sql(digest)})) then raise exception 'Changed course source requires a new version: ${slug}'; end if; end $$;`);
  statements.push(`do $$ begin if exists(select 1 from public.course_versions where id=${sql(version)} and (revision>1 or reviewed_revision is not null or status<>'draft')) then raise exception 'Managed course version cannot be reimported: ${slug}'; end if; end $$;`);
  statements.push(`insert into public.course_versions(id,course_id,version,title,description,source_reference,source_sha256) values(${sql(version)},${sql(course)},${revision},${sql(meta.title)},${sql(meta.description)},${sql(provenance.originalCourses?.includes(slug) ? 'Armature AI Labs original course / '+slug+'; references recorded in private coverage ledger' : 'Learning Platform / '+slug+(correctionVersion ? '; Armature corrected derivative v'+correctionVersion : ''))},${sql(digest)}) on conflict(id) do nothing;`);
  content.modules.forEach((module, mi) => {
    const moduleKey = `${slug}/m${String(mi+1).padStart(2,'0')}`, moduleId = id(`${slug}/v${revision}/${moduleKey}`);
    statements.push(`insert into public.course_modules(id,course_version_id,source_id,title,position) values(${sql(moduleId)},${sql(version)},${sql(moduleKey)},${sql(module.title)},${mi}) on conflict(id) do nothing;`);
    module.subItems.forEach((title, li) => {
      const key = `${moduleKey}/l${String(li+1).padStart(2,'0')}`, lessonId = id(`${slug}/v${revision}/${key}`);
      assert(Array.isArray(module.lessonContent[title].blocks));
      for (const block of module.lessonContent[title].blocks) if (block.type === 'interactive_diagram') assert(validInteractive(block.content), `Invalid interactive block: ${block.id}`);
      statements.push(`insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position) values(${sql(lessonId)},${sql(version)},${sql(moduleId)},${sql(key)},${sql(title)},${li}) on conflict(id) do nothing;`);
      statements.push(`select private.course_validate_blocks(${sql(JSON.stringify(module.lessonContent[title].blocks))}::jsonb);`);
      statements.push(`insert into private.course_lesson_content(lesson_id,blocks) values(${sql(lessonId)},${sql(JSON.stringify(module.lessonContent[title].blocks))}::jsonb) on conflict(lesson_id) do nothing;`);
    });
  });
  statements.push(`insert into private.course_assessment_material(course_version_id,material) values(${sql(version)},${sql(JSON.stringify(material))}::jsonb) on conflict(course_version_id) do nothing;`);
}
statements.push('commit;');
await writeFile(output, statements.join('\n')+'\n', { mode: 0o600 });
console.log(JSON.stringify({ output, courses: selected.length, version: revision, mode: 'draft-only; non-executing', sha256: hash(statements.join('\n')+'\n') }));
