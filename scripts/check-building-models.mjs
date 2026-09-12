import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const configPath = "src/data/buildingModelRelease.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));
function check(condition, message) { if (!condition) throw new Error(message); }
const hash = (data) => createHash("sha256").update(data).digest("hex");
const validHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
check(config.revision === "r03" && config.label === "R03" && config.root === "/building-models/r03", "Active building release configuration mismatch");
const root = resolve("public" + config.root);
function local(file) {
  const path = resolve(root, file);
  check(path.startsWith(root + "/"), "Manifest path escapes active release");
  return path;
}
function json(file) { return JSON.parse(readFileSync(local(file), "utf8")); }
const manifest = json("release.json");
check(manifest.release === config.label && manifest.releaseConfigSha256 === hash(readFileSync(configPath)), "Manifest does not match the frontend's active release");

// Accepted after native reopen, curation, geometry and downloaded-byte checks.
const nativePins = {
  "selected-layout.blend": { sourceSha256: "4d4964c3c42c3501ada1ae3274f18a686a190cd8207e8ea9b6df7245654bc2b6", publicSha256: "2bf4638a5d4ec2eaca76316debf06f290d69afe36f667fc8329247460f130a70" },
  "ground-floor.FCStd": { sourceSha256: "374df20b0b81f03790211ead98471353221c830b1a5cc98f4bdbcf052764c2fc", publicSha256: "3282f8e42579b73b24f097e8b65bad672d5bc2b4dc8d46c486eb163780cff0df" },
  "first-floor.FCStd": { sourceSha256: "dda19105f9c8ac092916f518b0239ad7ae420409acf9c87fe571dad727db3c29", publicSha256: "337d7e2d4d8d60c83a4e867e43141bec6c3ed46314640b8df89493b8ed2e4a50" }
};
const evidencePins = { "cad-metadata-provenance.json": "0f331ab81a95c4b8bd813b111b7b59273b7b658765b678353efce19ff8c6f3fb", "blender-metadata-provenance.json": "157fe7a386e04298161dd61172037741922002fbd5c5269a86671230809c9ca1" };
const sourceViews = { "ground-floor": { scene: "Ground floor - selected current", previewSha256: "6333c6c7fdbaf16a2e5de7ab0b087410017b9f6690a3226a60c852061c312e32" }, "first-floor": { scene: "First floor - P03 selected current", previewSha256: "a2d50ceec7ac46ac69c97dd3943510811bd836e6c7c6f4cc6414826da8f6dce1" } };
const roomSelectionSha256 = "e94671f3923c29b42ccbb72ce97c4771fc408418119e7ed78b7a9873588828f4";
const roomMemberPins = {
  "FF-04": { fitout: "8439d3160197055554bdf47ddce67dc47f12d5fa241b811ec0782c59dd5c616b", context: "57f9b601e1658b04fef966561cdfcbaa066314c3afe46da35c3e99a433c945af" },
  "FF-06": { fitout: "83f1cddc41a2191e0ceb91fd9418b9f9c225431fa07e2a6c808953e5b8b16c89", context: "f4533858da83e3d8809fc7d745372a00a4d230696c10d627cbe99f7f468b9943" }
};
const externalEvidenceSha256 = "80e48c1fa97c7cea44bf799116c6db89829a0ac603734601575a9364aa62b56d";
check(hash(readFileSync(local("native-preview-provenance.json"))) === "c6524ffa2394a2fe48f5500ff369082700d42a4d3f34183b35f987fb9a181544", "Native preview evidence drift");
check(hash(readFileSync(local("design-verification.json"))) === "f450dfcbbb5b1ebc56050ba2b342620561b3b383c16ad77a8d29b111592d43a7", "Modeled door verification evidence drift");
const previewEvidence = json("native-preview-provenance.json");
check(previewEvidence.aiGenerated === false && previewEvidence.images.length === 6, "Expected six native previews");
for (const preview of previewEvidence.images) check(hash(readFileSync(local(preview.file))) === preview.sha256, "Native preview bytes drift: " + preview.file);
const retainedEvidenceSha256 = "ae08c510d31d4a2b1d56714ec12aae57c5b178d084734871d70a4fc7c7a6bd50";
const retainedSources = { ground: "374df20b0b81f03790211ead98471353221c830b1a5cc98f4bdbcf052764c2fc", first: "d379157326c11798497b9dfd7cdc27ba2d1e79400332d27427d82c8bb0d28891" };
check(Object.values(nativePins).every((pin) => validHash(pin.sourceSha256) && validHash(pin.publicSha256)) &&
  Object.values(evidencePins).every(validHash) && validHash(roomSelectionSha256) && Object.values(roomMemberPins).every((pin) => validHash(pin.fitout) && validHash(pin.context)) &&
  Object.values(sourceViews).every((view) => view.scene && validHash(view.previewSha256)), "Final P03 source/curation/selection pins are not accepted; release blocked");
