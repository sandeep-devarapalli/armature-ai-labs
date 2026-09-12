import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { check, expectedRetainedAssets, hash, json, previousAsset, previousRelease, previousReleaseSha256, previousRoot, publicPath, verifyBytes } from "./building-vision/release-assets.mjs";

const validHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const configPath = "src/data/buildingModelRelease.json";
const config = json(configPath);
check(config.revision === "r04" && config.label === "R04" && config.root === "/building-models/r04", "Active building release configuration mismatch");
const root = resolve("public" + config.root);
function local(file) {
  const path = resolve(root, file);
  check(path.startsWith(root + "/"), "Manifest path escapes R04");
  return path;
}
const manifest = json(local("release.json"));
const pins = json("scripts/building-vision/r04-accepted-pins.json");
const previous = previousRelease();
check(manifest.release === "R04" && manifest.releaseConfigSha256 === hash(readFileSync(configPath)), "Frontend release configuration drift");
check(manifest.retainedRelease.url === previousRoot + "/release.json" && manifest.retainedRelease.sha256 === previousReleaseSha256, "Retained release attribution drift");
for (const asset of previous.files) verifyBytes(publicPath(previousRoot + "/" + asset.path), asset);
for (const [file, expected] of Object.entries(pins.evidence)) {
  check(validHash(expected) && hash(readFileSync(local(file))) === expected, "Accepted evidence drift: " + file);
}
for (const file of ["cad-metadata-provenance.json", "blender-metadata-provenance.json", "native-preview-provenance.json", "design-verification.json", "manifest.json", "rooms/manifest.json", "external-download-verification.json"]) check(validHash(pins.evidence[file]), "Missing independently accepted evidence pin: " + file);
const copies = ["cad-metadata-provenance.json", "blender-metadata-provenance.json"].flatMap((file) => json(local(file)).files);
const exportAudit = json(local("manifest.json"));
const rooms = json("src/data/buildingRoomServices.json");
const roomCatalog = json("src/data/buildingRoomCad.json");
const roomAudit = json(local("rooms/manifest.json"));
const priorRooms = json(publicPath(previousRoot + "/rooms/manifest.json"));
const ids = ["GF-01", "GF-02", "GF-03", "GF-04", "GF-06", "GF-07", "GF-08", "GF-09", "GF-10", "FF-01", "FF-02", "FF-03", "FF-04", "FF-05", "FF-06"];
const allAssets = [
  ...manifest.files.map((asset) => ({ ...asset, url: config.root + "/" + asset.path })),
  ...manifest.retainedAssets, ...manifest.externalDownloads
];
check(new Set(allAssets.map((asset) => asset.url)).size === allAssets.length, "Duplicate release asset URL");
check(JSON.stringify(manifest.retainedAssets) === JSON.stringify(expectedRetainedAssets(roomAudit)), "Missing, extra or modified retained asset");
function registered(url) {
  const asset = allAssets.find((entry) => entry.url === url);
  check(asset, "Unregistered frontend asset: " + url);
  return asset;
}
function verifiedExternal(asset) {
  if (asset.sourceRelease === "R03") {
    check(JSON.stringify(previousAsset(asset.url, previous)) === JSON.stringify({ url: asset.url, bytes: asset.bytes, sha256: asset.sha256, sourceRelease: "R03" }), "Retained external download drift");
    return;
  }
  check(asset.url === "https://github.com/sandeep-devarapalli/armature-ai-labs/releases/download/building-models-r04/" + asset.file.replace("rooms/", ""), "Unexpected external download URL");
  const proof = json(local("external-download-verification.json")).files.find((entry) => entry.url === asset.url && entry.file === asset.file);
  check(proof?.status === "PASS" && proof.method === "download-sha256" && Number.isFinite(Date.parse(proof.checkedAt)) && proof.bytes === asset.bytes && proof.sha256 === asset.sha256, "External native download lacks byte verification");
}
for (const asset of manifest.externalDownloads) verifiedExternal(asset);
const keys = { "selected-layout.blend": "blender", "first-floor.FCStd": "firstCad" };
for (const [file, key] of Object.entries(keys)) {
  const pin = pins.native[file];
  check(validHash(pin?.sourceSha256) && validHash(pin?.publicSha256), "Missing native acceptance pin: " + file);
  const records = copies.filter((copy) => copy.file === file);
  check(records.length === 1, "Missing/duplicate native curation record: " + file);
  const copy = records[0], c = copy.curation;
  check(copy.sourceSha256 === pin.sourceSha256 && copy.publicSha256 === pin.publicSha256 && copy.sourceSha256 === copy.publicSha256 &&
    copy.serializedPrivatePathScan === "PASS" && copy.nativeSaveReopen === "PASS" && copy.transformationKind === "verified-current-design-copy", "Native curation not accepted: " + file);
  check(c?.retainedGeometryUnchanged === true && c.materialsUnchanged === true && c.selectedMembershipVerified === true && c.reviewViewsVerified === true &&
    validHash(c.selectedAllowlistSha256) && validHash(c.privateAuditSha256) && Number.isInteger(c.removedObjects) && c.removedObjects >= 0 &&
    Number.isInteger(c.removedScenes) && c.removedScenes >= 0 && Array.isArray(c.displayChanges) && Array.isArray(c.dependencyDisclosure), "Incomplete curation evidence: " + file);
  const url = config.downloads[key].url, asset = registered(url);
  check(asset.bytes === copy.publicBytes && asset.sha256 === copy.publicSha256, "Native public byte attribution drift");
  const download = exportAudit.downloads.find((entry) => entry.file === file);
  check(download?.url === url && download.bytes === asset.bytes && download.sha256 === asset.sha256 &&
    download.sourceSha256 === pin.sourceSha256 && download.serializedPrivatePathScan === "PASS" && download.exactNativeCopy === true &&
    download.copyBasis === "verified-current-design-source" && download.transformationKind === copy.transformationKind, "Export native provenance drift");
}
check(config.downloads.groundCad.url === previousRoot + "/ground-floor.FCStd", "Ground CAD must retain its R03 URL");
check(exportAudit.downloads.length === 3 && exportAudit.downloads.find((entry) => entry.file === "ground-floor.FCStd")?.sha256 === registered(config.downloads.groundCad.url).sha256, "Retained ground CAD export drift");
check(exportAudit.sourceNativeSha256 === pins.native["selected-layout.blend"].publicSha256 && exportAudit.originalSourceNativeSha256 === pins.native["selected-layout.blend"].sourceSha256 &&
  exportAudit.sourcePreserved === true && exportAudit.currentDesignOnly === true && exportAudit.ff03EntranceRevision === "P02", "Wrong current Blender source");
