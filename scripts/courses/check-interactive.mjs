import assert from 'node:assert/strict';
import { scenes, validInteractive, measurements } from '../../course-app/interactive/registry.mjs';
for(const [id,s] of Object.entries(scenes)) {
 const c={sceneId:id,parameters:{value:s.initial},caption:'Caption',description:'Explanation',svgCode:'<svg viewBox="0 0 100 100" />'};
 assert(validInteractive(c));
 for(const value of [s.min,s.max]) assert(validInteractive({...c,parameters:{value}}));
 for(const value of [null,'4',NaN,Infinity,s.min-1,s.max+1,s.min+s.step/2]) assert(!validInteractive({...c,parameters:{value}}));
 assert(!validInteractive({...c,parameters:{value:s.initial,code:'alert(1)'}}));
 assert(!validInteractive({...c,sceneId:'toString'}));
 for(const field of ['caption','description','svgCode']) assert(!validInteractive({...c,[field]:''}));
 assert(!validInteractive({...c,code:'anything'}));
 assert(measurements(id,s.initial).length>0);
}
assert.match(measurements('lathe-taper',0),/30.00 mm/);
assert.match(measurements('lathe-taper',10),/12.37 mm/);
assert.match(measurements('tool-geometry',10),/wedge 73°/);
assert.match(measurements('lathe-thread',2),/turns over 40 mm: 20.00/);
assert.match(measurements('milling-index',8),/45.000°/);
assert.match(measurements('milling-index',8),/5.0000 crank/);
assert.match(measurements('pic-timing',4),/Instruction cycle: 1.000 µs/);
assert.match(measurements('pic-register',85),/01010101/);
assert.match(measurements('milling-workholding',.3),/70%.*30%/);
console.log(`${Object.keys(scenes).length} scene contracts: valid bounds, invalid payloads, geometry and timing checks passed`);