check(Array.isArray(manifest.files) && new Set(manifest.files.map((file) => file.path)).size === manifest.files.length, "Duplicate local release asset");
check(Array.isArray(manifest.externalDownloads), "External download manifest must be explicit, including an empty array");
const metadataCopies = Object.entries(evidencePins).flatMap(([file, expectedHash]) => {
  check(hash(readFileSync(local(file))) === expectedHash, "Curation evidence checksum mismatch: " + file);
  return json(file).files;
});
const exportAudit = json("manifest.json");
const nativeKeys = { "ground-floor.FCStd": "groundCad", "first-floor.FCStd": "firstCad", "selected-layout.blend": "blender" };
const usedExternal = [];
function verifyExternal(file, url, bytes, sha256) {
  const parsed = new URL(url);
  check(parsed.protocol === "https:" && parsed.hostname === "github.com" &&
    parsed.pathname.startsWith("/sandeep-devarapalli/armature-ai-labs/releases/download/"), "Unapproved native destination");
  check(validHash(externalEvidenceSha256) && hash(readFileSync(local("external-download-verification.json"))) === externalEvidenceSha256, "External byte-verification evidence not accepted");
  const entry = manifest.externalDownloads.find((asset) => asset.file === file && asset.url === url);
  const remote = json("external-download-verification.json").files.find((asset) => asset.file === file && asset.url === url);
  check(entry && entry.bytes === bytes && entry.sha256 === sha256 &&
    remote && remote.status === "PASS" && remote.method === "download-sha256" && Number.isFinite(Date.parse(remote.checkedAt)) &&
    remote.bytes === entry.bytes && remote.sha256 === entry.sha256, "Unverified external native bytes: " + file);
  check(!manifest.files.some((asset) => asset.path === file), "External native must not also occupy Pages public assets: " + file);
  usedExternal.push(url);
}
for (const [file, pin] of Object.entries(nativePins)) {
  const copies = metadataCopies.filter((entry) => entry.file === file);
  check(copies.length === 1, "Missing or duplicate native curation record: " + file);
  const copy = copies[0], c = copy.curation;
  check(copy.sourceSha256 === pin.sourceSha256 && copy.publicSha256 === pin.publicSha256 &&
    copy.transformationKind === "current-design-curation-and-metadata-sanitization" && copy.nativeSaveReopen === "PASS", "Unverified current-design copy: " + file);
  check(c?.retainedGeometryUnchanged === true && c.materialsUnchanged === true && c.selectedMembershipVerified === true &&
    c.reviewViewsVerified === true && validHash(c.selectedAllowlistSha256) && validHash(c.privateAuditSha256) &&
    Number.isInteger(c.removedObjects) && c.removedObjects >= 0 && Number.isInteger(c.removedScenes) && c.removedScenes >= 0 &&
    Array.isArray(c.displayChanges) && Array.isArray(c.dependencyDisclosure), "Incomplete native curation evidence: " + file);
  check(Number.isSafeInteger(copy.publicBytes) && copy.publicBytes > 0, "Invalid native byte count: " + file);
  const url = config.downloads[nativeKeys[file]].url;
  if (url.startsWith("/")) {
    check(url === config.root + "/" + file, "Frontend local native URL drift: " + file);
    const asset = manifest.files.find((entry) => entry.path === file);
    check(asset && asset.bytes === copy.publicBytes && asset.sha256 === pin.publicSha256, "Missing local native asset: " + file);
  } else {
    verifyExternal(file, url, copy.publicBytes, pin.publicSha256);
  }
  const download = exportAudit.downloads.find((entry) => entry.file === file || entry.url.endsWith("/" + file));
  check(download && download.url === url && download.bytes === copy.publicBytes && download.sha256 === pin.publicSha256 &&
    download.sourceSha256 === pin.sourceSha256 && download.metadataSanitized === true &&
    download.transformationKind === copy.transformationKind && download.exactNativeCopy === true &&
    download.copyBasis === "curated-current-design-source", "Native download provenance mismatch: " + file);
}
check(exportAudit.sourceNativeSha256 === nativePins["selected-layout.blend"].publicSha256 &&
  exportAudit.originalSourceNativeSha256 === nativePins["selected-layout.blend"].sourceSha256 &&
  exportAudit.sourcePreserved === true && exportAudit.currentDesignOnly === true, "GLBs are not bound to the curated current-design source");
