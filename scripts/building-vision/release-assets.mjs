import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const hash = (data) => createHash("sha256").update(data).digest("hex");
export const check = (condition, message) => { if (!condition) throw new Error(message); };
export const json = (path) => JSON.parse(readFileSync(path, "utf8"));
// The previous publication (R04) is immutable; R05 retains every asset it published, including the R03 files R04 retained.
export const previousRoot = "/building-models/r04";
export const previousReleaseSha256 = "5751d4c478275dc9e0195aff2f570d900e72d9f778d88f711b817ac223e32df0";
export const earlierRoot = "/building-models/r03";
export const earlierReleaseSha256 = "e5cd418b324c13c7a6dc7b2101fb16fef6f6a7ecb607f89346b4aac4fa4f0b6f";
export function publicPath(url) {
  check(/^\/building-models\/r0[345]\/[\w./-]+$/.test(url), "Unexpected public model URL: " + url);
  const root = resolve("public/building-models");
  const path = resolve("public" + url);
  check(path.startsWith(root + "/"), "Model path escapes public assets");
  return path;
}
export function previousRelease() {
  const bytes = readFileSync(publicPath(previousRoot + "/release.json"));
  check(hash(bytes) === previousReleaseSha256, "Immutable R04 manifest changed");
  const earlier = readFileSync(publicPath(earlierRoot + "/release.json"));
  check(hash(earlier) === earlierReleaseSha256, "Immutable R03 manifest changed");
  const previous = JSON.parse(bytes);
  check(previous.retainedRelease.url === earlierRoot + "/release.json" && previous.retainedRelease.sha256 === earlierReleaseSha256, "R04 no longer points at the immutable R03 manifest");
  return previous;
}
export function previousAsset(url, previous = previousRelease()) {
  if (url.startsWith(previousRoot + "/")) {
    const file = previous.files.find((entry) => url === previousRoot + "/" + entry.path);
    check(file, "Asset is not registered in immutable R04: " + url);
    return { url, bytes: file.bytes, sha256: file.sha256, sourceRelease: "R04" };
  }
  const retained = previous.retainedAssets.find((entry) => entry.url === url) ?? previous.externalDownloads.find((entry) => entry.url === url);
  check(retained, "Asset is not registered in immutable R04 or its retained R03 set: " + url);
  return { url, bytes: retained.bytes, sha256: retained.sha256, sourceRelease: retained.sourceRelease ?? "R04" };
}
export function verifyBytes(path, record) {
  const data = readFileSync(path);
  check(data.length === record.bytes && hash(data) === record.sha256, "Asset byte/hash mismatch: " + path);
  return data;
}
export function expectedRetainedAssets(previous = previousRelease()) {
  const own = previous.files.map((file) => ({ url: previousRoot + "/" + file.path, bytes: file.bytes, sha256: file.sha256, sourceRelease: "R04" }));
  const earlier = previous.retainedAssets.map((asset) => ({ url: asset.url, bytes: asset.bytes, sha256: asset.sha256, sourceRelease: asset.sourceRelease }));
  const all = [...own, ...earlier].sort((a, b) => a.url.localeCompare(b.url));
  check(new Set(all.map((asset) => asset.url)).size === all.length, "Duplicate retained asset URL");
  return all;
}
export function expectedExternalDownloads(previous = previousRelease()) {
  return previous.externalDownloads.map((asset) => ({ file: asset.file, url: asset.url, bytes: asset.bytes, sha256: asset.sha256, sourceRelease: asset.sourceRelease ?? "R04" }));
}
