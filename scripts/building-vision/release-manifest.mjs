import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const config = JSON.parse(readFileSync("src/data/buildingModelRelease.json", "utf8"));
if (config.revision !== "r03" || config.label !== "R03" || config.root !== "/building-models/r03" || !/^\d{4}-\d{2}-\d{2}$/.test(config.date)) throw new Error("Active building release configuration mismatch");
const root = resolve("public" + config.root);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const metadataCopies = ["cad-metadata-provenance.json", "blender-metadata-provenance.json"]
  .flatMap((file) => JSON.parse(readFileSync(`${root}/${file}`, "utf8")).files);
const exportAudit = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
const nativeKeys = { "ground-floor.FCStd": "groundCad", "first-floor.FCStd": "firstCad", "selected-layout.blend": "blender" };
const externalDownloads = [];
let remoteEvidence;
function externalDownload(file, url, bytes, sha256) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || !parsed.pathname.startsWith("/sandeep-devarapalli/armature-ai-labs/releases/download/")) throw new Error("Unapproved native download destination");
  remoteEvidence ??= JSON.parse(readFileSync(`${root}/external-download-verification.json`, "utf8"));
  const verified = remoteEvidence.files.find((entry) => entry.file === file && entry.url === url);
  if (!verified || verified.status !== "PASS" || verified.method !== "download-sha256" || !Number.isFinite(Date.parse(verified.checkedAt)) ||
      verified.sha256 !== sha256 || verified.bytes !== bytes) throw new Error(`External download is unverified: ${file}`);
  if (externalDownloads.some((entry) => entry.file === file || entry.url === url)) throw new Error("Duplicate external download");
  externalDownloads.push({ file, url, bytes, sha256 });
}
for (const copy of metadataCopies) {
  if (Object.hasOwn(nativeKeys, copy.file)) {
    const key = nativeKeys[copy.file];
    const url = config.downloads[key].url;
    const c = copy.curation;
    if (copy.transformationKind !== "current-design-curation-and-metadata-sanitization" || copy.nativeSaveReopen !== "PASS" ||
        !c?.retainedGeometryUnchanged || !c.materialsUnchanged || !c.selectedMembershipVerified || !c.reviewViewsVerified ||
        !Array.isArray(c.displayChanges) || !Array.isArray(c.dependencyDisclosure)) throw new Error(`Unverified current-design curation: ${copy.file}`);
    if (!Number.isSafeInteger(copy.publicBytes) || copy.publicBytes <= 0) throw new Error(`Missing public byte count: ${copy.file}`);
    if (url.startsWith("/")) {
      if (url !== `${config.root}/${copy.file}`) throw new Error(`Local download URL drift: ${copy.file}`);
      const data = readFileSync(`${root}/${copy.file}`);
      if (data.length !== copy.publicBytes || hash(data) !== copy.publicSha256) throw new Error(`Curated copy drift: ${copy.file}`);
    } else {
      externalDownload(copy.file, url, copy.publicBytes, copy.publicSha256);
    }
    const download = exportAudit.downloads.find((entry) => entry.file === copy.file || entry.url.endsWith("/" + copy.file));
    if (!download) throw new Error(`Missing curated download record: ${copy.file}`);
    Object.assign(download, {
      file: copy.file, url, bytes: copy.publicBytes, sha256: copy.publicSha256, sourceSha256: copy.sourceSha256,
      exactNativeCopy: true, copyBasis: "curated-current-design-source", metadataSanitized: true, transformationKind: copy.transformationKind
    });
  } else if (["ground-floor.png", "first-floor.png"].includes(copy.file)) {
    const data = readFileSync(`${root}/${copy.file}`);
    if (hash(data) !== copy.publicSha256 || !copy.metadataOnly || !copy.pixelChunksUnchanged) throw new Error(`Unverified image metadata copy: ${copy.file}`);
    const floor = exportAudit.floors.find((entry) => `${entry.id}.png` === copy.file);
    if (!floor) throw new Error(`Unknown preview: ${copy.file}`);
    Object.assign(floor, { sourcePreviewSha256: copy.sourceSha256, previewSha256: copy.publicSha256 });
  } else throw new Error(`Unexpected metadata copy: ${copy.file}`);
}
if (Object.keys(nativeKeys).some((file) => metadataCopies.filter((copy) => copy.file === file).length !== 1)) throw new Error("Expected exactly three curated native download records");
writeFileSync(`${root}/manifest.json`, `${JSON.stringify(exportAudit, null, 2)}\n`);
const files = [];
function walk(path) {
  for (const name of readdirSync(path).sort()) {
    const next = resolve(path, name);
    if (statSync(next).isDirectory()) walk(next);
    else if (next !== `${root}/release.json`) {
      const data = readFileSync(next);
      if (data.length >= 25 * 1024 * 1024) throw new Error(`Hosting file limit: ${relative(root, next)}`);
      files.push({ path: relative(root, next), bytes: data.length, sha256: hash(data) });
    }
  }
}
walk(root);
const roomAudit = JSON.parse(readFileSync(`${root}/rooms/manifest.json`, "utf8"));
if (roomAudit.revision !== config.label || roomAudit.rooms.length !== 15) throw new Error("Incomplete room export");
for (const room of roomAudit.rooms) for (const asset of Object.values(room.files)) {
  if (!asset.url.startsWith("/")) externalDownload("rooms/" + asset.filename, asset.url, asset.bytes, asset.sha256);
}
writeFileSync("src/data/buildingRoomCad.json", `${JSON.stringify(roomAudit.rooms.map(({ id, geometryKind, solidCount, files: roomFiles }) => ({
  id, geometryKind, solidCount, downloads: { freecad: { url: roomFiles.freecad.url }, step: { url: roomFiles.step.url } }
})), null, 2)}\n`);
const manifest = {
  release: config.label, date: config.date, serviceRevision: "S01", floors: ["ground", "first"],
  serviceStatus: "Legacy discussion counts; not recalculated or approved for R03.",
  scope: "Verified selected planning reference; not an as-built survey or an issued construction design.",
  releaseConfigSha256: hash(readFileSync("src/data/buildingModelRelease.json")),
  servicesSha256: hash(readFileSync("src/data/buildingRoomServices.json")),
  roomCatalogSha256: hash(readFileSync("src/data/buildingRoomCad.json")),
  updatePolicy: "Regenerate affected assets from a newly verified native release; review services and validate before publishing. Local saves are not public deployments.",
  files, externalDownloads
};
writeFileSync(`${root}/release.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Recorded ${files.length} local assets and ${externalDownloads.length} independently verified external native downloads.`);
