// Cabins as the owner's glass-run plans show them (9 Nov 2026), furnished like Cabin 101's handover photos:
// pine-top desks on black steel legs against the walls, two black mesh chairs per 6 ft desk, a brown wardrobe wall, dark carpet.
// Plan points are pixels on the owner's drawings; `toModel` maps them onto the R03/R06 models (fitted to room bounds, ±0.4 m).

const plans = {
  'ground-floor': {
    toModel: ([px, py]) => [0.0101 * px - 7.963, 0.0101 * py - 7.974],
    hide: ['GF01 A P01 |'],
    runs: [
      { id: 'G1', room: 'GF-08', glass: [[[1165, 1065], [1285, 1065], [1285, 1120], [1580, 1120], [1580, 1062], [1610, 1062]], [[1692, 1062], [1692, 960]]], doors: [['D-03', [1610, 1062], [1692, 1062]]] },
      { id: 'G2', room: 'GF-09', glass: [[[740, 410], [748, 432], [1017, 432], [1090, 322]]], doors: [['D-02', [683, 322], [740, 410]]] },
      { id: 'G3', room: 'GF-01', glass: [[[1230, 537], [1368, 537]], [[1450, 537], [1590, 537], [1590, 447]]], doors: [['D-01', [1368, 537], [1450, 537]]] },
      { id: 'D-04', room: 'GF-10', glass: [], doors: [['D-04', [417, 773], [417, 865]]] },
    ],
    cabins: { C01: { room: 'GF-01', outline: [[1236, 545], [1680, 545], [1680, 815], [1236, 815]] } },
  },
  'first-floor': {
    toModel: ([px, py]) => [0.0100 * px - 9.130, 0.00979 * py - 6.893],
    // FF02 C0x is an older glass-box study for FF-02; the owner's F4 run replaces it (its lab furniture stays).
    hide: ['FF03 P01 |', 'FF04 FF06 P01 |', 'FF02 C0'],
    runs: [
      { id: 'F1', room: 'FF-06', glass: [[[1470, 360], [1470, 475]], [[1470, 555], [1470, 845]]], doors: [['D-05', [1470, 475], [1470, 555]]] },
      { id: 'F2', room: 'FF-04', glass: [[[845, 422], [1183, 422], [1183, 770], [758, 770], [758, 690]]], doors: [['D-06', [765, 422], [845, 422]]] },
      { id: 'F3', room: 'FF-03', glass: [[[565, 262], [565, 350]], [[648, 350], [738, 350]]], doors: [['D-07', [570, 350], [648, 350]]] },
      { id: 'F4', room: 'FF-02', glass: [[[243, 692], [95, 692], [95, 993], [208, 993], [250, 1100], [315, 1190], [448, 1190]]], doors: [['D-08', [448, 1190], [532, 1190]]] },
    ],
    cabins: {
      C02: { room: 'FF-03', outline: [[262, 140], [410, 140], [410, 262], [560, 262], [560, 355], [735, 355], [735, 600], [530, 600], [530, 660], [330, 660], [330, 355], [262, 355]] },
      C03: { room: 'FF-04', outline: [[766, 428], [1178, 428], [1178, 765], [766, 765]] },
      C04: { room: 'FF-06', outline: [[1478, 365], [1800, 365], [1865, 425], [1865, 640], [1825, 712], [1825, 840], [1478, 840]] },
    },
  },
};

export const cabinRoomCodes = floor => Object.keys(plans[floor]?.cabins ?? {});

const DESK = { length: 1.83, depth: 0.45, height: 0.75, inset: 0.06, chairZone: 0.65 };
const colours = { pine: '#d9a35e', steel: '#1d1f21', mesh: '#2a2c2f', wardrobe: '#a8652f', carpet: '#4b4f55', glass: '#4f97e0', door: '#d9861c' };
const edgeColours = { selected: '#e8892b', available: '#f4f7f1', occupied: '#9aa09a', coming_soon: '#c9d4e4' };

