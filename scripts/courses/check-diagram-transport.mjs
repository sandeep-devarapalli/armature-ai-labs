import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { buildDiagramMap, resolveLessonDiagrams } from './resolve-diagrams.mjs';

const input = path.resolve(process.argv[2] ?? 'course-generated');
const map = await buildDiagramMap(input);
assert.deepEqual(await buildDiagramMap(input), map, 'Independent builds must be deterministic');
assert.equal(Object.keys(map.diagrams).length, 137);
const dom = new JSDOM('');
const purifier = createDOMPurify(dom.window);
let named = 0, inline = 0, lessons = 0;
try {
  for (const slug of ['computation-structures', 'maths-ai', 'embedded-firmware']) {
    const source = JSON.parse(await readFile(path.join(input, 'courses', slug, 'content.json'), 'utf8'));
    const before = JSON.stringify(source);
    const resolved = resolveLessonDiagrams(source, map, slug);
    assert.equal(JSON.stringify(source), before, 'Source mutated');
    assert.deepEqual(resolveLessonDiagrams(source, map, slug), resolved);
    assert(!('finalExam' in resolved));
    for (const [mi, module] of source.modules.entries()) {
      for (const [title, lesson] of Object.entries(module.lessonContent)) {
        lessons++;
        const seenIds = new Set();
        for (const [bi, block] of lesson.blocks.entries()) {
          const result = resolved.modules[mi].lessonContent[title].blocks[bi];
          if (block.type !== 'illustration') {
            assert.deepEqual(result, block, 'Non-named content changed');
            continue;
          }
          if (block.content.svgCode) inline++; else named++;
          const { svgCode, ...other } = result.content;
          const { svgCode: sourceSvg, ...sourceOther } = block.content;
          assert.deepEqual(other, sourceOther, 'Caption or source reference changed');
          dom.window.document.body.innerHTML = svgCode;
          const original = dom.window.document.body.querySelector('svg');
          const labels = original.textContent;
          const elementCount = original.querySelectorAll('*').length;
          if (sourceSvg) {
            const sourceDocument = new dom.window.DOMParser().parseFromString(sourceSvg, 'image/svg+xml');
            assert.equal(original.textContent, sourceDocument.documentElement.textContent, 'Inline labels changed');
            assert.equal(elementCount, sourceDocument.documentElement.querySelectorAll('*').length, 'Inline geometry changed');
          }
          dom.window.document.body.innerHTML = purifier.sanitize(svgCode, {
            USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['image', 'foreignObject', 'script', 'style'],
          });
          assert.equal(dom.window.document.body.querySelector('svg').textContent, labels, 'Sanitizer lost diagram labels');
          assert.equal(dom.window.document.body.querySelector('svg').querySelectorAll('*').length, elementCount, 'Sanitizer lost diagram elements');
          for (const element of dom.window.document.querySelectorAll('[id]')) {
            assert(!seenIds.has(element.id), 'Duplicate lesson SVG identifier');
            seenIds.add(element.id);
          }
          for (const element of dom.window.document.querySelectorAll('[marker-end]')) {
            const target = element.getAttribute('marker-end').match(/^url\(#(.+)\)$/)?.[1];
            if (target) assert(dom.window.document.getElementById(target), 'Broken marker reference');
          }
        }
      }
    }
  }
  assert.equal(named, 137); assert.equal(inline, 189); assert.equal(lessons, 377);
  assert.throws(() => resolveLessonDiagrams({ modules: [{ lessonContent: { test: { blocks: [{ type: 'illustration', content: { name: 'missing' } }] } } }] }, map), /Unresolved diagram/);
  console.log(JSON.stringify({ passed: true, lessons, named, inline, checks: 'determinism, source preservation, sanitizer fidelity, unique identifiers, valid markers, missing-diagram failure' }));
} finally { dom.window.close(); }
