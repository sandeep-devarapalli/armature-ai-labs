import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { check, expectedExternalDownloads, expectedRetainedAssets, hash, json, previousAsset, previousRelease, previousReleaseSha256, previousRoot, publicPath, retainedRoomsUrl, verifyBytes } from "./building-vision/release-assets.mjs";

// R06 glass enclosure gate. Previous assets are immutable; each new native, render and
// FF02 extract must match reviewed provenance and independently accepted pins.
const validHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const configPath = "src/data/buildingModelRelease.json";
const config = json(configPath);
check(config.revision === "r06" && config.label === "R06" && config.root === "/building-models/r06", "Active building release configuration mismatch");
const root = resolve("public" + config.root);
function local(file) {
  const path = resolve(root, file);
  check(path.startsWith(root + "/"), "Manifest path escapes R06");
  return path;
}
const manifest = json(local("release.json"));
const pins = json("scripts/building-vision/r06-accepted-pins.json");
const previous = previousRelease();
const exportAudit = json(local("manifest.json"));
check(manifest.release === "R06" && manifest.releaseConfigSha256 === hash(readFileSync(configPath)), "Frontend release configuration drift");
check(manifest.retainedRelease.url === previousRoot + "/release.json" && manifest.retainedRelease.sha256 === previousReleaseSha256, "Retained release attribution drift");
check(manifest.serviceRevision === "S02", "Service revision must point at the published S02 plan");
check(JSON.stringify(manifest.retainedAssets) === JSON.stringify(expectedRetainedAssets(previous)), "Missing, extra or modified retained asset");
check(JSON.stringify(manifest.externalDownloads) === JSON.stringify(expectedExternalDownloads(previous, exportAudit.downloads)), "External download drift");
for (const asset of manifest.retainedAssets) verifyBytes(publicPath(asset.url), asset);
for (const [file, expected] of Object.entries(pins.evidence)) check(validHash(expected) && hash(readFileSync(local(file))) === expected, "Accepted evidence drift: " + file);
for (const file of ["blender-metadata-provenance.json", "cad-metadata-provenance.json", "native-preview-provenance.json", "design-verification.json", "manifest.json", "rooms/manifest.json"]) check(validHash(pins.evidence[file]), "Missing independently accepted evidence pin: " + file);
const allAssets = [...manifest.files.map((asset) => ({ ...asset, url: config.root + "/" + asset.path })), ...manifest.retainedAssets, ...manifest.externalDownloads];
check(new Set(allAssets.map((asset) => asset.url)).size === allAssets.length, "Duplicate release asset URL");
function registered(url) {
  const asset = allAssets.find((entry) => entry.url === url);
  check(asset, "Unregistered frontend asset: " + url);
  return asset;
}

