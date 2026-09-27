const nameOf = object => object.userData?.sourceName || object.name || '';

const configurations = [
  { id: 'C01', roomId: 'GF-01', floor: 'ground-floor', prefix: 'GF01 A P01', token: 'GF01',
    positions: [[1, 0, 0.10], [1, 0, -0.74], [1, 0, -1.58], [3, 0, 0.10], [3, 0, -0.74], [3, 0, -1.58]],
    caveats: ['Six places replace the previous four-place study. Rear seats sit beside the retained entry recess; occupied-chair movement and simultaneous access need review.'] },
  { id: 'C02', roomId: 'FF-03', floor: 'first-floor', prefix: 'FF03 P01', token: 'FF03',
    positions: [[1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0], [5, 0, 0], [6, 0, 0]],
    caveats: ['The former two- and four-place arrangements retain six chairs. The shared bathroom and cross-route remain outside any exclusive-use promise; a complete lockable six-person boundary is unresolved.'] },
  { id: 'C03', roomId: 'FF-04', floor: 'first-floor', prefix: 'FF04 FF06 P01', token: 'FF04',
    positions: [[1, 0, 0], [2, 0, 0], [3, 0.38, 0], [5, 0, 0], [6, 0, 0], [7, 0.38, 0]],
    caveats: ['Six chairs replace eight; the two centre-facing proposed dividers are removed. The central connection remains a shared route; exclusive cabin enclosure and occupied circulation are not verified.'] },
  { id: 'C04', roomId: 'FF-06', floor: 'first-floor', prefix: 'FF04 FF06 P01', token: 'FF06',
    positions: [[1, -0.10, 0], [2, 0.10, 0], [3, 0, 0], [5, 0, 0], [6, 0.35, 0], [8, 0, 0]],
    caveats: ['Six chairs replace eight and the proposed cross-divider is removed. Existing cupboard, dresser, rear-room route and balcony access stay in place; occupied clearance needs review.'] },
];

function removedDivider(name, token) {
  if (token === 'FF03') return name.startsWith('FF03 P01 | C2 south ') || name.startsWith('FF03 P01 | C4 north ');
  if (token === 'FF04') return /^FF04 FF06 P01 \| FF04 cabin enclosure (1|8) /.test(name);
  if (token === 'FF06') return name.startsWith('FF04 FF06 P01 | FF06 enclosure 0 ');
  return false;
}

