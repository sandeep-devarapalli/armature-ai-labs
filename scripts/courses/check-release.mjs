import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { backendOrigin, courseHostingAssets } from './release-config.mjs';

const root = path.resolve(process.argv[2] || 'dist-courses-member');
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory)) {
    const file = path.join(directory, entry);
    const stat = await lstat(file);
    assert(!stat.isSymbolicLink(), 'Release cannot contain symlinks.');
    result.push(...(stat.isDirectory() ? await walk(file) : [file]));
  }
  return result;
}
const files = await walk(root);
const text = [];
for (const file of files) {
  const name = path.relative(root, file);
  assert(/^(index\.html|404\.html|robots\.txt|_headers|assets\/[\w.-]+\.(js|css|woff2?|ttf)|brand\/editorial-2026-09\/(editable\/lockup-(light|dark)\.svg|fonts\/SpaceMono-(Regular|Bold)\.ttf))$/.test(name), 'Unexpected release file: ' + name);
  if (/\.(js|html|css)$/.test(name)) text.push(await readFile(file, 'utf8'));
}
const bundle = text.join('\n');
assert(bundle.includes('get_my_course_labs') && bundle.includes('save_my_course_lab') && bundle.includes('Lab reviews'), 'Release must preserve lab checkpoint submissions and review screens; read course-app/LAB-FEATURE-KEEP.md.');
assert(bundle.includes(backendOrigin), 'Expected production backend absent.');
const loopbackUrls = bundle.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?/g) || [];
assert(loopbackUrls.every(url => url === 'http://localhost:9999'), 'Release contains a local backend URL.'); // Supabase SDK retains this unused default.
assert(!/sb_secret_[A-Za-z0-9_-]{15,}|service_role|private-assessments|questionBank|legacyFinalExam|\/__courses\//.test(bundle), 'Release contains privileged data or preview code.');
assert(!bundle.includes('Local test password'), 'Local password control in release.');
assert(!bundle.includes('Local preview'), 'Local-preview title in release.');
for (const [name, expected] of Object.entries(courseHostingAssets(backendOrigin))) assert.equal(await readFile(path.join(root, name), 'utf8'), expected, 'Hosting asset mismatch: ' + name);
console.log(`Course production artifact passed: ${files.length} allowlisted static files; hosted backend, private-content boundary, headers and root-query routing checked.`);