// New native Blender, FF02 and coordinated first-floor CAD; ground CAD is retained.
const blenderCopies = json(local("blender-metadata-provenance.json")).files;
const cadCopies = json(local("cad-metadata-provenance.json")).files;
const blender = blenderCopies.filter((copy) => copy.file === "selected-layout.blend");
check(blender.length === 1, "Missing/duplicate Blender curation record");
{
  const copy = blender[0], c = copy.curation, pin = pins.native["selected-layout.blend"];
  check(validHash(pin?.sourceSha256) && copy.sourceSha256 === pin.sourceSha256 && copy.publicSha256 === pin.publicSha256 && copy.sourceSha256 === copy.publicSha256 &&
    copy.serializedPrivatePathScan === "PASS" && copy.nativeSaveReopen === "PASS" && copy.transformationKind === "verified-current-design-copy" &&
    copy.previousReleaseSourceSha256 === pins.previousSourceNativeSha256, "Blender native curation not accepted");
  check(c?.retainedGeometryUnchanged === true && c.materialsUnchanged === true && c.selectedMembershipVerified === true && c.reviewViewsVerified === true &&
    validHash(c.selectedAllowlistSha256) && validHash(c.privateAuditSha256) && Array.isArray(c.displayChanges) && Array.isArray(c.dependencyDisclosure), "Incomplete Blender curation evidence");
  check(JSON.stringify({ retainedObjectCount: copy.geometryRevision.retainedObjectCount, replacedObjectCount: copy.geometryRevision.replacedObjectCount, addedObjectCount: copy.geometryRevision.addedObjectCount, movedObjectCount: copy.geometryRevision.movedObjectCount }) === JSON.stringify(pins.geometryRevision) &&
    copy.geometryRevision.retainedGeometryMaterialsUVAndPlacementsUnchanged === true, "Blender geometry revision drift");
  const url = config.downloads.blender.url, asset = registered(url);
  check(url === config.root + "/selected-layout.blend" && asset.bytes === copy.publicBytes && asset.sha256 === copy.publicSha256, "Blender public byte attribution drift");
  const download = exportAudit.downloads.find((entry) => entry.file === "selected-layout.blend");
  check(download?.url === url && download.bytes === asset.bytes && download.sha256 === asset.sha256 && download.sourceSha256 === pin.sourceSha256 &&
    download.serializedPrivatePathScan === "PASS" && download.exactNativeCopy === true && download.transformationKind === copy.transformationKind, "Blender export provenance drift");
}
{
  const copy = cadCopies.find((entry) => entry.file === "ff02-enclosure.FCStd"), pin = pins.native["ff02-enclosure.FCStd"];
  check(copy && validHash(pin?.publicSha256) && copy.sourceSha256 === pin.sourceSha256 && copy.publicSha256 === pin.publicSha256 && copy.sourceSha256 === copy.publicSha256 &&
    copy.nativeSaveReopen === "PASS" && copy.serializedPrivatePathScan === "PASS" && copy.invalidShapes === 0 && copy.solids > 0, "Enclosure CAD curation not accepted");
  const step = cadCopies.find((entry) => entry.file === "ff02-enclosure.step");
  check(step && step.serializedPrivatePathScan === "PASS" && step.header === "ISO-10303", "Enclosure STEP record missing");
  for (const [key, file, record] of [["freecad", "ff02-enclosure.FCStd", copy], ["step", "ff02-enclosure.step", step]]) {
    const asset = registered(config.enclosure[key]);
    check(config.enclosure[key] === config.root + "/" + file && asset.bytes === record.publicBytes && asset.sha256 === record.publicSha256, "Enclosure download attribution drift: " + file);
    const download = exportAudit.downloads.find((entry) => entry.file === file);
    check(download?.url === config.enclosure[key] && download.sha256 === asset.sha256 && download.bytes === asset.bytes, "Enclosure export record drift: " + file);
  }
  check(config.enclosure.roomId === "FF-02" && config.enclosure.revision === "C04", "Enclosure scope drift");
}
{
  const old = json(publicPath(previousRoot + "/manifest.json"));
  for (const [file, key] of [["ground-floor.FCStd", "groundCad"]]) {
    const url = config.downloads[key].url, retained = previousAsset(url, previous), download = exportAudit.downloads.find((entry) => entry.file === file);
    const before = old.downloads.find((entry) => entry.file === file);
    check(download?.url === url && before?.url === url && download.sha256 === retained.sha256 && download.bytes === retained.bytes && download.sourceSha256 === before.sourceSha256, "Retained full-floor CAD drift: " + file);
    check(url === "/building-models/r03/ground-floor.FCStd" && download.retainedFrom?.release === "R03", "Ground CAD must retain its R03 URL");
  }
  const copy = cadCopies.find((entry) => entry.file === "first-floor.FCStd"), pin = pins.native["first-floor.FCStd"];
  check(copy && validHash(pin?.publicSha256) && copy.sourceSha256 === pin.sourceSha256 && copy.publicSha256 === pin.publicSha256 && copy.sourceSha256 === copy.publicSha256 &&
    copy.sourceBlenderSha256 === pins.native["selected-layout.blend"].publicSha256 && copy.nativeSaveReopen === "PASS" && copy.serializedPrivatePathScan === "PASS" && copy.invalidShapes === 0 && copy.solids > 0, "Coordinated full-floor CAD curation not accepted");
  const download = exportAudit.downloads.find((entry) => entry.file === "first-floor.FCStd"), asset = registered(config.downloads.firstCad.url);
  check(download?.url === config.downloads.firstCad.url && download.sourceSha256 === pin.sourceSha256 && download.sha256 === copy.publicSha256 && download.bytes === copy.publicBytes &&
    asset.sha256 === copy.publicSha256 && asset.bytes === copy.publicBytes && asset.sourceRelease === "R06" && !download.retainedFrom, "Coordinated full-floor CAD download drift");
}