export function reconcileCabins(root, floor, THREE) {
  const started = performance.now();
  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse(object => { if (object.isMesh) meshes.push(object); });
  const box = object => new THREE.Box3().setFromObject(object);
  const cabins = [];
  const removedSourceNames = [];
  for (const config of configurations.filter(item => item.floor === floor)) {
    const furniture = meshes.filter(object => nameOf(object).startsWith(config.prefix + ' | ')
      && new RegExp(`\\| ${config.token}-[TC]\\d{2} \\|`).test(nameOf(object)));
    if (!furniture.length) throw new Error(`Missing source furniture for ${config.roomId}`);
    const group = new THREE.Group();
    group.name = `Booking study ${config.id} ${config.roomId}`;
    group.userData.bookingStudy = true;
    const chairs = [], tables = [], furnitureBounds = new THREE.Box3();
    for (const [index, dx, dz] of config.positions) {
      const code = String(index).padStart(2, '0');
      const tableParts = furniture.filter(object => nameOf(object).includes(`| ${config.token}-T${code} |`));
      const chairSource = furniture.find(object => nameOf(object).includes(`| ${config.token}-C${code} |`) && nameOf(object).includes('chair_placeholder'));
      if (!chairSource || !tableParts.length) throw new Error(`Missing source chair/table ${config.token}-${code}`);
      const table = new THREE.Group();
      table.name = `${config.id} table ${chairs.length + 1}`;
      for (const part of tableParts) { const copy = part.clone(); copy.visible = true; table.add(copy); }
      table.position.set(dx, 0, dz);
      const chair = chairSource.clone();
      chair.visible = true;
      chair.position.x += dx; chair.position.z += dz;
      chair.name = `${config.id} chair ${chairs.length + 1}`;
      chair.userData = { ...chairSource.userData, cabinId: config.id, bookingChair: true };
      group.add(table, chair);
      tables.push(table); chairs.push({ object: chair });
    }
    furniture.forEach(object => { object.visible = false; });
    for (const mesh of meshes) if (removedDivider(nameOf(mesh), config.token)) {
      mesh.visible = false; removedSourceNames.push(nameOf(mesh));
    }
    root.add(group); root.updateMatrixWorld(true);
    const tableBoxes = tables.map(box), chairBoxes = chairs.map(item => box(item.object));
    tableBoxes.forEach(bounds => furnitureBounds.union(bounds));
    chairBoxes.forEach((bounds, index) => {
      furnitureBounds.union(bounds); chairs[index].center = bounds.getCenter(new THREE.Vector3()).toArray();
      chairs[index].bounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
    });
    const overlaps = [];
    for (let a = 0; a < tableBoxes.length; a++) for (let b = a + 1; b < tableBoxes.length; b++) {
      const overlap = tableBoxes[a].clone().intersect(tableBoxes[b]);
      if (!overlap.isEmpty() && overlap.max.x - overlap.min.x > 0.005 && overlap.max.z - overlap.min.z > 0.005) overlaps.push([a + 1, b + 1]);
    }
    const floorMesh = meshes.find(object => nameOf(object).startsWith(`${config.roomId} | floor`));
    const outsideFloorCorners = [];
    if (floorMesh) {
      const ray = new THREE.Raycaster();
      [...tableBoxes, ...chairBoxes].forEach((bounds, index) => {
        for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
          ray.set(new THREE.Vector3(x, bounds.max.y + 1, z), new THREE.Vector3(0, -1, 0));
          if (!ray.intersectObject(floorMesh, false).length) outsideFloorCorners.push({ furniture: index < 6 ? 'table' : 'chair', index: index % 6 + 1, x, z });
        }
      });
    }
    let minimumChairGapMetres = Infinity;
    for (let a = 0; a < chairBoxes.length; a++) for (let b = a + 1; b < chairBoxes.length; b++) {
      const left = chairBoxes[a], right = chairBoxes[b];
      minimumChairGapMetres = Math.min(minimumChairGapMetres, Math.hypot(
        Math.max(0, left.min.x - right.max.x, right.min.x - left.max.x),
        Math.max(0, left.min.z - right.max.z, right.min.z - left.max.z)));
    }
    const nearbyDoorIntersections = [];
    const physicalBoxes = [...tableBoxes, ...chairBoxes];
    for (const object of meshes.filter(item => item.visible && /door.*leaf|leaf.*door/i.test(nameOf(item)))) {
      const bounds = box(object);
      if (physicalBoxes.some(candidate => candidate.intersectsBox(bounds))) nearbyDoorIntersections.push(nameOf(object));
    }
    cabins.push({ id: config.id, roomId: config.roomId, center: furnitureBounds.getCenter(new THREE.Vector3()).toArray(),
      bounds: { min: furnitureBounds.min.toArray(), max: furnitureBounds.max.toArray() }, chairs,
      caveats: config.caveats, audit: { tableOverlaps: overlaps, doorBoundingBoxIntersections: nearbyDoorIntersections, floorFootprintTest: floorMesh ? 'corner-rays' : 'unavailable', outsideFloorCorners, minimumChairGapMetres,
        capacityStatus: 'Study only: six placed chairs are not verified usable capacity.', outerWallsChanged: false } });
  }
  return { cabins, removedSourceNames, elapsedMs: performance.now() - started,
    caveats: ['Provisional four-cabin study derived from R06/R03. Retained shared routes are not private cabin area. No new walls or certified clearances.'] };
}
