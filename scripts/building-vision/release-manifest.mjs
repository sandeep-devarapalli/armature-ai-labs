import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { check, expectedRetainedAssets, hash, json, previousAsset, previousRelease, previousReleaseSha256, previousRoot, publicPath, verifyBytes } from "./release-assets.mjs";

const configPath = "src/data/buildingModelRelease.json";
const config = json(configPath);
check(config.revision === "r04" && config.label === "R04" && config.root === "/building-models/r04", "Active release mismatch");
const root = publicPath(config.root + "/release.json").replace(/\/release.json$/, "");
const previous = previousRelease();
const roomAudit = json(root + "/rooms/manifest.json");
check(roomAudit.revision === "R04" && roomAudit.rooms.length === 15 && JSON.stringify(roomAudit.changedRoomIds) === '["FF-03"]', "Incomplete FF03-only room release");
const metadataCopies = ["cad-metadata-provenance.json", "blender-metadata-provenance.json"].flatMap((file) => json(root + "/" + file).files);
const exportAudit = json(root + "/manifest.json");
check(exportAudit.status === "PASS_GEOMETRY_REIMPORT_AND_EXACT_COPY_CHECKS", "Fresh GLB verification is required");
const externalDownloads = [];
let remoteEvidence;
function external(file, url, bytes, sha256) {
  if (url.includes("/building-models-r03/")) {
    const retained = previousAsset(url, previous);
    check(retained.bytes === bytes && retained.sha256 === sha256, "Retained external bytes drift");
    externalDownloads.push({ file, ...retained });
    return;
  }
  check(url === `https://github.com/sandeep-devarapalli/armature-ai-labs/releases/download/building-models-r04/${file.replace("rooms/", "")}`, "Unapproved external destination");
  remoteEvidence ??= json(root + "/external-download-verification.json");
  const verified = remoteEvidence.files.find((entry) => entry.file === file && entry.url === url);
  check(verified?.status === "PASS" && verified.method === "download-sha256" && Number.isFinite(Date.parse(verified.checkedAt)) && verified.sha256 === sha256 && verified.bytes === bytes, "External download is unverified: " + file);
  externalDownloads.push({ file, url, bytes, sha256 });
}
for (const [file, key] of [["ground-floor.FCStd", "groundCad"], ["first-floor.FCStd", "firstCad"], ["selected-layout.blend", "blender"]]) {
  const url = config.downloads[key].url;
  const download = exportAudit.downloads.find((entry) => entry.file === file || entry.url.endsWith("/" + file));
  check(download, "Missing native download record: " + file);
  if (key === "groundCad") {
    const old = json(publicPath(previousRoot + "/manifest.json")).downloads.find((entry) => entry.file === file);
    check(url === old.url && download.sha256 === old.sha256 && download.sourceSha256 === old.sourceSha256, "Retained ground CAD provenance drift");
    Object.assign(download, old, { retainedFrom: { release: "R03", releaseSha256: previousReleaseSha256 } });
    continue;
  }
  const copies = metadataCopies.filter((copy) => copy.file === file);
  check(copies.length === 1, "Missing/duplicate native curation record: " + file);
  const copy = copies[0], c = copy.curation;
  check(copy.transformationKind === "verified-current-design-copy" && copy.nativeSaveReopen === "PASS" &&
    copy.sourceSha256 === copy.publicSha256 && copy.serializedPrivatePathScan === "PASS" &&
    c?.retainedGeometryUnchanged && c.materialsUnchanged && c.selectedMembershipVerified && c.reviewViewsVerified &&
    Array.isArray(c.displayChanges) && Array.isArray(c.dependencyDisclosure), "Unverified native curation: " + file);
  if (url.startsWith("/")) verifyBytes(publicPath(url), { bytes: copy.publicBytes, sha256: copy.publicSha256 });
  else external(file, url, copy.publicBytes, copy.publicSha256);
  Object.assign(download, { file, url, bytes: copy.publicBytes, sha256: copy.publicSha256, sourceSha256: copy.sourceSha256,
    exactNativeCopy: true, copyBasis: "verified-current-design-source", serializedPrivatePathScan: "PASS", transformationKind: copy.transformationKind });
}
writeFileSync(root + "/manifest.json", JSON.stringify(exportAudit, null, 2) + "\n");
for (const room of roomAudit.rooms) for (const asset of Object.values(room.files)) {
  if (!asset.url.startsWith("/")) external("rooms/" + asset.filename, asset.url, asset.bytes, asset.sha256);
}
check(new Set(externalDownloads.map((asset) => asset.url)).size === externalDownloads.length, "Duplicate external asset");
writeFileSync("src/data/buildingRoomCad.json", JSON.stringify(roomAudit.rooms.map((room) => ({
  id: room.id, geometryKind: room.geometryKind, solidCount: room.solidCount, provenance: room.provenanceUrl,
  downloads: { freecad: { url: room.files.freecad.url }, step: { url: room.files.step.url }, svg: { url: room.files.preview.url } }
})), null, 2) + "\n");
const retainedAssets = expectedRetainedAssets(roomAudit);
for (const asset of retainedAssets) verifyBytes(publicPath(asset.url), asset);
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
  release: config.label, date: config.date, serviceRevision: "S01", floors: ["ground", "first"],
  serviceStatus: "Legacy discussion counts; not recalculated or approved for R04.",
  scope: "FF03 four-person sliding entrance only; retained designs are planning references, not an as-built survey or construction approval.",
  releaseConfigSha256: hash(readFileSync(configPath)), servicesSha256: hash(readFileSync("src/data/buildingRoomServices.json")),
  roomCatalogSha256: hash(readFileSync("src/data/buildingRoomCad.json")),
  retainedRelease: { url: previousRoot + "/release.json", sha256: previousReleaseSha256 },
  updatePolicy: "Regenerate only verified affected assets; preserve prior public releases and retained asset provenance. Local saves are not deployments.",
  files, retainedAssets, externalDownloads
};
writeFileSync(root + "/release.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`R04: ${files.length} new assets, ${retainedAssets.length} retained assets, ${externalDownloads.length} verified external downloads.`);