// Browser export audit: unchanged ground floor, first floor exported from the saved C04 design.
check(exportAudit.release === "Coordinated Selected Layout R06" && exportAudit.status === "PASS_GEOMETRY_REIMPORT_AND_EXACT_COPY_CHECKS" &&
  exportAudit.sourceNativeSha256 === pins.native["selected-layout.blend"].publicSha256 && exportAudit.previousSourceNativeSha256 === pins.previousSourceNativeSha256 &&
  exportAudit.sourcePreserved === true && exportAudit.currentDesignOnly === true && exportAudit.ff03EntranceRevision === "P02" && exportAudit.ff02EnclosureRevision === "C04", "Wrong current Blender source");
check(exportAudit.verification.freshReimport === true && exportAudit.verification.physicalObjectAndRawGlbTriangleCountsMatch === true && exportAudit.verification.nativeDownloadHashesMatch === true, "GLB source/reimport gate missing");
check(exportAudit.floors.length === 2 && exportAudit.downloads.length === 5, "Expected two floors and five download records");
for (const id of ["ground", "first"]) {
  const floor = exportAudit.floors.find((entry) => entry.id === id + "-floor"), ui = config.floors[id];
  check(floor?.model === ui.model && floor.preview === ui.preview && floor.sha256 === registered(ui.model).sha256 && floor.previewSha256 === registered(ui.preview).sha256, "Floor export/frontend mismatch: " + id);
  if (id === "ground") {
    const old = json(publicPath(previousRoot + "/manifest.json")).floors.find((entry) => entry.id === "ground-floor");
    check(JSON.stringify(floor) === JSON.stringify(old) && floor.retainedFrom?.release === "R03" && ui.revision === "R03", "Retained ground floor attribution changed");
  } else check(floor.sourceScene === pins.firstFloorScene && ui.revision === "R06" && ui.model.startsWith(config.root + "/") && floor.physicalObjects > 1000, "New first-floor source scene mismatch");
}
const previews = json(local("native-preview-provenance.json"));
const design = json(local("design-verification.json"));
check(design.status === "PASS / CONCEPT GEOMETRY ONLY" && design.nativeSaveReopen === "PASS" && design.glbFreshReimport === "PASS" && design.serializedPrivatePathScan === "PASS" && design.sourcesUnchanged === true &&
  design.sourceNativeSha256 === pins.native["selected-layout.blend"].publicSha256 && design.enclosureCadSha256 === pins.native["ff02-enclosure.FCStd"].publicSha256 && design.firstFloorCadSha256 === pins.native["first-floor.FCStd"].publicSha256 &&
  design.blenderPreservation.groundFloorUnchanged === true && design.cadFreshReopen.status === "PASS" && design.cadFreshReopen.invalidShapes === 0 && Array.isArray(design.notCovered) && design.notCovered.length >= 5, "FF02 enclosure acceptance missing");
