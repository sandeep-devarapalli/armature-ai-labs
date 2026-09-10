import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve("public/building-models/r01");
const manifest = JSON.parse(readFileSync(`${root}/release.json`, "utf8"));
const rooms = JSON.parse(readFileSync("src/data/buildingRoomServices.json", "utf8"));
const roomCatalog = JSON.parse(readFileSync("src/data/buildingRoomCad.json", "utf8"));
const expected = ["GF-01", "GF-02", "GF-03", "GF-04", "GF-06", "GF-07", "GF-08", "GF-09", "GF-10", "FF-01", "FF-02", "FF-03", "FF-04", "FF-05", "FF-06"];
const hash = (data) => createHash("sha256").update(data).digest("hex");
function check(condition, message) { if (!condition) throw new Error(message); }
check(manifest.release === "R01", "Unexpected coordinated release");
const nativeHashes = {
  "selected-layout.blend": "ddd17b71d22614ef91a6fefda959f183793492f3ed41afd124145b2bdf35c7fd",
  "ground-floor.FCStd": "145082c570bb32572b96a83886545c1118a37b6a9f5e64bf76d6511a38e7abfc",
  "first-floor.FCStd": "4c8c65dbf487ba996e61ec38a3640ef5b5e97587f980dac338b09f3ac406a971"
};
const metadataCopies = ["cad-metadata-provenance.json", "blender-metadata-provenance.json"]
  .flatMap((file) => JSON.parse(readFileSync(`${root}/${file}`, "utf8")).files);