function inside([x, z], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

// Desk spots along each wall, longest walls first, clear of doors and of each other.
function layout(poly, seats, doors, wardrobeFirst) {
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [-d[1], d[0]];
    const mid = [(a[0] + b[0]) / 2 + n[0] * 0.3, (a[1] + b[1]) / 2 + n[1] * 0.3];
    if (!inside(mid, poly)) n = [-n[0], -n[1]];
    return { a, d, n, len };
  }).sort((p, q) => q.len - p.len);
  const zones = [], desks = [], at = (e, t, s) => [e.a[0] + e.d[0] * t + e.n[0] * s, e.a[1] + e.d[1] * t + e.n[1] * s];
  const clear = corners => corners.every(c => inside(c, poly))
    && doors.every(([, p]) => clearOf(p, corners, 0.85))
    && zones.every(z => !overlaps(z, corners));
  // The wardrobe wall goes in first, on the shortest wall that takes it, as in Cabin 101.
  const wardrobe = wardrobeFirst && edges.filter(e => e.len >= 2).reverse().map(e => {
    for (let t = 0.1; t + 1.8 <= e.len - 0.1; t += 0.1) {
      const width = Math.min(2.4, e.len - 0.1 - t), corners = [at(e, t, 0.02), at(e, t + width, 0.02), at(e, t + width, 0.62), at(e, t, 0.62)];
      if (clear(corners)) return { e, t, width };
    }
    return null;
  }).find(Boolean);
  if (wardrobe) zones.push([at(wardrobe.e, wardrobe.t, 0.02), at(wardrobe.e, wardrobe.t + wardrobe.width, 0.02), at(wardrobe.e, wardrobe.t + wardrobe.width, 0.62), at(wardrobe.e, wardrobe.t, 0.62)]);
  const want = Math.ceil(seats / 2);
  // A desk can also stand in front of the wardrobe, as in Cabin 101's first photo.
  const offsets = e => wardrobe && wardrobe.e === e ? [0, 0.62] : [0];
  for (const e of edges) for (let t = 0.05; t + DESK.length <= e.len - 0.05 && desks.length < want; t += 0.05) {
    const reach = DESK.inset + DESK.depth + DESK.chairZone;
    const off = offsets(e).find(o => clear([at(e, t, o + 0.02), at(e, t + DESK.length, o + 0.02), at(e, t + DESK.length, o + reach), at(e, t, o + reach)]));
    if (off === undefined) continue;
    zones.push([at(e, t, off + 0.02), at(e, t + DESK.length, off + 0.02), at(e, t + DESK.length, off + reach), at(e, t, off + reach)]);
    desks.push({ e, t, off }); t += DESK.length + 0.05;
  }
  // Two chairs a desk as in Cabin 101; a third goes on where the room has fewer desk spots than that needs.
  const per = Math.min(3, Math.ceil(seats / Math.max(1, desks.length)));
  desks.forEach((desk, i) => { desk.chairs = Math.max(0, Math.min(per, seats - i * per)); });
  const seated = desks.reduce((n, d) => n + d.chairs, 0);
  if (wardrobeFirst) { const other = layout(poly, seats, doors, false); if (other.seated > seated) return other; }
  return { desks, wardrobe: wardrobe || null, at, seated };
}

// True when point p is at least `gap` metres from the rectangle.
function clearOf(p, rect, gap) {
  if (inside(p, rect)) return false;
  return rect.every((a, i) => {
    const b = rect[(i + 1) % rect.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) >= gap;
  });
}

function overlaps(p, q) {
  for (const poly of [p, q]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ax = [b[1] - a[1], a[0] - b[0]];
    const proj = s => s.map(([x, z]) => x * ax[0] + z * ax[1]);
    const pp = proj(p), qq = proj(q);
    if (Math.max(...pp) <= Math.min(...qq) + 1e-3 || Math.max(...qq) <= Math.min(...pp) + 1e-3) return false;
  }
  return true;
}