check(previews.aiGenerated === false && previews.images.length === 7, "Expected seven source-backed R06 native previews");
for (const preview of previews.images) {
  check(registered(config.root + "/" + preview.file).sha256 === preview.sha256 && validHash(preview.sourceNativeSha256) && preview.metadataOnly === true && preview.pixelChunksUnchanged === true, "Native preview attribution drift: " + preview.file);
  check(preview.sourceNativeSha256 === (preview.sourceNative === "selected-layout.blend" ? pins.native["selected-layout.blend"].publicSha256 : pins.native["ff02-enclosure.FCStd"].publicSha256), "Preview source mismatch: " + preview.file);
}
for (const key of ["blender", "roof", "layout", "cad", "cutaway", "plan"]) registered(config.enclosure[key]);
for (const [id, preview] of Object.entries(config.roomPreviews)) {
  for (const [key, url] of Object.entries(preview)) if (key !== "revision") check(registered(url).sourceRelease === preview.revision, "Room preview attribution drift: " + id);
}

// Only FF02 is re-extracted; fourteen existing room entries retain their original provenance.
const priorRooms = json(publicPath(retainedRoomsUrl));
const roomAudit = json(local("rooms/manifest.json"));
check(pins.retainedRooms === retainedRoomsUrl && hash(readFileSync(publicPath(retainedRoomsUrl))) === pins.retainedRoomsSha256 &&
  roomAudit.revision === "R06" && roomAudit.rooms.length === 15 && roomAudit.protectedSourcesUnchanged === true && JSON.stringify(roomAudit.changedRoomIds) === '["FF-02"]', "Room revision scope drift");
const rooms = json("src/data/buildingRoomServices.json");
const roomCatalog = json("src/data/buildingRoomCad.json");
const ids = ["GF-01", "GF-02", "GF-03", "GF-04", "GF-06", "GF-07", "GF-08", "GF-09", "GF-10", "FF-01", "FF-02", "FF-03", "FF-04", "FF-05", "FF-06"];
for (const list of [rooms, roomCatalog, roomAudit.rooms]) check(JSON.stringify(list.map((room) => room.id).sort()) === JSON.stringify([...ids].sort()), "Room IDs incomplete");
for (const room of roomAudit.rooms) {
  if (room.id !== "FF-02") check(JSON.stringify(room) === JSON.stringify(priorRooms.rooms.find((entry) => entry.id === room.id)), "Retained room changed: " + room.id);
  else {
    check(room.revision === "R06" && room.sourceSha256 === pins.native["first-floor.FCStd"].publicSha256 && room.verification.nativeSaveReopen === "PASS" &&
      room.verification.stepReadback === "PASS" && Object.values(room.verification.stepChecks).length >= 6 && Object.values(room.verification.stepChecks).every((value) => value === true), "FF02 extract lacks coordinated native and STEP proof");
    check(room.provenanceUrl === config.root + "/rooms/FF-02-provenance.json" && Object.values(room.files).every((asset) => asset.url.startsWith(config.root + "/rooms/FF-02")), "FF02 still links a superseded extract");
  }
  const catalog = roomCatalog.find((entry) => entry.id === room.id);
  check(catalog.geometryKind === room.geometryKind && catalog.solidCount === room.solidCount && catalog.provenance === room.provenanceUrl &&
    catalog.downloads.freecad.url === room.files.freecad.url && catalog.downloads.step.url === room.files.step.url && catalog.downloads.svg.url === room.files.preview.url, "Room frontend catalog drift");
  registered(room.provenanceUrl);
  for (const asset of Object.values(room.files)) {
    const accepted = registered(asset.url);
    check(asset.bytes === accepted.bytes && asset.sha256 === accepted.sha256, "Room asset hash mismatch");
  }
}
check(manifest.servicesSha256 === hash(readFileSync("src/data/buildingRoomServices.json")) && manifest.roomCatalogSha256 === hash(readFileSync("src/data/buildingRoomCad.json")), "Service/catalog manifest drift");
for (const room of rooms) {
  check(room.floor === (room.id.startsWith("GF") ? "ground" : "first"), "Room floor label drift");
  for (const field of ["sockets", "lights", "lightWatts", "equipmentWatts"]) check(Number.isFinite(room[field]) && room[field] >= 0, "Invalid service quantity");
}
check(rooms.find((room) => room.id === "GF-10").sockets === 52 && rooms.reduce((sum, room) => sum + room.lightWatts, 0) === 807, "Legacy service allowance changed");

