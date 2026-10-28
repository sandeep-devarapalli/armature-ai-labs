import assert from 'node:assert/strict';
const origin = process.argv[2] ?? 'http://127.0.0.1:4189';
const catalogResponse = await fetch(`${origin}/__courses/catalog`);
assert.equal(catalogResponse.headers.get('cache-control'), 'no-store');
const catalog = await catalogResponse.json();
const expected=(process.env.COURSES_EXPECTED_IDS || 'computation-structures,maths-ai,embedded-firmware,intro-to-robotics,robot-actuators,pic-microcontrollers,manual-lathe,manual-milling').split(',');
assert.deepEqual(catalog.map(c=>c.id).sort(),expected.sort());
assert(catalog.every(c=>c.moduleCount>0 && c.lessonCount>0));
for (const course of catalog) {
 const endpoint = `${origin}/__courses/content/${course.id}`;
 const pending = await (await fetch(endpoint)).json();
 assert.equal(pending.modules.flatMap(m => Object.keys(m.lessonContent)).length,['pic-microcontrollers','manual-lathe','manual-milling'].includes(course.id)?2:1);
 const full = await (await fetch(endpoint,{headers:{'X-Course-Preview-Access':'verified'}})).json();
 assert.equal(full.modules.flatMap(m => Object.keys(m.lessonContent)).length,course.lessonCount);
 assert(!('finalExam' in full));
}
for (const route of ['/__courses/content/ai-python','/__courses/content/cs-essentials','/__courses/content/logic-reasoning-problem-solving','/__courses/private-assessments']) {
 assert.equal((await fetch(origin+route)).status,404);
}
assert.equal((await fetch(`${origin}/__courses/catalog`,{method:'POST'})).status,403);
console.log('Preview API: configured course inventory, no-store, sample filtering, full simulated content and excluded/private-route denials passed. This does not test production auth.');
