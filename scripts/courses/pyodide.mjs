// The Python runtime for browser-graded code assignments: Pyodide plus NumPy, SciPy and pytest, served by the
// course site under /pyodide/<version>/ so nothing is loaded from another origin. Every file is pinned by SHA-256.
//   node scripts/courses/pyodide.mjs        download any missing file into .cache/pyodide/<version>/ and verify all
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const manifest = JSON.parse(await readFile(new URL('./pyodide-manifest.json', import.meta.url), 'utf8'));
export const pyodideDir = path.resolve('.cache/pyodide', manifest.version);
export const pyodidePrefix = `pyodide/${manifest.version}/`;
const sha256 = data => createHash('sha256').update(data).digest('hex');

// Returns [{ name, data }] for every pinned file, or throws if a file is missing or altered.
export async function readVerifiedPyodide(dir = pyodideDir) {
  const out = [];
  for (const [name, hash] of Object.entries(manifest.files)) {
    let data;
    try { data = await readFile(path.join(dir, name)); } catch { throw new Error(`Pyodide file missing: ${name}. Run "node scripts/courses/pyodide.mjs" first.`); }
    if (sha256(data) !== hash) throw new Error(`Pyodide file does not match its pinned SHA-256: ${name}. Delete it and run "node scripts/courses/pyodide.mjs".`);
    out.push({ name, data });
  }
  return out;
}

async function fetchMissing() {
  await mkdir(pyodideDir, { recursive: true });
  for (const [name, hash] of Object.entries(manifest.files)) {
    const target = path.join(pyodideDir, name);
    try { if (sha256(await readFile(target)) === hash) continue; } catch { /* missing */ }
    const response = await fetch(manifest.source + name);
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${manifest.source}${name}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (sha256(data) !== hash) throw new Error(`Downloaded ${name} does not match its pinned SHA-256; refusing to use it.`);
    await writeFile(target + '.part', data); await rename(target + '.part', target);
    console.log(`fetched ${name} (${(data.length / 1e6).toFixed(1)} MB)`);
  }
  const files = await readVerifiedPyodide();
  console.log(`Pyodide ${manifest.version}: ${files.length} files verified (${(files.reduce((n, f) => n + f.data.length, 0) / 1e6).toFixed(1)} MB) in ${pyodideDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await fetchMissing();
