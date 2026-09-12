import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const hash = (data) => createHash("sha256").update(data).digest("hex");
export const check = (condition, message) => { if (!condition) throw new Error(message); };
export const json = (path) => JSON.parse(readFileSync(path, "utf8"));
// R06 preserves the complete immutable R05/R04/R03 asset chain.
export const previousRoot = "/building-models/r05";
export const previousReleaseSha256 = "b67ba614619c1761b39b538ea475395355d056b93fd13e97345f91c462c4c00e";
export const earlierRoot = "/building-models/r04";
export const earlierReleaseSha256 = "5751d4c478275dc9e0195aff2f570d900e72d9f778d88f711b817ac223e32df0";
export const retainedRoomsUrl = earlierRoot + "/rooms/manifest.json";
export function publicPath(url) {
  check(/^\/building-models\/r0[3456]\/[\w./-]+$/.test(url), "Unexpected public model URL: " + url);
  const root = resolve("public/building-models");
  const path = resolve("public" + url);
  check(path.startsWith(root + "/"), "Model path escapes public assets");
  return path;
}
export function previousRelease() {
  const bytes = readFileSync(publicPath(previousRoot + "/release.json"));
  check(hash(bytes) === previousReleaseSha256, "Immutable R05 manifest changed");
  const earlier = readFileSync(publicPath(earlierRoot + "/release.json"));
  check(hash(earlier) === earlierReleaseSha256, "Immutable R04 manifest changed");
  const original = readFileSync(publicPath("/building-models/r03/release.json"));
  check(hash(original) === "e5cd418b324c13c7a6dc7b2101fb16fef6f6a7ecb607f89346b4aac4fa4f0b6f", "Immutable R03 manifest changed");
  const previous = JSON.parse(bytes);
  check(previous.retainedRelease.url === earlierRoot + "/release.json" && previous.retainedRelease.sha256 === earlierReleaseSha256, "R05 no longer points at the immutable R04 manifest");
  return previous;
}
export function previousAsset(url, previous = previousRelease()) {
  if (url.startsWith(previousRoot + "/")) {
    const file = previous.files.find((entry) => url === previousRoot + "/" + entry.path);
    check(file, "Asset is not registered in immutable R05: " + url);
    return { url, bytes: file.bytes, sha256: file.sha256, sourceRelease: "R05" };
  }
  const retained = previous.retainedAssets.find((entry) => entry.url === url) ?? previous.externalDownloads.find((entry) => entry.url === url);
  check(retained, "Asset is not registered in immutable R05 or its retained assets: " + url);
  return { url, bytes: retained.bytes, sha256: retained.sha256, sourceRelease: retained.sourceRelease ?? "R05" };
}
export function verifyBytes(path, record) {
  const data = readFileSync(path);
  check(data.length === record.bytes && hash(data) === record.sha256, "Asset byte/hash mismatch: " + path);
  return data;
}
export function expectedRetainedAssets(previous = previousRelease()) {
  const own = previous.files.map((file) => ({ url: previousRoot + "/" + file.path, bytes: file.bytes, sha256: file.sha256, sourceRelease: "R05" }));
  const earlier = previous.retainedAssets.map((asset) => ({ url: asset.url, bytes: asset.bytes, sha256: asset.sha256, sourceRelease: asset.sourceRelease }));
  const all = [...own, ...earlier].sort((a, b) => a.url.localeCompare(b.url));
  check(new Set(all.map((asset) => asset.url)).size === all.length, "Duplicate retained asset URL");
  return all;
}
export function expectedExternalDownloads(previous = previousRelease(), current = []) {
  const retained = previous.externalDownloads.map((asset) => ({ file: asset.file, url: asset.url, bytes: asset.bytes, sha256: asset.sha256, sourceRelease: asset.sourceRelease ?? "R05" }));
  const added = current.filter((asset) => asset.url.startsWith("https://") && !retained.some((old) => old.url === asset.url));
  for (const asset of added) {
    check(asset.file === "first-floor.FCStd" && asset.url === "https://github.com/sandeep-devarapalli/armature-ai-labs/releases/download/building-models-r06/first-floor.FCStd", "Unexpected new external download");
    check(asset.remoteVerification?.status === "PASS" && asset.remoteVerification.bytes === asset.bytes && asset.remoteVerification.sha256 === asset.sha256, "New external CAD needs downloaded-byte verification");
  }
  return [...retained, ...added.map((asset) => ({ file: asset.file, url: asset.url, bytes: asset.bytes, sha256: asset.sha256, sourceRelease: "R06" }))];
}