export function buildCabinRooms(root, floor, THREE, cabins) {
  const plan = plans[floor];
  const group = new THREE.Group(); group.name = 'Cabin rooms (owner plan 2026-11-09)';
  const nameOf = o => o.userData?.sourceName || o.name || '';
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const hidden = meshes.filter(o => plan.hide.some(p => nameOf(o).startsWith(p)) && !/stair|\| Furniture \|/i.test(nameOf(o)));
  hidden.forEach(o => { o.visible = false; });
  const floorY = room => { const m = meshes.find(o => nameOf(o).startsWith(`${room} | floor`)); return m ? new THREE.Box3().setFromObject(m).max.y : 0; };
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const m = { pine: mat(colours.pine, { roughness: 0.45 }), steel: mat(colours.steel, { metalness: 0.4 }), mesh: mat(colours.mesh), wardrobe: mat(colours.wardrobe, { roughness: 0.6 }),
    carpet: mat(colours.carpet, { roughness: 1 }), glass: mat(colours.glass, { transparent: true, opacity: 0.32, depthWrite: false }), glassLine: mat(colours.glass),
    door: mat(colours.door, { transparent: true, opacity: 0.55, depthWrite: false }), doorLine: mat(colours.door) };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const box = (material, [x, z], y, sx, sy, sz, angle, parent = group) => {
    const b = new THREE.Mesh(unit, material); b.scale.set(sx, sy, sz); b.position.set(x, y + sy / 2, z); b.rotation.y = angle; parent.add(b); return b;
  };
  const wall = ([a, b], y, material, line, height) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), angle = -Math.atan2(b[1] - a[1], b[0] - a[0]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    box(material, mid, y, len, height, 0.05, angle); box(line, mid, y + 0.015, len, 0.02, 0.12, angle);
  };
  for (const run of plan.runs) {
    const y = floorY(run.room);
    for (const path of run.glass) for (let i = 0; i + 1 < path.length; i++) wall([plan.toModel(path[i]), plan.toModel(path[i + 1])], y, m.glass, m.glassLine, 2.4);
    for (const [, a, b] of run.doors) wall([plan.toModel(a), plan.toModel(b)], y, m.door, m.doorLine, 2.1);
  }
  const doorPoints = plan.runs.flatMap(r => r.doors.map(([id, a, b]) => { const p = plan.toModel(a), q = plan.toModel(b); return [id, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]]; }));
  const result = [];
  for (const cabin of cabins) {
    const spec = plan.cabins[cabin.code]; if (!spec) continue;
    const poly = spec.outline.map(plan.toModel), y = floorY(spec.room);
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const carpet = new THREE.Mesh(new THREE.ShapeGeometry(shape), m.carpet); carpet.rotation.x = -Math.PI / 2; carpet.position.y = y + 0.012; carpet.name = `${cabin.code} carpet`; group.add(carpet);
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: edgeColours[cabin.status] ?? edgeColours.available });
    poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      box(edgeMaterial, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], y + 0.02, len + 0.1, 0.02, 0.1, -Math.atan2(b[1] - a[1], b[0] - a[0])); });
    const { desks, wardrobe, at } = layout(poly, cabin.seats, doorPoints, true);
    for (const { e, t, off, chairs } of desks) {
      const angle = -Math.atan2(e.d[1], e.d[0]), s = off + DESK.inset + DESK.depth / 2;
      box(m.pine, at(e, t + DESK.length / 2, s), y + DESK.height - 0.04, DESK.length, 0.04, DESK.depth, angle);
      for (const lt of [0.06, DESK.length - 0.06]) box(m.steel, at(e, t + lt, s), y, 0.05, DESK.height - 0.04, DESK.depth - 0.04, angle);
      box(m.steel, at(e, t + DESK.length / 2, off + DESK.inset + 0.04), y + 0.25, DESK.length - 0.1, 0.04, 0.04, angle);
      for (let c = 0; c < chairs; c++) {
        const ct = t + DESK.length * (c + 0.5) / Math.max(2, chairs), seat = off + DESK.inset + DESK.depth + 0.22;
        box(m.mesh, at(e, ct, seat), y + 0.44, 0.48, 0.06, 0.46, angle);
        box(m.mesh, at(e, ct, seat + 0.25), y + 0.5, 0.46, 0.55, 0.05, angle);
        box(m.steel, at(e, ct, seat), y, 0.06, 0.44, 0.06, angle);
      }
    }
    if (wardrobe) box(m.wardrobe, at(wardrobe.e, wardrobe.t + wardrobe.width / 2, 0.32), y, wardrobe.width, 2.4, 0.6, -Math.atan2(wardrobe.e.d[1], wardrobe.e.d[0]));
    const bounds = new THREE.Box3(); poly.forEach(([x, z]) => bounds.expandByPoint(new THREE.Vector3(x, y, z)));
    const center = [poly.reduce((s, p) => s + p[0], 0) / poly.length, y + 0.1, poly.reduce((s, p) => s + p[1], 0) / poly.length];
    result.push({ id: cabin.code, roomId: spec.room, center: inside([center[0], center[2]], poly) ? center : [bounds.getCenter(new THREE.Vector3()).x, y + 0.1, bounds.getCenter(new THREE.Vector3()).z],
      bounds, edgeMaterial, desks: desks.length, chairs: desks.reduce((s, d) => s + d.chairs, 0), wardrobe: !!wardrobe });
  }
  root.add(group);
  return { cabins: result, hidden: hidden.length, group,
    select(id) { result.forEach(c => c.edgeMaterial.color.set(c.id === id ? edgeColours.selected : edgeColours[cabins.find(x => x.code === c.id)?.status] ?? edgeColours.available)); } };
}