for (const [file, expectedHash] of Object.entries(nativeHashes)) {
  const copy = metadataCopies.find((entry) => entry.file === file);
  check(copy && copy.sourceSha256 === expectedHash && copy.metadataOnly && copy.nativeSaveReopen === "PASS", `Unverified R01 metadata copy: ${file}`);
  check(hash(readFileSync(`${root}/${file}`)) === copy.publicSha256, `Native public-copy checksum mismatch: ${file}`);
  check(file.endsWith(".blend") ? copy.geometryMaterialsMembershipsUnchanged && copy.reviewViewsUnchanged : copy.nonXmlPayloadsUnchanged, `Native geometry preservation failed: ${file}`);
}
for (const file of [...Object.keys(nativeHashes), "ground-floor.glb", "first-floor.glb", "ground-floor.png", "first-floor.png", "manifest.json"]) check(manifest.files.some((f) => f.path === file), `Missing primary asset: ${file}`);
const exportAudit = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
for (const copy of metadataCopies) {
  check(copy.metadataOnly && hash(readFileSync(`${root}/${copy.file}`)) === copy.publicSha256, `Unverified sanitized file: ${copy.file}`);
  if (copy.file.endsWith(".png")) check(copy.pixelChunksUnchanged, `Preview pixels changed: ${copy.file}`);
  else {
    const entry = exportAudit.downloads.find((download) => download.url.endsWith(`/${copy.file}`));
    check(entry && !entry.exactNativeCopy && entry.metadataSanitized && entry.sourceSha256 === copy.sourceSha256 && entry.sha256 === copy.publicSha256, `Native download provenance mismatch: ${copy.file}`);
  }
}
check(exportAudit.sourceNativeSha256 === nativeHashes["selected-layout.blend"] && exportAudit.sourcePreserved && exportAudit.developmentB01Included === false, "Blender export is not bound to preserved R01 source");
check(exportAudit.floors.length === 2, "Expected exactly two exported floors");
for (const floor of ["ground-floor", "first-floor"]) {
  const entry = exportAudit.floors.find((f) => f.id === floor);
  check(entry && entry.sha256 === hash(readFileSync(`${root}/${floor}.glb`)) && entry.previewSha256 === hash(readFileSync(`${root}/${floor}.png`)), `Unverified export: ${floor}`);
}
check(manifest.servicesSha256 === hash(readFileSync("src/data/buildingRoomServices.json")), "Service data changed: review and regenerate the release manifest");
check(manifest.roomCatalogSha256 === hash(readFileSync("src/data/buildingRoomCad.json")), "Room CAD catalog drift");
const roomAudit = JSON.parse(readFileSync(`${root}/rooms/manifest.json`, "utf8"));
check(roomAudit.revision === "R01" && roomAudit.rooms.length === 15, "Room audit release/scope mismatch");
for (const list of [roomAudit.rooms, roomCatalog]) check(JSON.stringify(list.map((room) => room.id).sort()) === JSON.stringify([...expected].sort()), "Room audit/catalog ID mismatch");
for (const entry of roomAudit.rooms) {
  const source = entry.id.startsWith("GF") ? "ground-floor.FCStd" : "first-floor.FCStd";
  check(entry.sourceSha256 === nativeHashes[source] && entry.verification.nativeSaveReopen === "PASS" && entry.verification.stepReadback === "PASS", `Unverified room extract: ${entry.id}`);
  const catalog = roomCatalog.find((room) => room.id === entry.id);
  check(catalog && catalog.geometryKind === entry.geometryKind && catalog.solidCount === entry.solidCount, `Room geometry label drift: ${entry.id}`);
  for (const asset of Object.values(entry.files)) check(hash(readFileSync(`${root}/rooms/${asset.filename}`)) === asset.sha256, `Room audit hash mismatch: ${asset.filename}`);
}
check(JSON.stringify(rooms.map((r) => r.id).sort()) === JSON.stringify(expected.sort()), "Room scope mismatch");
for (const room of rooms) {
  check(room.floor === (room.id.startsWith("GF") ? "ground" : "first"), `${room.id}: floor label mismatch`);
  for (const field of ["sockets", "lights", "lightWatts", "equipmentWatts"]) check(Number.isFinite(room[field]) && room[field] >= 0, `${room.id}: invalid ${field}`);
  for (const extension of ["FCStd", "step", "svg"]) check(manifest.files.some((f) => f.path === `rooms/${room.id}.${extension}`), `${room.id}: missing ${extension}`);
}
check(rooms.find((r) => r.id === "GF-10").sockets === 52, "GF10 optional socket increase must not be silently promoted");
for (const file of manifest.files) {
  const path = resolve(root, file.path);
  check(path.startsWith(`${root}/`), "Manifest path escapes release");
  const data = readFileSync(path);
  check(data.length === file.bytes && hash(data) === file.sha256, `Checksum mismatch: ${file.path}`);
  check(data.length < 25 * 1024 * 1024, `Hosting file limit: ${file.path}`);
  if (file.path.endsWith(".glb")) check(data.toString("ascii", 0, 4) === "glTF", `Invalid GLB ${file.path}`);
  if (file.path.endsWith(".FCStd")) check(data.toString("ascii", 0, 2) === "PK", `Invalid FreeCAD archive ${file.path}`);
}
function auditFiles(path) {
  for (const name of readdirSync(path)) {
    const next = resolve(path, name);
    if (statSync(next).isDirectory()) auditFiles(next);
    else check(relative(root, next) === "release.json" || manifest.files.some((f) => f.path === relative(root, next)), `Unregistered release asset: ${name}`);
  }
}
auditFiles(root);
const imageRoot = resolve("public/building-vision/model-aligned-r01");
const imageAudit = JSON.parse(readFileSync(`${imageRoot}/provenance.json`, "utf8"));
check(imageAudit.sourceNativeSha256 === nativeHashes["selected-layout.blend"] && imageAudit.sourcePreserved && imageAudit.geometryChanged === false && imageAudit.aiGenerated === false && imageAudit.appearanceOnlyShell === false, "Image alignment source/authority drift");
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
console.log(`Building release verified: ${rooms.length} rooms, ${manifest.files.length} checksummed files; source R01, service proposal S01.`);
