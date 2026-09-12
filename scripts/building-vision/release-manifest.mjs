import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { check, expectedExternalDownloads, expectedRetainedAssets, hash, json, previousAsset, previousRelease, previousReleaseSha256, previousRoot, publicPath, verifyBytes } from "./release-assets.mjs";

// R05: FF02 C03 enclosure. Regenerates only the first-floor browser model, its preview, the Blender public copy and the
// room-level enclosure CAD; every R04 and R03 asset is retained by exact bytes. Run after the native records are reviewed.
const configPath = "src/data/buildingModelRelease.json";
const config = json(configPath);
check(config.revision === "r05" && config.label === "R05" && config.root === "/building-models/r05", "Active release mismatch");
const root = publicPath(config.root + "/release.json").replace(/\/release.json$/, "");
const previous = previousRelease();
const roomAudit = json(publicPath(previousRoot + "/rooms/manifest.json"));
check(roomAudit.revision === "R04" && roomAudit.rooms.length === 15, "Retained R04 room set incomplete");
const blenderCopies = json(root + "/blender-metadata-provenance.json").files;
const cadCopies = json(root + "/cad-metadata-provenance.json").files;
const exportAudit = json(root + "/manifest.json");
check(exportAudit.status === "PASS_GEOMETRY_REIMPORT_AND_EXACT_COPY_CHECKS" && exportAudit.release === "Coordinated Selected Layout R05", "Fresh GLB verification is required");
function curated(copies, file) {
  const records = copies.filter((copy) => copy.file === file);
  check(records.length === 1, "Missing/duplicate native curation record: " + file);
  const copy = records[0];
  check(copy.sourceSha256 === copy.publicSha256 && copy.serializedPrivatePathScan === "PASS" && copy.nativeSaveReopen === "PASS", "Unverified native copy: " + file);
  return copy;
}
for (const [file, key] of [["ground-floor.FCStd", "groundCad"], ["first-floor.FCStd", "firstCad"], ["selected-layout.blend", "blender"]]) {
  const url = config.downloads[key].url;
  const download = exportAudit.downloads.find((entry) => entry.file === file);
  check(download && download.url === url, "Missing native download record: " + file);
  if (key === "blender") {
    const copy = curated(blenderCopies, file);
    check(copy.transformationKind === "verified-current-design-copy" && copy.curation?.retainedGeometryUnchanged && copy.curation.materialsUnchanged, "Unverified Blender curation");
    verifyBytes(publicPath(url), { bytes: copy.publicBytes, sha256: copy.publicSha256 });
    check(download.sha256 === copy.publicSha256 && download.bytes === copy.publicBytes && exportAudit.sourceNativeSha256 === copy.publicSha256, "Blender download/provenance drift");
    continue;
  }
  const retained = previousAsset(url, previous);
  check(download.sha256 === retained.sha256 && download.bytes === retained.bytes, "Retained CAD download drift: " + file);
  const old = json(publicPath(previousRoot + "/manifest.json")).downloads.find((entry) => entry.file === file);
  check(old && old.url === url && old.sha256 === download.sha256 && old.sourceSha256 === download.sourceSha256, "Retained CAD provenance drift: " + file);
  if (key === "firstCad") check(download.retainedFrom?.release === "R04" && download.retainedFrom.releaseSha256 === previousReleaseSha256, "First-floor CAD must be attributed to R04");
}
for (const [file, key] of [["ff02-enclosure.FCStd", "freecad"], ["ff02-enclosure.step", "step"]]) {
  const copy = cadCopies.find((entry) => entry.file === file);
  check(copy && copy.sourceSha256 === copy.publicSha256 && copy.serializedPrivatePathScan === "PASS", "Unverified enclosure CAD: " + file);
  check(config.enclosure[key] === config.root + "/" + file, "Enclosure download URL drift: " + file);
  verifyBytes(publicPath(config.enclosure[key]), { bytes: copy.publicBytes, sha256: copy.publicSha256 });
  const download = exportAudit.downloads.find((entry) => entry.file === file);
  check(download && download.sha256 === copy.publicSha256 && download.bytes === copy.publicBytes, "Enclosure download record drift: " + file);
}
writeFileSync("src/data/buildingRoomCad.json", JSON.stringify(roomAudit.rooms.map((room) => ({
  id: room.id, geometryKind: room.geometryKind, solidCount: room.solidCount, provenance: room.provenanceUrl,
  downloads: { freecad: { url: room.files.freecad.url }, step: { url: room.files.step.url }, svg: { url: room.files.preview.url } }
})), null, 2) + "\n");
const retainedAssets = expectedRetainedAssets(previous);
for (const asset of retainedAssets) verifyBytes(publicPath(asset.url), asset);
const externalDownloads = expectedExternalDownloads(previous);
const files = [];
function walk(path) {
  for (const name of readdirSync(path).sort()) {
    const next = resolve(path, name);
    if (statSync(next).isDirectory()) walk(next);
    else if (next !== root + "/release.json") {
      const data = readFileSync(next);
      check(data.length < 25 * 1024 * 1024, "Hosting file limit: " + relative(root, next));
      files.push({ path: relative(root, next), bytes: data.length, sha256: hash(data) });
    }
  }
}
walk(root);
const manifest = {
  release: config.label, date: config.date, serviceRevision: "S02", floors: ["ground", "first"],
  serviceStatus: "S02 electrical and setup plan (12 September) is the current service authority; S01 counts are historical.",
  scope: "FF02 C03 steel-frame insulated-panel enclosure and lab layout, published as a proposal for review; not a structural, thermal or fabrication design and not an as-built survey or construction approval. All other rooms, the ground floor and the R04 full first-floor CAD are retained.",
  releaseConfigSha256: hash(readFileSync(configPath)), servicesSha256: hash(readFileSync("src/data/buildingRoomServices.json")),
  roomCatalogSha256: hash(readFileSync("src/data/buildingRoomCad.json")),
  retainedRelease: { url: previousRoot + "/release.json", sha256: previousReleaseSha256 },
  updatePolicy: "Regenerate only verified affected assets; preserve prior public releases and retained asset provenance. Local saves are not deployments.",
  files, retainedAssets, externalDownloads
};
writeFileSync(root + "/release.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`R05: ${files.length} new assets, ${retainedAssets.length} retained assets, ${externalDownloads.length} retained external downloads.`);
