import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { indexingPlan, srmFiring, bldcSixStep, wormLock, diffTurn, rvAngles, RV } from './registry.mjs';

// Switched reluctance motor geometry (scene units: 1 = 10 mm). 8 stator poles, 6 rotor teeth, no magnets.
const SRM = { Ro: 2.0, Ry: 1.62, Rb: 1.03, poleW: .44, Rr: 1.0, Rroot: .66, toothW: .5, shaft: .22 };
function srmSide(h) { return (a, r, s) => new THREE.Vector2(r * Math.cos(a) - s * h * Math.sin(a), r * Math.sin(a) + s * h * Math.cos(a)); }
function arcPts(R, t0, t1, n) { const out = []; for (let k = 1; k < n; k++) { const t = t0 + (t1 - t0) * k / n; out.push(new THREE.Vector2(R * Math.cos(t), R * Math.sin(t))); } return out; }
function srmStatorShape() {
  const { Ro, Ry, Rb, poleW } = SRM, h = poleW / 2, P = srmSide(h), pts = [];
  const ry = Math.sqrt(Ry * Ry - h * h), rb = Math.sqrt(Rb * Rb - h * h), sb = Math.asin(h / Rb), sy = Math.asin(h / Ry);
  for (let j = 0; j < 8; j++) {
    const a = j * Math.PI / 4;
    pts.push(P(a, ry, -1), P(a, rb, -1), ...arcPts(Rb, a - sb, a + sb, 6), P(a, rb, 1), P(a, ry, 1), ...arcPts(Ry, a + sy, a + Math.PI / 4 - sy, 10));
  }
  const shape = new THREE.Shape(); shape.absarc(0, 0, Ro, 0, Math.PI * 2, false); shape.holes.push(new THREE.Path(pts)); return shape;
}
function srmRotorShape() {
  const { Rr, Rroot, toothW } = SRM, h = toothW / 2, P = srmSide(h), pts = [];
  const rr = Math.sqrt(Rr * Rr - h * h), r0 = Math.sqrt(Rroot * Rroot - h * h), st = Math.asin(h / Rr), s0 = Math.asin(h / Rroot);
  for (let k = 0; k < 6; k++) {
    const b = k * Math.PI / 3;
    pts.push(P(b, r0, -1), P(b, rr, -1), ...arcPts(Rr, b - st, b + st, 6), P(b, rr, 1), P(b, r0, 1), ...arcPts(Rroot, b + s0, b + Math.PI / 3 - s0, 8));
  }
  return new THREE.Shape(pts);
}