check(exportAudit.status === "PASS_GEOMETRY_REIMPORT_AND_EXACT_COPY_CHECKS" && exportAudit.verification.freshReimport &&
  exportAudit.verification.physicalObjectAndRawGlbTriangleCountsMatch, "Independent GLB geometry gate missing");
check(exportAudit.floors.length === 2 && new Set(exportAudit.floors.map((floor) => floor.id)).size === 2, "Expected exactly two exported floors");
for (const floor of ["ground-floor", "first-floor"]) {
  const entry = exportAudit.floors.find((f) => f.id === floor);
  const previewCopies = metadataCopies.filter((copy) => copy.file === floor + ".png");
  check(previewCopies.length === 1, "Missing or duplicate preview metadata evidence: " + floor);
  const preview = previewCopies[0];
  check(entry && entry.model === config.root + "/" + floor + ".glb" && entry.preview === config.root + "/" + floor + ".png" &&
    entry.sha256 === hash(readFileSync(local(floor + ".glb"))) && entry.previewSha256 === hash(readFileSync(local(floor + ".png"))), "Unverified active floor asset: " + floor);
  check(entry.sourceScene === sourceViews[floor].scene && entry.sourcePreviewSha256 === sourceViews[floor].previewSha256 &&
    preview.sourceSha256 === entry.sourcePreviewSha256 && preview.publicSha256 === entry.previewSha256 &&
    preview.metadataOnly === true && preview.pixelChunksUnchanged === true, "Current source scene/preview drift: " + floor);
}
for (const file of ["ground-floor.glb", "first-floor.glb", "ground-floor.png", "first-floor.png", "ff04-cabins.png", "ff06-cabins.png", "ff04-cad.png", "ff06-cad.png", "manifest.json"]) {
  check(manifest.files.some((asset) => asset.path === file), "Missing active primary asset: " + file);
}
const rooms = JSON.parse(readFileSync("src/data/buildingRoomServices.json", "utf8"));
const roomCatalog = JSON.parse(readFileSync("src/data/buildingRoomCad.json", "utf8"));
check(manifest.servicesSha256 === hash(readFileSync("src/data/buildingRoomServices.json")), "Service data changed: review and regenerate manifest");
check(manifest.roomCatalogSha256 === hash(readFileSync("src/data/buildingRoomCad.json")), "Room CAD catalog drift");
const expected = ["GF-01", "GF-02", "GF-03", "GF-04", "GF-06", "GF-07", "GF-08", "GF-09", "GF-10", "FF-01", "FF-02", "FF-03", "FF-04", "FF-05", "FF-06"];
const changed = ["FF-04", "FF-06"];
const roomAudit = json("rooms/manifest.json");
check(roomAudit.revision === config.label && JSON.stringify(roomAudit.changedRoomIds) === JSON.stringify(changed), "Room audit release/change scope mismatch");
for (const list of [roomAudit.rooms, roomCatalog, rooms]) check(JSON.stringify(list.map((room) => room.id).sort()) === JSON.stringify([...expected].sort()), "Room audit/catalog/services ID mismatch");
check(hash(JSON.stringify(roomAudit.retainedEvidence)) === retainedEvidenceSha256, "Retained R02 room evidence drift");
for (const entry of roomAudit.rooms) {
  const isChanged = changed.includes(entry.id);
  const sourceHash = isChanged ? nativePins["first-floor.FCStd"].publicSha256 : retainedSources[entry.id.startsWith("GF") ? "ground" : "first"];
  check(entry.sourceSha256 === sourceHash && entry.includedInRelease === config.label &&
    entry.revision === (isChanged ? config.label : "R02") && entry.verification.nativeSaveReopen === "PASS" &&
    entry.verification.stepReadback === "PASS" && ["valid", "solids", "bounds", "volume", "area", "summed_edge_length"].every((key) => entry.verification.stepChecks[key] === true), "Unverified room extract: " + entry.id);
  const provenance = json("rooms/" + entry.id + "-provenance.json");
  check(provenance.sourceSha256 === entry.sourceSha256 && provenance.revision === entry.revision && provenance.includedInRelease === config.label, "Room provenance drift: " + entry.id);
  check(provenance.objects.length === entry.shapeCount && new Set(provenance.objects.map((o) => o.sourceObjectId)).size === entry.shapeCount, "Room member list drift: " + entry.id);
  if (isChanged) {
    check(entry.selectionSha256 === roomSelectionSha256 && provenance.selectionSha256 === roomSelectionSha256, "Unverified P03 room allowlist: " + entry.id);
    for (const [key, role] of [["fitout", "FurnitureAndFitout"], ["context", "BlenderContext"]]) {
      const ids = provenance.objects.filter((object) => object.role === role).map((object) => object.sourceObjectId).sort();
      check(hash(JSON.stringify(ids)) === roomMemberPins[entry.id][key], "Current room member set drift: " + entry.id + " " + key);
    }
  } else {
    const retained = roomAudit.retainedEvidence.find((r) => r.id === entry.id);
    check(retained && entry.retainedFrom?.revision === "R02" && JSON.stringify(entry.retainedFrom.files) === JSON.stringify(retained.files), "Retained room attribution drift: " + entry.id);
    for (const asset of retained.files.filter((a) => !a.filename.endsWith("-provenance.json"))) {
      const data = readFileSync(local("rooms/" + asset.filename));
      check(data.length === asset.bytes && hash(data) === asset.sha256, "Retained R02 bytes changed: " + asset.filename);
    }
  }
  const catalog = roomCatalog.find((room) => room.id === entry.id);
  check(catalog.geometryKind === entry.geometryKind && catalog.solidCount === entry.solidCount, "Room geometry label drift: " + entry.id);
  check(catalog.downloads?.freecad.url === entry.files.freecad.url && catalog.downloads?.step.url === entry.files.step.url, "Frontend room download URL drift: " + entry.id);
  if (["GF-01", "FF-03"].includes(entry.id)) check(provenance.objects.filter((o) => o.role === "BlenderContext").length === (entry.id === "GF-01" ? 7 : 6), "Retained Blender context missing: " + entry.id);
  for (const asset of Object.values(entry.files)) {
    if (asset.url.startsWith("/")) {
      check(asset.url === config.root + "/rooms/" + asset.filename, "Active room asset URL drift");
      const data = readFileSync(local("rooms/" + asset.filename));
      check(data.length === asset.bytes && hash(data) === asset.sha256, "Room audit byte/hash mismatch: " + asset.filename);
    } else {
      check(/\.(FCStd|step)$/.test(asset.filename) && isChanged, "Only verified changed native room files may be externally hosted");
      verifyExternal("rooms/" + asset.filename, asset.url, asset.bytes, asset.sha256);
    }
  }
}
check(manifest.externalDownloads.length === usedExternal.length && new Set(usedExternal).size === usedExternal.length, "Unregistered or duplicate external download");
for (const room of rooms) {
  check(room.floor === (room.id.startsWith("GF") ? "ground" : "first"), room.id + ": floor label mismatch");
  for (const field of ["sockets", "lights", "lightWatts", "equipmentWatts"]) check(Number.isFinite(room[field]) && room[field] >= 0, room.id + ": invalid " + field);
  for (const extension of ["FCStd", "step", "svg"]) check(
    manifest.files.some((f) => f.path === "rooms/" + room.id + "." + extension) ||
    manifest.externalDownloads.some((f) => f.file === "rooms/" + room.id + "." + extension), room.id + ": missing " + extension);
}
check(rooms.find((r) => r.id === "GF-10").sockets === 52, "GF10 optional socket increase must not be silently promoted");
for (const file of manifest.files) {
  const data = readFileSync(local(file.path));
  check(data.length === file.bytes && hash(data) === file.sha256, "Checksum mismatch: " + file.path);
  check(data.length < 25 * 1024 * 1024, "Hosting file limit: " + file.path);
  if (file.path.endsWith(".glb")) check(data.toString("ascii", 0, 4) === "glTF", "Invalid GLB " + file.path);
  if (file.path.endsWith(".FCStd")) check(data.toString("ascii", 0, 2) === "PK", "Invalid FreeCAD archive " + file.path);
  if (/\.(json|svg|md)$/.test(file.path)) check(!["/Users/", "/private/tmp/", "/var/folders/"].some((token) => data.includes(Buffer.from(token))), "Private path in public metadata: " + file.path);
}
function auditFiles(path) {
  for (const name of readdirSync(path)) {
    const next = resolve(path, name);
    if (statSync(next).isDirectory()) auditFiles(next);
    else check(relative(root, next) === "release.json" || manifest.files.some((f) => f.path === relative(root, next)), "Unregistered release asset: " + name);
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
console.log(`Building release verified: ${rooms.length} rooms, ${manifest.files.length} checksummed files; source R03, legacy service proposal S01.`);
