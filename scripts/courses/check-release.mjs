import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { backendOrigin, courseHostingAssets, graderCsp } from './release-config.mjs';
import { manifest as pyodideManifest, pyodidePrefix } from './pyodide.mjs';

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
const pyodideSeen = new Set();
for (const file of files) {
  const name = path.relative(root, file);
  if (name.startsWith(pyodidePrefix)) {
    const hash = pyodideManifest.files[name.slice(pyodidePrefix.length)];
    assert(hash, 'Unexpected Pyodide file: ' + name);
    assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), hash, 'Pyodide file does not match its pinned hash: ' + name);
    pyodideSeen.add(name); continue;
  }
  assert(/^(index\.html|404\.html|robots\.txt|_headers|grader\/worker-[\w-]+\.js|assets\/[\w.-]+\.(js|css|woff2?|ttf)|brand\/editorial-2026-09\/(editable\/lockup-(light|dark)\.svg|fonts\/SpaceMono-(Regular|Bold)\.ttf))$/.test(name), 'Unexpected release file: ' + name);
  if (/\.(js|html|css)$/.test(name)) text.push(await readFile(file, 'utf8'));
}
const bundle = text.join('\n');
assert.equal(pyodideSeen.size, Object.keys(pyodideManifest.files).length, 'Release is missing Pyodide files.');
assert(files.some(file => /grader\/worker-[\w-]+\.js$/.test(file)), 'Release is missing the code-assignment grader worker.');
assert(bundle.includes('save_my_course_assignment') && bundle.includes(`/pyodide/${pyodideManifest.version}/`), 'Release must keep browser-graded code assignments.');
assert(bundle.includes('get_my_course_labs') && bundle.includes('save_my_course_lab') && bundle.includes('Lab reviews'), 'Release must preserve lab checkpoint submissions and review screens; read course-app/LAB-FEATURE-KEEP.md.');
assert(bundle.includes(backendOrigin), 'Expected production backend absent.');
const loopbackUrls = bundle.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?/g) || [];
assert(loopbackUrls.every(url => url === 'http://localhost:9999'), 'Release contains a local backend URL.'); // Supabase SDK retains this unused default.
assert(!/sb_secret_[A-Za-z0-9_-]{15,}|service_role|private-assessments|questionBank|legacyFinalExam|\/__courses\//.test(bundle), 'Release contains privileged data or preview code.');
assert(!bundle.includes('Local test password'), 'Local password control in release.');
assert(!bundle.includes('Local preview'), 'Local-preview title in release.');
for (const [name, expected] of Object.entries(courseHostingAssets(backendOrigin))) assert.equal(await readFile(path.join(root, name), 'utf8'), expected, 'Hosting asset mismatch: ' + name);
const csp = (await readFile(path.join(root, '_headers'), 'utf8')).match(/Content-Security-Policy: (.*)/)[1];
const directive = name => csp.split(';').map(part => part.trim()).find(part => part.startsWith(name + ' '));
// Scripts may come only from the site itself and Cloudflare Web Analytics (static.cloudflareinsights.com), whose beacon reports to cloudflareinsights.com.
assert.equal(directive('script-src'), "script-src 'self' https://static.cloudflareinsights.com", 'Unexpected script sources in the CSP.');
assert.equal(directive('connect-src'), `connect-src 'self' ${backendOrigin} https://cloudflareinsights.com`, 'Unexpected connect sources in the CSP.');
const headers = await readFile(path.join(root, '_headers'), 'utf8');
assert(/\n\/grader\/\*\n  ! Content-Security-Policy\n  Content-Security-Policy: (.*)\n/.test(headers) && headers.match(/\n\/grader\/\*\n  ! Content-Security-Policy\n  Content-Security-Policy: (.*)\n/)[1] === graderCsp, 'Grader worker must replace, not add to, the page CSP.');
assert(headers.indexOf('\n/grader/*') > headers.indexOf('/*\n'), 'Grader header rule must come after the site rule so its detach works.');
assert(/\n\/pyodide\/\*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n/.test(headers), 'Pyodide files must be cached as immutable.');
console.log(`Course production artifact passed: ${files.length} allowlisted static files; hosted backend, private-content boundary, headers and root-query routing checked.`);