check(exportAudit.status === "PASS_GEOMETRY_REIMPORT_AND_EXACT_COPY_CHECKS" && exportAudit.verification.freshReimport === true &&
  exportAudit.verification.physicalObjectAndRawGlbTriangleCountsMatch === true && exportAudit.verification.nativeDownloadHashesMatch === true, "GLB source/reimport gate missing");
check(exportAudit.floors.length === 2, "Expected exactly two floors");
for (const id of ["ground", "first"]) {
  const floor = exportAudit.floors.find((entry) => entry.id === id + "-floor"), ui = config.floors[id];
  check(floor?.model === ui.model && floor.preview === ui.preview && floor.sha256 === registered(ui.model).sha256 &&
    floor.previewSha256 === registered(ui.preview).sha256, "Floor export/frontend mismatch: " + id);
  if (id === "ground") {
    const old = json(publicPath(previousRoot + "/manifest.json")).floors.find((entry) => entry.id === "ground-floor");
    const { retainedFrom, ...entry } = floor;
    check(JSON.stringify(entry) === JSON.stringify(old) && retainedFrom?.release === "R03" && ui.revision === "R03", "Retained ground floor attribution changed");
  } else check(floor.sourceScene === pins.firstFloorScene && ui.revision === "R04", "New first-floor source scene mismatch");
}
const previews = json(local("native-preview-provenance.json"));
const design = json(local("design-verification.json"));
check(design.status === "PASS / MODELED GEOMETRY ONLY" && design.nativeSaveReopen === "PASS" && design.sourcesUnchanged && design.visualReview === "PASS" &&
  design.sourceNativeSha256 === pins.native["selected-layout.blend"].publicSha256 && design.firstFloorCadSha256 === pins.native["first-floor.FCStd"].publicSha256 &&
  design.motion.status === "PASS / COMPLETE TRANSLATIONAL SWEPT SOLIDS" && design.motion.errors.length === 0 &&
  design.aperture.status === "PASS / UNCHANGED FRAME APERTURE AND RETAINED-DOOR SEPARATION", "FF03 motion/aperture acceptance missing");
