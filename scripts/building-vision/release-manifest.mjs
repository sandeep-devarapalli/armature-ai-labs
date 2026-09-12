import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { check, expectedExternalDownloads, expectedRetainedAssets, hash, json, previousAsset, previousRelease, previousReleaseSha256, previousRoot, publicPath, verifyBytes } from "./release-assets.mjs";

// R06: FF02 C04 glass enclosure, coordinated first-floor CAD and one updated room extract.
// Run only after the native records and new external CAD download have been reviewed.
const configPath = "src/data/buildingModelRelease.json";
const config = json(configPath);
check(config.revision === "r06" && config.label === "R06" && config.root === "/building-models/r06", "Active release mismatch");
const root = publicPath(config.root + "/release.json").replace(/\/release.json$/, "");
const previous = previousRelease();
const roomAudit = json(root + "/rooms/manifest.json");
check(roomAudit.revision === "R06" && roomAudit.rooms.length === 15 && JSON.stringify(roomAudit.changedRoomIds) === '["FF-02"]', "R06 room set incomplete");
const blenderCopies = json(root + "/blender-metadata-provenance.json").files;
const cadCopies = json(root + "/cad-metadata-provenance.json").files;
const exportAudit = json(root + "/manifest.json");
check(exportAudit.status === "PASS_GEOMETRY_REIMPORT_AND_EXACT_COPY_CHECKS" && exportAudit.release === "Coordinated Selected Layout R06", "Fresh GLB verification is required");
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
  if (key === "firstCad") {
    const copy = curated(cadCopies, file);
    check(copy.sourceBlenderSha256 === exportAudit.sourceNativeSha256 && copy.invalidShapes === 0 && copy.solids > 0, "Full-floor CAD must match the saved Blender revision");
    check(download.sha256 === copy.publicSha256 && download.bytes === copy.publicBytes && !download.retainedFrom, "New full-floor CAD download/provenance drift");
    continue;
  }
  const retained = previousAsset(url, previous);
  check(download.sha256 === retained.sha256 && download.bytes === retained.bytes, "Retained CAD download drift: " + file);
  const old = json(publicPath(previousRoot + "/manifest.json")).downloads.find((entry) => entry.file === file);
  check(old && old.url === url && old.sha256 === download.sha256 && old.sourceSha256 === download.sourceSha256, "Retained CAD provenance drift: " + file);
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
const externalDownloads = expectedExternalDownloads(previous, exportAudit.downloads);
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
  serviceStatus: "S02 remains the published electrical and setup plan and is not recalculated for the glass enclosure; S01 counts are historical and S03 is not published.",
  scope: "FF02 C04 aluminium-framed glass enclosure and glass-roof proposal with provisional solar-control film. Existing masonry, doorways, balcony, furniture and all other rooms are retained. First-floor native CAD and the FF02 extract are coordinated with the saved Blender design. Not a structural, thermal, fabrication or as-built design.",
  releaseConfigSha256: hash(readFileSync(configPath)), servicesSha256: hash(readFileSync("src/data/buildingRoomServices.json")),
  roomCatalogSha256: hash(readFileSync("src/data/buildingRoomCad.json")),
  retainedRelease: { url: previousRoot + "/release.json", sha256: previousReleaseSha256 },
  updatePolicy: "Regenerate only verified affected assets; preserve prior public releases and retained asset provenance. Local saves are not deployments.",
  files, retainedAssets, externalDownloads
};
writeFileSync(root + "/release.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`R06: ${files.length} new assets, ${retainedAssets.length} retained assets, ${externalDownloads.length} verified external downloads.`);