// Interactive scenes for the reference courses. Contract (unchanged): createScene(host, id) returns
// { update(value, view), dispose() }. Units: 1 scene unit = 10 mm unless a label says otherwise.
export function createScene(host, id) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f0e7');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  let envTex = null;
  if (/^(srm|axial|bldc)-/.test(id)) { const pmrem = new THREE.PMREMGenerator(renderer); envTex = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environment = envTex; pmrem.dispose(); }
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const root = new THREE.Group(); scene.add(root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5d6266, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(5, 8, 4); scene.add(light);
  const fill = new THREE.DirectionalLight(0xffffff, .7); fill.position.set(-6, 3, -4); scene.add(fill);
  const materials = [];
  const material = (color, opacity = 1) => { const m = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide }); materials.push(m); return m; };
  const steel = material('#687984'), accent = material('#c47b26'), tool = material('#3f5430'), ghost = material('#90a7b1', .25);
  const dark = material('#3b4650'), light2 = material('#a9b7bf'), work = material('#c9b48c'), brass = material('#b08a3e');
  const BASE = materials.length;
  function mesh(geometry, mat, position = [0, 0, 0]) { const m = new THREE.Mesh(geometry, mat); m.position.set(...position); root.add(m); return m; }
  function box(w, h, d, mat, p) { return mesh(new THREE.BoxGeometry(w, h, d), mat, p); }
  // cylinder along Z (lathe and dividing-head axis)
  function cylinder(r1, r2, length, mat, p = [0, 0, 0], seg = 48) { const m = mesh(new THREE.CylinderGeometry(r1, r2, length, seg), mat, p); m.rotation.x = Math.PI / 2; return m; }
  // cylinder along Y (milling spindle)
  function vcyl(r, length, mat, p = [0, 0, 0], seg = 40) { return mesh(new THREE.CylinderGeometry(r, r, length, seg), mat, p); }
  function clear() { for (const o of [...root.children]) { o.traverse(n => n.geometry?.dispose()); root.remove(o); } }
  function line(points, color = '#c47b26') { const mat = new THREE.LineBasicMaterial({ color }); materials.push(mat); root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat)); }
  function arrow(from, to, color = '#c47b26', head = .14) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), dir = b.clone().sub(a); const len = dir.length();
    if (len < 1e-3) return;
    const h = new THREE.ArrowHelper(dir.normalize(), a, len, new THREE.Color(color).getHex(), head, head * .6); root.add(h);
  }
  function label(text, position, width = 1.9) {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 96;
    const ctx = canvas.getContext('2d'); ctx.font = '48px Arial'; canvas.width = Math.ceil(ctx.measureText(text).width) + 40; ctx.fillStyle = '#f4f0e7'; ctx.fillRect(0, 0, canvas.width, 96);
    ctx.font = '48px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#17212a'; ctx.fillText(text, canvas.width / 2, 64);
    const texture = new THREE.CanvasTexture(canvas); const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false }); materials.push(mat);
    const sprite = new THREE.Sprite(mat); sprite.geometry = sprite.geometry.clone(); sprite.position.set(...position); sprite.scale.set(width, width * 96 / canvas.width, 1); sprite.userData.baseScale = sprite.scale.clone(); root.add(sprite);
  }
  function render() { if (!document.hidden && host.getBoundingClientRect().bottom > 0 && host.getBoundingClientRect().top < innerHeight) renderer.render(scene, camera); }
  let angle = 0, camDist = 7, camHeight = 4.5, camYaw = .65, lookY = 0;
  const place = (fit = 1) => { camera.position.set(camDist * Math.sin(angle + camYaw) * fit, camHeight * fit, camDist * Math.cos(angle + camYaw) * fit); camera.lookAt(0, lookY, 0); };
  const resize = () => { const w = host.clientWidth; if (!w) return; renderer.setSize(w, 340, false); camera.aspect = w / 340; const fit = Math.max(1, 1.6 / camera.aspect); place(fit); if (id === 'tool-geometry' && angle === 0) { camera.position.set(0, 1, 8 * fit); camera.lookAt(0, 0, 0); } root.children.forEach(o => { if (o.isSprite) o.scale.copy(o.userData.baseScale).multiplyScalar(fit); }); camera.updateProjectionMatrix(); render(); };
  const observer = new ResizeObserver(resize);
  const visible = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) render(); });
  const shown = () => render();
  host.appendChild(renderer.domElement); observer.observe(host); visible.observe(host); document.addEventListener('visibilitychange', shown);

  // ---------- scenes ----------
  function latheMotion(turns) {
    camDist = 8.6; camHeight = 3.6; camYaw = 1.2; lookY = -.3;
    const a = turns * Math.PI * 2;                     // work rotation
    const zTool = 1.9 - turns * .2;                    // carriage feeds towards the chuck; feed drawn x10 (0.2 mm/rev real)
    box(1.7, .3, 7.2, dark, [0, -1.6, 0]);
    for (const x of [-.55, .55]) box(.28, .12, 7.2, light2, [x, -1.39, 0]);
    box(1.8, 2.0, 1.1, steel, [0, -.45, -3.05]);       // headstock
    const chuck = cylinder(.78, .78, .45, steel, [0, 0, -2.27]); chuck.rotation.z = a;
    for (let j = 0; j < 3; j++) { const t = a + j * 2 * Math.PI / 3; const jaw = box(.2, .2, .42, dark, [.55 * Math.cos(t), .55 * Math.sin(t), -1.98]); jaw.rotation.z = t; }
    const uncutLen = zTool - (-2.05), cutLen = 2.25 - zTool;
    if (uncutLen > 0) cylinder(.46, .46, uncutLen, work, [0, 0, -2.05 + uncutLen / 2]);
    if (cutLen > 0) cylinder(.29, .29, cutLen, work, [0, 0, zTool + cutLen / 2]);
    for (const [r, z0, len] of [[.46, -2.05, uncutLen], [.29, zTool, cutLen]]) if (len > .05) { const s = box(.05, .05, len, accent, [r * Math.cos(a), r * Math.sin(a), z0 + len / 2]); s.rotation.z = a; }   // rotation mark
    box(1.0, 1.25, .9, steel, [0, -.82, 3.05]);         // tailstock
    cylinder(.14, .14, .5, light2, [0, 0, 2.55]);
    const centre = mesh(new THREE.ConeGeometry(.14, .25, 24), light2, [0, 0, 2.2]); centre.rotation.x = -Math.PI / 2;
    box(1.9, .22, .95, steel, [.3, -1.22, zTool]);      // saddle
    box(1.05, .18, .7, light2, [.75, -1.02, zTool]);     // cross-slide
    box(.42, .55, .42, accent, [.95, -.66, zTool]);      // tool post
    box(.66, .1, .1, tool, [.62, 0, zTool]);             // tool bit, tip on the turned diameter
    const chip = []; for (let i = 0; i <= 40; i++) { const t = i / 40 * 2.5 * Math.PI; chip.push(new THREE.Vector3(.4 + .12 * Math.cos(t) + i * .006, .12 + .12 * Math.sin(t), zTool + .05 + i * .004)); } line(chip);
    arrow([1.45, -.2, zTool], [1.45, -.2, zTool - .8]);
    label('Headstock', [0, 1.0, -3.05], 1.5); label('Tailstock', [0, .35, 3.05], 1.5);
    label('Feed towards the chuck', [1.6, .45, zTool - .4], 2.2); label('Shoulder', [0, .95, zTool + .1], 1.3);
  }

  function millingMotion(deg) {
    camDist = 6.0; camHeight = 5.6; camYaw = .95; lookY = -.2;
    const rot = -deg * Math.PI / 180;                  // right-hand cutter, clockwise seen from above
    const xc = .2 + deg / 360 * .2;                    // feed drawn x10: 0.20 mm/rev real
    const r = .4, depth = .5, yTop = 0;
    box(4.4, .5, 2.6, light2, [0, -.75, 0]);           // floor under the slot (lighter so the cut shows)
    box(4.4, depth, .9, work, [0, -.25, -.85]);        // side walls of the slot
    box(4.4, depth, .9, work, [0, -.25, .85]);
    const ahead = 2.2 - xc; if (ahead > 0) box(ahead, depth, .8, work, [xc + ahead / 2, -.25, 0]);   // uncut material ahead of the cutter
    vcyl(r * .82, 1.0, steel, [xc, -.0, 0]);           // fluted body core
    for (let f = 0; f < 4; f++) {                       // four helical flutes
      const pts = []; for (let i = 0; i <= 24; i++) { const y = -.5 + i / 24; const t = rot + f * Math.PI / 2 + y * 1.6; pts.push(new THREE.Vector3(xc + r * .9 * Math.cos(t), y, r * .9 * Math.sin(t))); }
      const cutting = Math.cos(rot + f * Math.PI / 2 - .8) > .9;
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, .07, 8, false), cutting ? accent : tool);
    }
    vcyl(.4, 1.4, steel, [xc, 1.2, 0]);                // shank
    vcyl(.75, .5, dark, [xc, 2.15, 0]);                 // spindle nose
    for (let k = 0; k < 4; k++) { const t = rot + .6 + k * .5; const chip = mesh(new THREE.TorusGeometry(.1, .035, 6, 14, Math.PI * 1.4), accent, [xc + .45 + k * .2, .1 + k * .16, .5 * Math.sin(t) - .2]); chip.rotation.set(t, t * .7, 0); }
    arrow([-1.9, .45, 1.5], [-.9, .45, 1.5]);
    label('Feed +X (drawn ×10)', [-.9, .7, 2.0], 2.0); label('Slot already cut', [-1.9, .55, -.5], 1.6); label('Chips', [xc + 1.3, .95, -.3], 1.0);
  }

  function millingIndex(n) {
    camDist = 6.8; camHeight = 3.0; camYaw = .35; lookY = .2;
    const plan = indexingPlan(n);
    box(2.2, 1.4, 1.6, dark, [0, -1.0, .2]);           // head body
    cylinder(1.45, 1.45, .12, light2, [0, .55, .75]);
    for (let i = 0; i < plan.circle; i++) { const t = i / plan.circle * 2 * Math.PI; cylinder(.045, .045, .14, dark, [1.2 * Math.cos(t), .55 + 1.2 * Math.sin(t), .83], 12); }
    const t0 = Math.PI / 2, t1 = t0 - plan.holes / plan.circle * 2 * Math.PI;
    for (const t of [t0, t1]) { const arm = box(1.3, .05, .03, accent, [.65 * Math.cos(t), .55 + .65 * Math.sin(t), .9]); arm.rotation.z = t; }   // sector arms
    const crank = box(1.25, .1, .06, steel, [.62 * Math.cos(t1), .55 + .62 * Math.sin(t1), .97]); crank.rotation.z = t1;
    cylinder(.07, .07, .3, accent, [1.2 * Math.cos(t1), .55 + 1.2 * Math.sin(t1), 1.0], 16);   // index pin in the target hole
    cylinder(.16, .16, .35, steel, [0, .55, .95], 24);
    cylinder(.25, .25, 1.4, steel, [0, .55, -.95]);    // spindle
    const part = cylinder(.75, .75, .9, work, [0, .55, -1.9], n); part.rotation.y = 0; part.rotation.z = Math.PI / 2 + Math.PI / n;   // n-sided workpiece
    label(`${n} divisions · ${(360 / n).toFixed(2)}° each`, [0, 2.35, -1.2], 2.6);
    label(plan.holes ? `${plan.turns} turns + ${plan.holes} holes on the ${plan.circle}-hole circle` : `${plan.turns} whole turns of the crank`, [0, -1.95, .9], 3.4);
  }

  function latheThread(pitchMm) {
    camDist = 6.8; camHeight = 3.0; camYaw = 1.05;
    const p = pitchMm / 10, rMaj = 1, depth = .6134 * p, rMin = rMaj - depth, L = 4;
    const crest = p / 16, flankEnd = crest + depth * Math.tan(Math.PI / 6);
    const rAt = u => { const x = Math.abs(u); return x <= crest ? rMaj : x >= flankEnd ? rMin : rMaj - (x - crest) / Math.tan(Math.PI / 6); };
    const nT = 96, nZ = Math.min(1600, Math.ceil(L / p * 24));
    const pos = [], idx = [];
    for (let j = 0; j <= nZ; j++) { const z = -L / 2 + L * j / nZ; for (let i = 0; i <= nT; i++) { const t = i / nT * 2 * Math.PI; let u = ((z - p * t / (2 * Math.PI)) % p + p) % p - p / 2; const r = rAt(u); pos.push(r * Math.cos(t), r * Math.sin(t), z); } }
    for (let j = 0; j < nZ; j++) for (let i = 0; i < nT; i++) { const a = j * (nT + 1) + i, b = a + nT + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    mesh(g, steel);
    for (const z of [-L / 2, L / 2]) { const cap = mesh(new THREE.CircleGeometry(rMaj, 64), steel, [0, 0, z]); }   // end caps
    const back = .8, half = back * Math.tan(Math.PI / 6), hy = .09, x0 = rMin + .02;
    const tv = [x0, -hy, 0, x0 + back, -hy, -half, x0 + back, -hy, half, x0, hy, 0, x0 + back, hy, -half, x0 + back, hy, half];
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3)); tg.setIndex([0, 1, 2, 3, 5, 4, 0, 3, 4, 0, 4, 1, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2]); tg.computeVertexNormals();
    mesh(tg, accent);                                    // 60° form tool in the groove at the front
    box(1.2, .25, .5, tool, [x0 + back + .6, 0, 0]);       // tool shank
    const z0 = .6; line([new THREE.Vector3(0, rMaj + .12, z0), new THREE.Vector3(0, rMaj + .12, z0 + p)], '#17212a');
    for (const z of [z0, z0 + p]) line([new THREE.Vector3(0, rMaj + .04, z), new THREE.Vector3(0, rMaj + .2, z)], '#17212a');
    label(`One pitch = ${pitchMm} mm`, [0, rMaj + .5, z0 + p / 2], 2.0); label('60° thread form, Ø20 mm', [0, -1.6, -.6], 2.4); label('Form tool', [2.6, -.75, 1.0], 1.1);
  }

  function millingWorkholding(s) {
    camDist = 7.4; camHeight = 4.6;
    box(5.4, .35, 3.2, dark, [0, -1.25, 0]);                            // table
    for (const z of [-.8, .8]) box(5.4, .06, .35, steel, [0, -1.05, z]);   // T-slot mouths
    box(1.6, 1.2, 1.9, work, [-1.6, -.5, 0]);                          // work
    box(1.0, .4, 1.0, steel, [1.6, -.88, 0]); box(.8, .4, 1.0, steel, [1.6, -.48, 0]); box(.6, .4, 1.0, steel, [1.6, -.08, 0]);   // step-block heel
    box(3.9, .22, .65, light2, [0, .23, 0]);                           // strap
    const x = -1.5 + 3 * s;
    vcyl(.1, 2.0, steel, [x, -.2, 0], 16);                              // stud from the T-slot nut
    vcyl(.24, .05, light2, [x, .37, 0], 24); vcyl(.2, .2, steel, [x, .5, 0], 6);   // washer and nut
    const workShare = 1 - s, heelShare = s;
    arrow([x, 1.6, 0], [x, .7, 0], '#c47b26', .16);
    arrow([-1.55, .36 + .9 * workShare, .45], [-1.55, .36, .45], '#3f5430', .14);
    arrow([1.55, .36 + .9 * heelShare, .45], [1.55, .36, .45], '#3f5430', .14);
    label('Screw force', [x, 2.0, -.4], 1.5); label(`Work ${Math.round(workShare * 100)}%`, [-1.9, 1.45, .9], 1.4); label(`Heel ${Math.round(heelShare * 100)}%`, [1.9, 1.45, .9], 1.4);
  }

  function latheTaper(half) {
    camDist = 9.0; camHeight = 3.2; camYaw = 1.35;
    const small = (30 - 100 * Math.tan(half * Math.PI / 180)) / 20;
    cylinder(.95, .95, .5, steel, [0, 0, -2.85]);                       // chuck
    for (let j = 0; j < 3; j++) { const t = Math.PI / 2 + j * 2 * Math.PI / 3; const jaw = box(.25, .25, .5, dark, [1.0 * Math.cos(t), 1.0 * Math.sin(t), -2.5]); jaw.rotation.z = t; }
    cylinder(small, 1.5, 5, work, [0, 0, 0]);
    const k = Math.atan((1.5 - small) / 5);                            // drawn half-angle
    const comp = box(.45, .3, 2.6, light2, [2.1, -1.0, .2]); comp.rotation.y = -k;   // compound slide, swung to the half-angle
    const tp = box(.4, .45, .4, accent, [1.8, -.55, .2]); tp.rotation.y = -k;
    const rz = 1.5 + (small - 1.5) * ((.2 + 2.5) / 5), xs = Math.sqrt(Math.max(rz * rz - .55 * .55, .01));
    box(1.62 - xs, .08, .08, tool, [(xs + 1.62) / 2, -.55, .2]);   // tool bit from the tool post to the cone surface
    line([new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, 3)], '#637584');
    label('Major Ø30 mm', [0, 2.0, -2.0], 1.8); label(`Minor Ø${(small * 20).toFixed(2)} mm`, [0, 1.45, 2.4], 1.9); label(`Compound set to ${half}°`, [2.6, -1.6, .2], 2.2);
  }

  function toolGeometry(value, view) {
    camDist = 7; camHeight = 4.5;
    if (view === 0) { camera.position.set(0, 1, 8); camera.lookAt(0, 0, 0); }
    const rake = value * Math.PI / 180, clearance = 7 * Math.PI / 180;
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(-3, -3 * Math.tan(rake)); shape.lineTo(-3, -2); shape.lineTo(-2 * Math.tan(clearance), -2); shape.closePath();
    mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false }), tool, [1.5, 1, -.75]);
    const arc = []; for (let i = 0; i <= 40; i++) { const a = Math.PI + rake + (Math.PI / 2 - clearance - rake) * i / 40; arc.push(new THREE.Vector3(1.5 + .65 * Math.cos(a), 1 + .65 * Math.sin(a), .8)); } line(arc, '#c47b26');
    label(`Rake ${value}°`, [-.9, 1.6, .8], 1.5); label(`Wedge ${83 - value}°`, [-.6, .1, .8], 1.6); label('Clearance 7°', [2.3, -1.4, .8], 1.7);
    line([new THREE.Vector3(-2, 1, 0), new THREE.Vector3(2, 1, 0)]); line([new THREE.Vector3(1.5, -1.5, 0), new THREE.Vector3(1.5, 2, 0)], '#637584');
  }

  // ---------- switched reluctance motor ----------
  const std = (color, metalness, roughness, emissive) => { const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide }); if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = .6; } materials.push(m); return m; };
  function laminated(shape, length, n, mat, group, seg = 24) {
    const t = length / n, geo = new THREE.ExtrudeGeometry(shape, { depth: t * .88, bevelEnabled: false, curveSegments: seg });
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, mat); m.position.z = -length / 2 + i * t; group.add(m); }
  }
  function coilAround(a, length, mat, group) {
    const h = SRM.poleW / 2, rad = new THREE.Vector3(Math.cos(a), Math.sin(a), 0), perp = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    for (let r = 1.16; r <= 1.53; r += .09) for (const off of [.07, .15]) {
      const w = h + off, L = length / 2 + off + .03, c = .12, pts = [];
      for (const [u0, z0, s] of [[w - c, L - c, 0], [-(w - c), L - c, Math.PI / 2], [-(w - c), -(L - c), Math.PI], [w - c, -(L - c), 1.5 * Math.PI]])
        for (let k = 0; k <= 6; k++) { const t = s + k / 6 * Math.PI / 2; pts.push(rad.clone().multiplyScalar(r).add(perp.clone().multiplyScalar(u0 + c * Math.cos(t))).setZ(z0 + c * Math.sin(t))); }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, .042, 6, true), mat));
    }
  }
  function srmMotor(length, slices, coilMat) {
    const steelM = std('#8d969c', .55, .42), stator = new THREE.Group(), rotor = new THREE.Group(); root.add(stator, rotor);
    laminated(srmStatorShape(), length, slices, steelM, stator, 48);
    for (let j = 0; j < 8; j++) coilAround(j * Math.PI / 4, length, coilMat(j % 4), stator);
    laminated(srmRotorShape(), length, slices, steelM, rotor, 24);
    return { stator, rotor };
  }
  function srmExploded(mm) {
    camDist = 11.2; camHeight = 3.6; camYaw = 1.12; lookY = -.1;
    const copper = std('#b8733a', .85, .32), shaftM = std('#c6cbcf', .9, .22);
    const { stator, rotor } = srmMotor(3.0, 20, () => copper);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SRM.shaft, SRM.shaft, 5.4, 32), shaftM); shaft.rotation.x = Math.PI / 2; shaft.position.z = .6; rotor.add(shaft);
    const s = mm / 10 * .6; stator.position.z = -s; rotor.position.z = s;
    label('stator: laminated steel, 8 wound poles', [0, 2.7, -s], 3.4);
    label('rotor: 6 steel teeth, no magnets', [0, -1.65, s + .4], 3.0);
  }
  function srmRotation(deg) {
    camDist = 8.6; camHeight = 1.1; camYaw = 0; lookY = 0;
    const f = srmFiring(deg), copper = std('#8a6a4c', .7, .45), hot = std('#e08a2c', .6, .35, '#c4561a');
    const { rotor } = srmMotor(.9, 6, p => (p === f.phase ? hot : copper));
    rotor.rotation.z = (deg - 15) * Math.PI / 180;
    for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; label('ABCD'[j % 4], [2.3 * Math.cos(a), 2.3 * Math.sin(a), .5], .32); }
    const pa = f.phase * Math.PI / 4, ta = pa - f.gap * Math.PI / 180, z = .5;
    arrow([1.1 * Math.cos(ta), 1.1 * Math.sin(ta), z], [1.1 * Math.cos(pa), 1.1 * Math.sin(pa), z], '#c4561a', .12);
    label(`phase ${'ABCD'[f.phase]} on`, [-4.0, 1.9, 0], 1.9);
    label(`next tooth ${f.gap}° from line-up`, [4.1, -1.9, 0], 2.9);
  }
  function srmGap(g) {
    camDist = 8.4; camHeight = 1.6; camYaw = .45; lookY = .1;
    const steelM = std('#8d969c', .55, .42), copper = std('#b8733a', .85, .32), gv = g * 6, rel = .12 / (g + .02);
    box(1.6, 1.8, 1.2, steelM, [0, gv / 2 + .9, 0]);
    for (let k = 0; k < 5; k++) for (const [x, zz, w, d] of [[.88, 0, .12, 1.44], [-.88, 0, .12, 1.44], [0, .66, 1.88, .12], [0, -.66, 1.88, .12]]) box(w, .1, d, copper, [x, gv / 2 + .45 + k * .14, zz]);
    box(1.6, 1.6, 1.2, steelM, [0, -(gv / 2 + .8), 0]);
    const n = Math.max(1, Math.round(12 * rel));
    for (let i = 0; i < n; i++) { const x = -.7 + 1.4 * (i + .5) / n; arrow([x, -(gv / 2 + .55), .62], [x, gv / 2 + .55, .62], '#c4561a', .1); }
    label(`air gap ${g.toFixed(2)} mm (drawn 60× larger)`, [3.6, .35, 0], 3.3);
    label(`flux ${Math.round(rel * 100)} % of the 0.10 mm value`, [3.6, -.45, 0], 3.3);
    label('stator pole and coil', [-3.2, gv / 2 + 1.2, 0], 2.2); label('rotor tooth', [-3.0, -(gv / 2 + .8), 0], 1.4);
  }


  // ---------- axial-flux motor and six-step commutation (v9) ----------
  function sector(r1, r2, a1, a2, b1, b2, n = 12) {           // inner arc r1 from a1..a2, outer arc r2 from b1..b2 (radians)
    const s = new THREE.Shape(); s.moveTo(r1 * Math.cos(a1), r1 * Math.sin(a1));
    for (let k = 1; k <= n; k++) { const t = a1 + (a2 - a1) * k / n; s.lineTo(r1 * Math.cos(t), r1 * Math.sin(t)); }
    for (let k = 0; k <= n; k++) { const t = b2 - (b2 - b1) * k / n; s.lineTo(r2 * Math.cos(t), r2 * Math.sin(t)); }
    s.closePath(); return s;
  }
  function upright(shape, depth, z0, mat, group, holes) {        // extrude along the shaft, shaft vertical (world y)
    if (holes) shape.holes.push(...holes);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 }); g.translate(0, 0, z0); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); group.add(m); return m;
  }
  function ring(r1, r2) { const s = new THREE.Shape(); s.absarc(0, 0, r2, 0, Math.PI * 2, false); const h = new THREE.Path(); h.absarc(0, 0, r1, 0, Math.PI * 2, true); s.holes.push(h); return s; }
  function axialExploded(mm) {
    camDist = 9.6; camHeight = 4.6; camYaw = .7; lookY = 0;
    const D = Math.PI / 180, Ri = 35 / 30, Ro = 2.0, core = 20 / 30, shoe = 2 / 30, gap = 1 / 30, mag = 4 / 30, iron = 5 / 30, sk = 6 * D;
    const toothM = std('#5b6169', .45, .5), shoeM = std('#6f757d', .45, .45), copper = std('#b8733a', .85, .32), ironM = std('#9aa1a8', .6, .38);
    const north = std('#d65050', .2, .5), south = std('#5078d6', .2, .5), dark = std('#3c3c42', .5, .5), shaftM = std('#c6cbcf', .9, .22);
    const stator = new THREE.Group(), top = new THREE.Group(), bot = new THREE.Group(); root.add(stator, top, bot);
    for (let k = 0; k < 12; k++) {
      const a = k * 30 * D;
      upright(sector(Ri, Ro, a - 8 * D, a + 8 * D, a - 9.5 * D + sk, a + 9.5 * D + sk), core, -core / 2, toothM, stator);
      for (const z of [core / 2, -core / 2 - shoe]) upright(sector(Ri - .03, Ro + .03, a - 12.5 * D, a + 12.5 * D, a - 13.5 * D + sk, a + 13.5 * D + sk), shoe, z, shoeM, stator);
      const hole = sector(Ri, Ro, a - 8 * D, a + 8 * D, a - 9.5 * D + sk, a + 9.5 * D + sk); const holePath = new THREE.Path(hole.getPoints());
      upright(sector(Ri - .09, Ro + .09, a - 11.6 * D, a + 11.6 * D, a - 11.6 * D + sk, a + 11.6 * D + sk), core - .06, -(core - .06) / 2, copper, stator, [holePath]);
    }
    const zs = core / 2 + shoe + gap;
    for (const [g, sgn] of [[top, 1], [bot, -1]]) {
      upright(ring(.9, Ro + .17), iron, sgn > 0 ? zs + mag : -zs - mag - iron, ironM, g);
      for (let m = 0; m < 10; m++) { const a = m * 36 * D; upright(sector(Ri + .03, Ro, a - 14 * D, a + 14 * D, a - 14 * D, a + 14 * D), mag, sgn > 0 ? zs : -zs - mag, ((m % 2 === 0) === (sgn > 0)) ? north : south, g); }
      upright(ring(Ro + .03, Ro + .17), mag, sgn > 0 ? zs : -zs - mag, dark, g);
    }
    const s = mm / 40 * 1.9; top.position.y = s; bot.position.y = -s;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, 2.6 + 2 * s, 32), shaftM); root.add(shaft);
    label('rotor: 10 magnets on a steel disc', [0, s + 1.25, 0], 3.2);
    label('stator: 12 coil-wound teeth, no back iron', [3.6, 0, 0], 3.6);
    label('rotor: magnets face the stator', [0, -s - 1.45, 0], 3.0);
  }
  function bldcRotatingField(deg) {
    camDist = 8.2; camHeight = .25; camYaw = 0; lookY = 0;
    const D = Math.PI / 180, f = bldcSixStep(deg), len = .5;
    const steelM = std('#8d969c', .55, .42), copper = std('#8a6a4c', .7, .45), hot = std('#e08a2c', .6, .35, '#c4561a');
    const north = std('#d65050', .2, .5), south = std('#5078d6', .2, .5), hallM = std('#22262b', .3, .6);
    const g = new THREE.Group(); root.add(g);
    const yoke = new THREE.Mesh(new THREE.ExtrudeGeometry(ring(1.75, 2.05), { depth: len, bevelEnabled: false, curveSegments: 64 }), steelM); yoke.position.z = -len / 2; g.add(yoke);
    const axes = { A: 90, B: 210, C: 330 };
    for (const [ph, a0] of Object.entries(axes)) for (const a of [a0, a0 + 180]) {
      const r = a * D, on = ph === f.plus || ph === f.minus;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(.7, .32, len), steelM); tooth.position.set(1.42 * Math.cos(r), 1.42 * Math.sin(r), 0); tooth.rotation.z = r; g.add(tooth);
      const coil = new THREE.Mesh(new THREE.BoxGeometry(.42, .56, len + .16), on ? hot : copper); coil.position.set(1.5 * Math.cos(r), 1.5 * Math.sin(r), 0); coil.rotation.z = r; g.add(coil);
      if (a === a0) label(on ? `${ph}${ph === f.plus ? '+' : '−'}` : ph, [2.45 * Math.cos(r), 2.45 * Math.sin(r), .4], .5);
    }
    const rotor = new THREE.Group(); g.add(rotor);
    for (const [mat, a0] of [[north, -90], [south, 90]]) { const sh = new THREE.Shape(); sh.absarc(0, 0, .98, a0 * D, (a0 + 180) * D, false); sh.lineTo(0, 0); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: len * .9, bevelEnabled: false, curveSegments: 48 }), mat); m.position.z = -len * .45; rotor.add(m); }
    rotor.rotation.z = f.north * D;
    for (const a of [60, 180, 300]) { const h = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .12), hallM); h.position.set(1.12 * Math.cos(a * D), 1.12 * Math.sin(a * D), len / 2 + .06); g.add(h); }
    const fieldM = std('#2c5d8f', .1, .45, '#1e4a7a'), northM = std('#b83232', .1, .5);
    function bold(a, r1, w, mat, z) { const grp = new THREE.Group(); const sh = new THREE.Mesh(new THREE.BoxGeometry(r1 - .32, w, .08), mat); sh.position.x = (r1 - .32) / 2; grp.add(sh);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(w * 1.9, .36, 24), mat); cone.rotation.z = -Math.PI / 2; cone.position.x = r1 - .18; grp.add(cone); grp.rotation.z = a; grp.position.z = z; g.add(grp); }
    bold(f.field * D, 1.62, .13, fieldM, len / 2 + .35); bold(f.north * D, .85, .07, northM, len / 2 + .2);
    label('stator field', [1.95 * Math.cos(f.field * D), 1.95 * Math.sin(f.field * D) + .25, .6], 1.3);
    label(`Hall code ${f.code}`, [-3.3, 1.5, 0], 1.9); label(`driving ${f.plus}+ ${f.minus}−`, [-3.3, .95, 0], 1.9);
    label(`field leads rotor by ${f.lead}°`, [-3.3, .4, 0], 2.7);
  }

  // ---------- gearbox family (Lessons 6.5, 6.6, 8.4) ----------
  // Bevel gear on local +y: back face at y = 0, cone apex at y = r * mate / N. Teeth sit on the pitch cone, simplified to straight wedges.
  function bevelGear(N, mate, m, F, mat, phase = 0, hubMat = mat) {
    const g = new THREE.Group(), r = m * N / 2, apex = r * mate / N, A = Math.hypot(r, apex), dl = Math.atan2(apex, r);
    const k = (A - F) / A, rTop = r * k - m, hgt = F * Math.sin(dl);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(rTop, .05), r - m, hgt, 64), mat); body.position.y = hgt / 2; g.add(body);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .45, r * .45, .3 + m, 40), hubMat); hub.position.y = -(.3 + m) / 2; g.add(hub);
    const s = F / 2, rr = r - s * Math.cos(dl), yy = s * Math.sin(dl), h = 2.1 * m, w = Math.PI * m / 2 * .9 * (rr / r);
    for (let i = 0; i < N; i++) {
      const piv = new THREE.Group(); piv.rotation.y = -(2 * Math.PI * i / N + phase);
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(F, h, w), mat);
      tooth.position.set(rr - .2 * m * Math.sin(dl), yy - .2 * m * Math.cos(dl), 0); tooth.rotation.z = -dl; piv.add(tooth); g.add(piv);
    }
    return { group: g, apex };
  }
  // Point a gear's local +y along a world axis and put its back-face centre at `back`.
  function aim(group, axis, back) {
    const R = { '+x': ['z', -Math.PI / 2], '-x': ['z', Math.PI / 2], '+y': null, '-y': ['x', Math.PI], '+z': ['x', Math.PI / 2], '-z': ['x', -Math.PI / 2] }[axis];
    const holder = new THREE.Group(); holder.add(group); if (R) holder.rotation[R[0]] = R[1]; holder.position.set(...back); root.add(holder); return holder;
  }
  function gearOutline(N, m, ad = .85, phase = 0) {
    const s = new THREE.Shape(), rp = m * N / 2, ra = rp + ad * m, rf = rp - 1.25 * m;
    for (let i = 0; i < N; i++) {
      const a = 2 * Math.PI * i / N + phase, p = 2 * Math.PI / N;
      for (const [f, r] of [[0, rf], [.18, rf], [.32, ra], [.68, ra], [.82, rf]]) { const x = r * Math.cos(a + f * p), y = r * Math.sin(a + f * p); if (i === 0 && f === 0) s.moveTo(x, y); else s.lineTo(x, y); }
    }
    s.closePath(); return s;
  }
  function bevelHypoid(mm) {
    camDist = 12; camHeight = 5.0; camYaw = -.8; lookY = .8;
    const blue = std('#7892be', .15, .62), amber = std('#d6964a', .15, .62), shaftM = std('#c6cbcf', .15, .62), red = std('#c0392b', .15, .62);
    const gear = bevelGear(45, 15, .2, 1.4, blue); root.add(gear.group);
    const d = mm / 10, drop = (Math.hypot(3.6, d) - 3.6) / 3;
    const pin = bevelGear(15, 45, .2, 1.4, amber, Math.PI / 15);
    aim(pin.group, '+x', [-4.5, gear.apex - drop, d]);
    const gs = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 4, 32), shaftM); gs.position.y = 0; root.add(gs);
    const ps = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 5, 32), shaftM); ps.rotation.z = Math.PI / 2; ps.position.set(-6.2, gear.apex - drop, d); root.add(ps);
    line([new THREE.Vector3(0, -2.2, 0), new THREE.Vector3(0, 3.4, 0)], '#3b4650');
    line([new THREE.Vector3(-8.5, gear.apex - drop, d), new THREE.Vector3(1.5, gear.apex - drop, d)], '#c47b26');
    if (d > 0) { const m1 = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, d, 12), red); m1.rotation.x = Math.PI / 2; m1.position.set(0, gear.apex - drop, d / 2); root.add(m1); label(`offset ${mm} mm`, [.4, gear.apex + .7, d / 2], 1.8); }
    else label('shafts meet here', [.4, gear.apex + .7, 0], 2.0);
    label('45-tooth gear', [3.2, -.9, 2.6], 1.8); label('15-tooth pinion', [-4.6, gear.apex + 2.0, d], 2.0);
    label(d > 0 ? 'hypoid' : 'bevel', [0, 4.0, 0], 1.3);
  }
  function wormBackdrive(mu) {
    camDist = 8.6; camHeight = 3.4; camYaw = .35; lookY = .3;
    const w = wormLock(mu), bronze = std('#c48a4a', .15, .62), shaftM = std('#c6cbcf', .15, .62);
    const wormM = std(w.locked ? '#b05050' : '#5f9a6a', .55, .38), coreM = std('#7892be', .15, .62);
    const wheelG = new THREE.Group(); root.add(wheelG); upright(gearOutline(40, .1, .85, 7.5 * Math.PI / 180), .8, 0, bronze, wheelG);
    const ws = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 2.6, 32), shaftM); ws.position.y = .2; root.add(ws);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.675, .675, 3.6, 40), coreM); core.rotation.z = Math.PI / 2; core.position.set(0, .4, 2.8); root.add(core);
    const pts = []; for (let i = 0; i <= 900; i++) { const x = -1.7 + 3.4 * i / 900, a = 2 * Math.PI * x / (Math.PI * .1); pts.push(new THREE.Vector3(x, .4 + .78 * Math.cos(a), 2.8 + .78 * Math.sin(a))); }
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 900, .1, 8, false), wormM));
    const wsh = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 6.4, 32), shaftM); wsh.rotation.z = Math.PI / 2; wsh.position.set(0, .4, 2.8); root.add(wsh);
    arrow([-2.25, 1.2, -.9], [-1.55, 1.2, -1.75], '#c0392b', .3); label('load pushes the wheel back', [-1.0, 2.0, -2.4], 3.0);
    label(w.locked ? 'LOCKED: the wheel cannot turn the worm' : `SLIPS: the wheel drives the worm back (${Math.round(w.backward * 100)} %)`, [0, 2.7, 2.8], 5.6);
    label(`lead angle ${w.lead.toFixed(2)}°, friction angle ${w.friction.toFixed(2)}°`, [0, -.45, 3.6], 4.6);
  }
  function differentialTurn(R) {
    camDist = 15.5; camHeight = 5.2; camYaw = .45; lookY = .6;
    const d = diffTurn(R), blue = std('#7892be', .15, .62), amber = std('#d6964a', .15, .62), green = std('#60a684', .15, .62), dkgreen = std('#408064', .15, .62);
    const shaftM = std('#c6cbcf', .15, .62), tyre = std('#2e3338', .15, .62);
    const side = () => bevelGear(16, 10, .15, .55, blue).group, spider = (ph) => bevelGear(10, 16, .15, .55, amber, ph).group;
    aim(side(), '+x', [-.75, 0, 0]); aim(side(), '-x', [.75, 0, 0]);
    const sp = d.spider * .25; aim(spider(sp), '-z', [0, 0, 1.2]); aim(spider(-sp), '+z', [0, 0, -1.2]);
    const ring = bevelGear(36, 12, .15, .9, green, 0, green); aim(ring.group, '-x', [.75 + ring.apex, 0, 0]);
    const pin = bevelGear(12, 36, .15, .9, dkgreen, Math.PI / 12); aim(pin.group, '+y', [.75, -2.7, 0]);
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 2.9, 20), shaftM); cross.rotation.x = Math.PI / 2; root.add(cross);
    for (const s of [-1, 1]) {
      const ax = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 3.6, 20), shaftM); ax.rotation.z = Math.PI / 2; ax.position.x = s * 2.6; root.add(ax);
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, .5, 48), tyre); wh.rotation.z = Math.PI / 2; wh.position.x = s * 4.4; root.add(wh);
      const v = s < 0 ? d.inner : d.outer; const bar = new THREE.Mesh(new THREE.BoxGeometry(.5, .2 * v, .5), std(s < 0 ? '#c47b26' : '#2c5d8f', .15, .62)); bar.position.set(s * 4.4, 1.2 + .1 * v, 0); root.add(bar);
      label(`${s < 0 ? 'inner' : 'outer'} wheel ${v.toFixed(2)} rad/s`, [s * 4.4, 1.6 + .2 * v, 0], 3.6);
    }
    label(`carrier ${d.carrier.toFixed(1)} rad/s (the average)`, [0, 4.4, 0], 4.4);
    label(`spiders spin ${d.spider.toFixed(2)} rad/s`, [0, -2.2, 2.2], 3.6);
  }
  function rvTwoStage(inputDeg) {
    camDist = 21; camHeight = 8.0; camYaw = .75; lookY = -1.0;
    const D = Math.PI / 180, a = rvAngles(inputDeg), e = .1, R = 5.0, rr = .2, RC = 2.8, CR = [90, 210, 330].map(x => x * D);
    const grey = std('#969ca6', .15, .62), pinM = std('#c8cbd2', .15, .62), amber = std('#d6964a', .15, .62), blue = std('#5c7ab2', .15, .62);
    const dkblue = std('#3e5c9c', .15, .62), green = std('#60a684', .15, .62), camM = std('#7892be', .15, .62), shaftM = std('#c6cbcf', .15, .62), red = std('#c0392b', .15, .62);
    const out = a.output * D, yG = 4.4, yCT = 2.2, yA = 0, yB = -2.2, yCB = -4.4, yH = -6.8;
    const housing = new THREE.Group(); root.add(housing); upright(ring(R, R + .9), .9, 0, grey, housing); housing.position.y = yH;
    for (let k = 0; k < RV.pins; k++) { const t = 2 * Math.PI * k / RV.pins; const p = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 1.5, 16), pinM); p.position.set(R * Math.cos(t), yH + .6, -R * Math.sin(t)); root.add(p); }
    const prof = new THREE.Shape(), N = 1600, n = RV.pins;
    for (let i = 0; i <= N; i++) {
      const t = 2 * Math.PI * i / N, qx = R * Math.cos(t) - e * Math.cos(n * t), qy = R * Math.sin(t) - e * Math.sin(n * t);
      const dx = -R * Math.sin(t) + n * e * Math.sin(n * t), dy = R * Math.cos(t) - n * e * Math.cos(n * t), L = Math.hypot(dx, dy);
      const x = qx - rr * dy / L, y = qy + rr * dx / L; if (i === 0) prof.moveTo(x, y); else prof.lineTo(x, y);
    }
    const holes = () => { const hs = [new THREE.Path().absarc(0, 0, .9 + e, 0, 2 * Math.PI, true)];
      for (const c of CR) { hs.push(new THREE.Path().absarc(RC * Math.cos(c), RC * Math.sin(c), .65, 0, 2 * Math.PI, true)); hs.push(new THREE.Path().absarc(RC * Math.cos(c + Math.PI / 3), RC * Math.sin(c + Math.PI / 3), .5 + e, 0, 2 * Math.PI, true)); }
      return hs; };
    for (const [y0, sgn, clock] of [[yA, 1, 0], [yB, -1, Math.PI / (RV.pins - 1)]]) {
      const g = new THREE.Group(); root.add(g); const sh = prof.clone(); sh.holes = holes();
      const m = upright(sh, .5, 0, amber, g); m.rotation.y = clock;
      const ecc = a.eccentric * D + (sgn < 0 ? Math.PI : 0);
      g.position.set(sgn * 0 + e * Math.cos(ecc), y0, -e * Math.sin(ecc)); g.rotation.y = out;
      const ptr = new THREE.Mesh(new THREE.BoxGeometry(1.6, .08, .12), red); ptr.position.set(.8 * Math.cos(ecc), y0 + .6, -.8 * Math.sin(ecc)); ptr.rotation.y = ecc; root.add(ptr);
    }
    for (const yp of [yCT, yCB]) { const g = new THREE.Group(); root.add(g); const s = new THREE.Shape(); s.absarc(0, 0, 4.2, 0, 2 * Math.PI, false); s.holes = [new THREE.Path().absarc(0, 0, .9, 0, 2 * Math.PI, true), ...CR.map(c => new THREE.Path().absarc(RC * Math.cos(c), RC * Math.sin(c), .36, 0, 2 * Math.PI, true))]; upright(s, .4, 0, green, g); g.position.y = yp; g.rotation.y = out;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(.9, .14, .3), red); flag.position.set(4.3 * Math.cos(out), yp + .3, -4.3 * Math.sin(out)); flag.rotation.y = out; root.add(flag); }
    for (const c of CR) {
      const t = c + out, x = RC * Math.cos(t), z = -RC * Math.sin(t);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, yG - yCB + .9, 20), shaftM); sh.position.set(x, (yG + yCB) / 2, z); root.add(sh);
      for (const [y0, sgn] of [[yA, 1], [yB, -1]]) { const ecc = a.eccentric * D + (sgn < 0 ? Math.PI : 0); const cam = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, .5, 32), camM); cam.position.set(x + e * Math.cos(ecc), y0 + .25, z - e * Math.sin(ecc)); root.add(cam); }
      const gg = new THREE.Group(); upright(gearOutline(36, 7 / 60, 1, 0), .5, 0, blue, gg); gg.position.set(x, yG, z); gg.rotation.y = (a.output + a.crank) * D; root.add(gg);
      const mk = new THREE.Mesh(new THREE.BoxGeometry(1.0, .06, .1), red); mk.position.set(x + .5 * Math.cos((a.output + a.crank) * D), yG + .55, z - .5 * Math.sin((a.output + a.crank) * D)); mk.rotation.y = (a.output + a.crank) * D; root.add(mk);
    }
    const pg = new THREE.Group(); upright(gearOutline(12, 7 / 60, 1, 15 * D), .5, 0, dkblue, pg); pg.position.y = yG; pg.rotation.y = inputDeg * D; root.add(pg);
    const ish = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 2.6, 24), shaftM); ish.position.y = yG + 1.3; root.add(ish);
    label(`input ${inputDeg}°`, [0, yG + 2.9, 0], 2.4); label(`cranks ${Math.abs(a.crank).toFixed(0)}° the other way`, [7.6, yG + .4, 0], 4.6);
    label('discs wobble with the cranks', [8.0, (yA + yB) / 2, 0], 4.6); label(`output carrier ${a.output.toFixed(2)}°`, [7.8, yCB, 0], 4.4); label('40 fixed pins', [7.2, yH + .7, 0], 3.0);
  }

  function update(value, view = 0) {
    clear(); while (materials.length > BASE) { const m = materials.pop(); m.map?.dispose(); m.dispose(); }
    angle = view * Math.PI / 180; camDist = 7; camHeight = 4.5; camYaw = .65; lookY = 0; place();
    if (id === 'lathe-motion') latheMotion(value);
    else if (id === 'milling-motion') millingMotion(value);
    else if (id === 'milling-index') millingIndex(value);
    else if (id === 'lathe-thread') latheThread(value);
    else if (id === 'milling-workholding') millingWorkholding(value);
    else if (id === 'lathe-taper') latheTaper(value);
    else if (id === 'tool-geometry') toolGeometry(value, view);
    else if (id === 'srm-exploded') srmExploded(value);
    else if (id === 'srm-rotation') srmRotation(value);
    else if (id === 'srm-gap') srmGap(value);
    else if (id === 'axial-exploded') axialExploded(value);
    else if (id === 'bldc-rotating-field') bldcRotatingField(value);
    else if (id === 'bevel-hypoid') bevelHypoid(value);
    else if (id === 'worm-backdrive') wormBackdrive(value);
    else if (id === 'differential-turn') differentialTurn(value);
    else if (id === 'rv-two-stage') rvTwoStage(value);
    resize();
  }
  return { update, dispose() { observer.disconnect(); visible.disconnect(); document.removeEventListener('visibilitychange', shown); clear(); materials.forEach(m => { m.map?.dispose(); m.dispose(); }); renderer.dispose(); envTex?.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); } };
}
