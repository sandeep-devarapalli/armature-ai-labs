import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildDiagramMap, resolveLessonDiagrams } from './resolve-diagrams.mjs';

const directory = '/private/tmp/armature-courses-member-http';
const config = JSON.parse(readFileSync(`${directory}/private.json`, 'utf8'));
assert.equal(config.url, 'http://127.0.0.1:58421');
assert.equal(config.database, 'courses_member_http_check_20261004');
assert.equal(config.databaseContainer, 'supabase_db_armature-equipment-wishlist-check');
const action = process.argv[2];
assert(['prepare', 'correct', 'publish'].includes(action), 'Use prepare, correct <correction-json>, or publish');
const slugs = ['computation-structures', 'maths-ai', 'embedded-firmware'];
const file = `${directory}/pilot-20261004.json`;
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { database: config.database, courses: [] };
assert.equal(state.database, config.database);
const save = () => writeFileSync(file, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
const sql = text => execFileSync('docker', ['exec', '-i', config.databaseContainer, 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U supabase_admin -d courses_member_http_check_20261004 -v ON_ERROR_STOP=1 -qAt'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const baseline = () => sql("select md5(string_agg(row_to_json(v)::text,',' order by v.id)) from public.course_versions v join public.courses c on c.id=v.course_id where c.slug in ('computation-structures','maths-ai','embedded-firmware') and v.version<=4;") + sql("select md5(string_agg(l.id::text||b.blocks::text,',' order by l.id)) from public.course_lessons l join private.course_lesson_content b on b.lesson_id=l.id join public.course_versions v on v.id=l.course_version_id where v.version<=4 and v.source_reference like 'Learning Platform%';");
const before = baseline();
const account = JSON.parse(readFileSync(`${directory}/admin-accounts.json`, 'utf8')).admin;
async function call(path, body, token = config.anonKey) {
  const response = await fetch(config.url + path, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert(response.ok, `${path}: HTTP ${response.status}; inspect state before retrying a mutation`);
  const value = await response.text(); return value ? JSON.parse(value) : null;
}
const login = await call('/auth/v1/token?grant_type=password', { email: account.email, password: account.password });
const rpc = (name, body = {}) => call(`/rest/v1/rpc/${name}`, body, login.access_token);
const detail = id => rpc('admin_get_course_version', { p_version_id: id });
const note = 'Owner approved 4 October 2026: free verified-member learning pilot, introduction and first teaching lesson samples. Isolated local rehearsal only; production, assessment, labs and certificates remain deferred.';
const corrections = action === 'correct' ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null;
const diagramMap = corrections ? await buildDiagramMap('output/courses-corrected-v4') : null;
for (const slug of slugs) {
  let entry = state.courses.find(c => c.slug === slug);
  if (!entry) {
    assert.equal(action, 'prepare', 'Prepare pilot drafts first');
    const versions = await rpc('admin_list_course_versions');
    const base = versions.find(v => v.slug === slug && v.version === 4);
    assert(base && base.status === 'draft' && base.revision === 1 && base.reviewedRevision === null);
    assert(!versions.some(v => v.clonedFromVersionId === base.versionId), 'Existing clone without manifest: inspect before creating another');
    entry = { slug, baseVersionId: base.versionId, phase: 'cloning' }; state.courses.push(entry); save();
    entry.versionId = await rpc('admin_clone_course_version', { p_version_id: base.versionId, p_expected_revision: base.revision, p_note: note });
    entry.phase = 'draft'; save();
  }
  assert(entry.versionId, 'Ambiguous clone outcome: inspect local audit and recover ID manually; do not repeat clone');
  let d = await detail(entry.versionId);
  assert.equal(d.course.clonedFromVersionId, entry.baseVersionId);
  assert.equal(d.course.finalAssessmentRoute, 'unassigned'); assert.equal(d.course.labPolicyStatus, 'unassigned'); assert.equal(d.labRequirements.length, 0);
  if (action === 'prepare') {
    assert.equal(d.course.status, 'draft');
    if (d.course.accessTier !== 'free') {
      assert.equal(d.course.accessTier, 'unassigned');
      await rpc('admin_update_course_version', { p_version_id: entry.versionId, p_expected_revision: d.course.revision, p_title: d.course.title, p_description: d.course.description, p_access_tier: 'free', p_final_assessment_route: 'unassigned', p_lab_policy_status: 'unassigned', p_note: note });
      d = await detail(entry.versionId);
    }
    const samples = d.modules[0].lessons.slice(0, 2); assert.equal(samples.length, 2);
    assert(samples[0].title.startsWith('Introduction')); assert(samples[1].title.startsWith('Lesson 1.1'));
    for (const lesson of samples.filter(l => !l.isSample)) {
      const blocks = await rpc('admin_get_course_lesson', { p_lesson_id: lesson.id });
      await rpc('admin_update_course_lesson', { p_lesson_id: lesson.id, p_expected_revision: d.course.revision, p_title: lesson.title, p_is_sample: true, p_blocks: blocks, p_note: note });
      d = await detail(entry.versionId);
    }
    entry.samples = samples.map(l => ({ id: l.id, title: l.title }));
  } else if (action === 'correct') {
    assert.equal(d.course.status, 'draft');
    const changes = corrections.changes.filter(c => c.courseId === slug);
    const source = JSON.parse(readFileSync(`output/courses-corrected-v4/courses/${slug}/content.json`, 'utf8'));
    const edited = structuredClone(source);
    for (const patch of changes) {
      assert(patch.sourceLessonId.startsWith(slug + '/m01/'), 'Only first-module sample corrections are allowed');
      const li = Number(patch.sourceLessonId.split('/l')[1]) - 1;
      assert(li === 0 || li === 1, 'Only selected sample lessons may change');
      const blocks = edited.modules[0].lessonContent[edited.modules[0].subItems[li]].blocks;
      const bi = blocks.findIndex(b => b.id === patch.blockId); assert(bi >= 0);
      assert.deepEqual(blocks[bi], patch.before, 'Correction must match preserved source');
      assert.equal(patch.before.id, patch.after.id); assert.equal(patch.before.type, patch.after.type);
      blocks[bi] = patch.after;
    }
    const resolvedBefore = resolveLessonDiagrams(source, diagramMap, slug);
    const resolvedAfter = resolveLessonDiagrams(edited, diagramMap, slug);
    for (const sourceId of [...new Set(changes.map(c => c.sourceLessonId))]) {
      const sourceLesson = JSON.parse(sql(`select row_to_json(l) from public.course_lessons l where l.course_version_id='${entry.versionId}' and l.source_id='${sourceId.replaceAll("'", "''")}';`));
      const blocks = await rpc('admin_get_course_lesson', { p_lesson_id: sourceLesson.id });
      let changed = false;
      for (const patch of changes.filter(c => c.sourceLessonId === sourceId)) {
        const index = blocks.findIndex(b => b.id === patch.blockId); assert(index >= 0);
        const li = Number(patch.sourceLessonId.split('/l')[1]) - 1;
        const title = source.modules[0].subItems[li];
        const expectedBefore = resolvedBefore.modules[0].lessonContent[title].blocks.find(b => b.id === patch.blockId);
        const expectedAfter = resolvedAfter.modules[0].lessonContent[title].blocks.find(b => b.id === patch.blockId);
        if (isDeepStrictEqual(blocks[index], expectedAfter)) continue;
        assert.deepEqual(blocks[index], expectedBefore, `Source mismatch ${slug}/${patch.blockId}`);
        blocks[index] = expectedAfter; changed = true;
      }
      if (changed) {
        await rpc('admin_update_course_lesson', { p_lesson_id: sourceLesson.id, p_expected_revision: d.course.revision, p_title: sourceLesson.title, p_is_sample: sourceLesson.is_sample, p_blocks: blocks, p_note: 'Pilot sample review: ' + changes.filter(c => c.sourceLessonId === sourceId).map(c => c.reason).join(' ').slice(0, 1800) });
        d = await detail(entry.versionId);
      }
    }
    entry.sampleCorrectionsApplied = changes.length;
  } else {
    assert(Number.isInteger(entry.sampleCorrectionsApplied), 'Complete and inspect sample correction pass first');
    assert.equal(d.course.accessTier, 'free'); assert.equal(d.modules.flatMap(m => m.lessons).filter(l => l.isSample).length, 2);
    if (d.course.status === 'draft') {
      await rpc('admin_review_course_version', { p_version_id: entry.versionId, p_expected_revision: d.course.revision, p_note: 'Bounded review for local learner rehearsal: v4 correction checks and six sample review completed. Hardware, duration, source permission and broader pedagogical review remain open; no certification sign-off.' });
      await rpc('admin_publish_course_version', { p_version_id: entry.versionId, p_expected_revision: d.course.revision, p_note: note });
      d = await detail(entry.versionId);
    }
    assert.equal(d.course.status, 'published');
  }
  entry.phase = d.course.status; entry.version = d.course.version; entry.revision = d.course.revision;
  save();
}
assert.equal(baseline(), before, 'Earlier version metadata or content changed');
console.log(JSON.stringify({ action, database: state.database, earlierVersionsUnchanged: true, courses: state.courses }, null, 2));
