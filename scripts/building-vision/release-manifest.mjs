import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve("public/building-models/r01");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const metadataCopies = ["cad-metadata-provenance.json", "blender-metadata-provenance.json"]
  .flatMap((file) => JSON.parse(readFileSync(`${root}/${file}`, "utf8")).files);
const exportAudit = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
for (const copy of metadataCopies) {
  const data = readFileSync(`${root}/${copy.file}`);
  if (hash(data) !== copy.publicSha256 || !copy.metadataOnly) throw new Error(`Unverified metadata copy: ${copy.file}`);
  const download = exportAudit.downloads.find((entry) => entry.url.endsWith(`/${copy.file}`));
  if (download) Object.assign(download, {
    bytes: data.length, sha256: copy.publicSha256, sourceSha256: copy.sourceSha256,
    exactNativeCopy: false, metadataSanitized: true
  });
  const floor = exportAudit.floors.find((entry) => `${entry.id}.png` === copy.file);
  if (floor) Object.assign(floor, { sourcePreviewSha256: copy.sourceSha256, previewSha256: copy.publicSha256 });
}
writeFileSync(`${root}/manifest.json`, `${JSON.stringify(exportAudit, null, 2)}\n`);
const files = [];
function walk(path) {
  for (const name of readdirSync(path).sort()) {
    const next = resolve(path, name);
    if (statSync(next).isDirectory()) walk(next);
    else if (next !== `${root}/release.json`) {
      const data = readFileSync(next);
      files.push({ path: relative(root, next), bytes: data.length, sha256: hash(data) });
    }
  }
}
walk(root);
const roomAudit = JSON.parse(readFileSync(`${root}/rooms/manifest.json`, "utf8"));
writeFileSync("src/data/buildingRoomCad.json", `${JSON.stringify(roomAudit.rooms.map(({ id, geometryKind, solidCount }) => ({ id, geometryKind, solidCount })), null, 2)}\n`);
const manifest = {
  release: "R01", date: "2026-09-10", serviceRevision: "S01", floors: ["ground", "first"],
  scope: "Latest verified coordinated release; not an as-built survey or an issued construction design.",
  servicesSha256: hash(readFileSync("src/data/buildingRoomServices.json")),
  roomCatalogSha256: hash(readFileSync("src/data/buildingRoomCad.json")),
  updatePolicy: "Regenerate floor GLBs and all affected room extracts from a newly verified native release; review service data and validate before publishing. Local saves are not automatic public deployments.",
  files
};
writeFileSync(`${root}/release.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Recorded ${files.length} release assets.`);