check(previews.aiGenerated === false && previews.images.length === 5, "Expected five source-backed R04 native previews");
for (const preview of previews.images) check(registered(config.root + "/" + preview.file).sha256 === preview.sha256 && validHash(preview.sourceNativeSha256), "Native preview attribution drift");
for (const [id, preview] of Object.entries(config.roomPreviews)) {
  for (const [key, url] of Object.entries(preview)) if (key !== "revision") registered(url);
  if (id !== "FF-03") check(preview.revision === "R03" && Object.entries(preview).filter(([key]) => key !== "revision").every(([, url]) => url.startsWith(previousRoot + "/")), "Retained room preview relabelled");
}
check(roomAudit.revision === "R04" && JSON.stringify(roomAudit.changedRoomIds) === '["FF-03"]' && roomAudit.protectedSourcesUnchanged === true, "Room update scope drift");
for (const list of [rooms, roomCatalog, roomAudit.rooms]) check(JSON.stringify(list.map((room) => room.id).sort()) === JSON.stringify([...ids].sort()), "Room IDs incomplete");
for (const room of roomAudit.rooms) {
  check(room.verification.nativeSaveReopen === "PASS" && room.verification.stepReadback === "PASS" &&
    ["valid", "solids", "bounds", "volume", "area", "summed_edge_length"].every((key) => room.verification.stepChecks[key] === true), "Native/STEP room gate missing: " + room.id);
  if (room.id !== "FF-03") check(JSON.stringify(room) === JSON.stringify(priorRooms.rooms.find((old) => old.id === room.id)), "Retained room metadata changed: " + room.id);
  else {
    check(room.revision === "R04" && room.includedInRelease === "R04" && room.sourceSha256 === pins.native["first-floor.FCStd"].publicSha256 &&
      validHash(pins.roomSelectionSha256) && room.selectionSha256 === pins.roomSelectionSha256, "FF03 source/selection mismatch");
    const provenance = json(publicPath(room.provenanceUrl));
    check(provenance.sourceSha256 === room.sourceSha256 && provenance.selectionSha256 === room.selectionSha256 &&
      provenance.objects.length === room.shapeCount && new Set(provenance.objects.map((entry) => entry.sourceObjectId)).size === room.shapeCount, "FF03 member/provenance mismatch");
    for (const [key, role] of [["fitout", "FurnitureAndFitout"], ["context", "BlenderContext"]]) {
      const members = provenance.objects.filter((entry) => entry.role === role).map((entry) => entry.sourceObjectId).sort();
      check(hash(JSON.stringify(members)) === pins.roomMembers[key], "FF03 exact member set drift: " + key);
    }
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
for (const asset of allAssets.filter((entry) => entry.url.startsWith("/"))) {
  const data = verifyBytes(publicPath(asset.url), asset);
  check(data.length < 25 * 1024 * 1024, "Pages single-file limit exceeded");
  if (asset.url.endsWith(".glb")) check(data.toString("ascii", 0, 4) === "glTF", "Invalid GLB");
  if (asset.url.endsWith(".FCStd")) check(data.toString("ascii", 0, 2) === "PK", "Invalid FreeCAD archive");
  if (/\.(json|svg|md)$/.test(asset.url)) check(!["/Users/", "/private/tmp/", "/var/folders/"].some((token) => data.includes(Buffer.from(token))), "Private path in public metadata");
  if (asset.url.startsWith(config.root) && asset.url.endsWith(".png")) {
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
    else check(relative(root, next) === "release.json" || manifest.files.some((file) => file.path === relative(root, next)), "Unregistered R04 file: " + name);
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
console.log(`R04 verified: one updated room, fourteen retained rooms, ${manifest.files.length} new assets; immutable R03 and legacy services preserved.`);
