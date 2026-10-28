import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const hash = value => createHash('sha256').update(value).digest('hex');
const identifierPrefix = 'armature-diagram-';

export async function buildDiagramMap(input) {
  input = path.resolve(input);
  const sources = (await readFile(path.join(input, 'SHA256SUMS'), 'utf8')).trim().split('\n')
    .filter(line => line.split('  ')[1]?.startsWith('diagrams/'));
  if (!sources.length) {
    const provenance = JSON.parse(await readFile(path.join(input, 'provenance.json'), 'utf8'));
    assert(provenance.originalCourses?.length, 'Missing checksummed diagram sources');
    return { format: 'armature-private-diagrams-v1', sourceSha256: hash('original-inline-svg-v1'), diagrams: {} };
  }
  for (const line of sources) {
    const [expected, relative] = line.split('  ');
    assert(!relative.split('/').includes('..'), 'Invalid diagram source path');
    assert.equal(hash(await readFile(path.join(input, relative))), expected, `Diagram checksum: ${relative}`);
  }
  const server = await createServer({
    configFile: false, root: process.cwd(), logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const { illustrationComponents } = await server.ssrLoadModule(path.join(input, 'diagrams/src/app/data/illustrationRegistry.tsx'));
    const diagrams = {};
    for (const name of Object.keys(illustrationComponents).sort()) {
      const render = () => renderToStaticMarkup(createElement(illustrationComponents[name]), { identifierPrefix });
      const markup = render();
      assert.equal(render(), markup, `Non-deterministic diagram: ${name}`);
      const dom = new JSDOM(markup);
      try {
        const svgs = dom.window.document.querySelectorAll('svg');
        assert.equal(svgs.length, 1, `Expected one SVG: ${name}`);
        const svg = svgs[0];
        svg.removeAttribute('class');
        assert(svg.getAttribute('viewBox'), `Missing SVG viewBox: ${name}`);
        diagrams[name] = svg.outerHTML;
      } finally { dom.window.close(); }
    }
    return { format: 'armature-private-diagrams-v1', sourceSha256: hash(sources.join('\n')), diagrams };
  } finally { await server.close(); }
}

export function resolveLessonDiagrams(content, map, scope = '') {
  assert.equal(map.format, 'armature-private-diagrams-v1');
  const resolved = structuredClone(content);
  for (const [mi, module] of resolved.modules.entries()) {
    for (const [title, lesson] of Object.entries(module.lessonContent)) {
      for (const [bi, block] of lesson.blocks.entries()) {
        if (!['illustration', 'interactive_diagram'].includes(block.type)) continue;
        let svg = block.content.svgCode || map.diagrams[block.content.name];
        assert(svg, `Unresolved diagram: ${block.content.name}`);
        const prefix = `diagram-${hash(JSON.stringify([scope, mi, title, bi])).slice(0, 20)}-`;
        const ids = new Map([...svg.matchAll(/\bid=(['"])(.*?)\1/g)].map(match => [match[2], prefix + match[2]]));
        svg = svg.replace(/\bid=(['"])(.*?)\1/g, (_match, quote, id) => `id=${quote}${ids.get(id)}${quote}`)
          .replace(/url\(#([^)]+)\)/g, (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match)
          .replace(/\b(href|xlink:href)=(['"])#(.*?)\2/g, (match, attr, quote, id) => ids.has(id) ? `${attr}=${quote}#${ids.get(id)}${quote}` : match)
          .replace(/\b(aria-labelledby|aria-describedby)=(['"])(.*?)\2/g, (_match, attr, quote, value) => `${attr}=${quote}${value.split(/\s+/).map(id => ids.get(id) || id).join(' ')}${quote}`);
        block.content.svgCode = svg;
      }
    }
  }
  return resolved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const input = path.resolve(process.argv[2] ?? 'course-generated');
  const output = path.resolve(process.argv[3] ?? 'output/courses-private-diagrams.json');
  assert(!output.startsWith(path.resolve('public') + path.sep), 'Diagram map must not be public');
  assert(!output.startsWith(input + path.sep), 'Do not alter the checksummed package');
  const map = await buildDiagramMap(input);
  await writeFile(output, JSON.stringify(map) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ output, diagrams: Object.keys(map.diagrams).length, sourceSha256: map.sourceSha256 }));
}