// Every new file: exact bytes, hosting limit, format and public metadata checks.
for (const asset of manifest.files) {
  const data = verifyBytes(local(asset.path), asset);
  check(data.length < 25 * 1024 * 1024, "Pages single-file limit exceeded");
  if (asset.path.endsWith(".glb")) check(data.toString("ascii", 0, 4) === "glTF", "Invalid GLB");
  if (asset.path.endsWith(".FCStd")) check(data.toString("ascii", 0, 2) === "PK", "Invalid FreeCAD archive");
  if (asset.path.endsWith(".step")) check(data.toString("ascii", 0, 9) === "ISO-10303", "Invalid STEP file");
  if (/\.(json|svg|md|step|glb)$/.test(asset.path)) check(!["/Users/", "/private/tmp/", "/var/folders/", "/home/"].some((token) => data.includes(Buffer.from(token))), "Private path in public metadata: " + asset.path);
  if (asset.path.endsWith(".png")) {
    check(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Invalid PNG");
    for (let offset = 8; offset < data.length;) {
      const end = offset + data.readUInt32BE(offset) + 12;
      check(end <= data.length && !["tEXt", "iTXt", "zTXt"].includes(data.toString("ascii", offset + 4, offset + 8)), "Unreviewed PNG metadata");
      offset = end;
    }
  }
}
function auditFiles(path) {
  for (const name of readdirSync(path)) {
    const next = resolve(path, name);
    if (statSync(next).isDirectory()) auditFiles(next);
    else check(relative(root, next) === "release.json" || manifest.files.some((file) => file.path === relative(root, next)), "Unregistered R06 file: " + name);
  }
}
auditFiles(root);
const imageRoot = resolve("public/building-vision/model-aligned-r01");
const imageAudit = JSON.parse(readFileSync(`${imageRoot}/provenance.json`, "utf8"));
check(imageAudit.sourceNativeSha256 === "ddd17b71d22614ef91a6fefda959f183793492f3ed41afd124145b2bdf35c7fd" && imageAudit.sourcePreserved && imageAudit.geometryChanged === false && imageAudit.aiGenerated === false && imageAudit.appearanceOnlyShell === false, "Image alignment source/authority drift");
check(JSON.stringify(imageAudit.images.map((entry) => entry.card).sort()) === JSON.stringify(["02", "03", "06", "10", "11", "13"]), "Image alignment card scope drift");
for (const entry of imageAudit.images) {
  const path = resolve(imageRoot, entry.file);
  check(path.startsWith(`${imageRoot}/`), "Image path escapes release");
  const data = readFileSync(path);
  check(hash(data) === entry.sha256 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Image checksum or format mismatch: ${entry.file}`);
  check(data.readUInt32BE(16) === entry.width && data.readUInt32BE(20) === entry.height, `Image dimensions drift: ${entry.file}`);
  const pixelChunks = [];
  for (let offset = 8; offset < data.length;) {
    const end = offset + data.readUInt32BE(offset) + 12;
    check(end <= data.length, `Truncated PNG: ${entry.file}`);
    const type = data.toString("ascii", offset + 4, offset + 8);
    check(!["tEXt", "iTXt", "zTXt"].includes(type), `Unreviewed text metadata in ${entry.file}`);
    if (["IHDR", "PLTE", "tRNS", "IDAT"].includes(type)) pixelChunks.push(data.subarray(offset, end));
    offset = end;
  }
  check(hash(Buffer.concat(pixelChunks)) === entry.pixelChunksSha256, `Pixel data drift: ${entry.file}`);
}
console.log(`Model-led image alignment verified: ${imageAudit.images.length} native R01 views.`);
console.log(`R06 verified: FF02 glass enclosure and coordinated CAD, ${manifest.files.length} new assets; ${manifest.retainedAssets.length} earlier assets and ${manifest.externalDownloads.length} external downloads verified by exact bytes.`);
