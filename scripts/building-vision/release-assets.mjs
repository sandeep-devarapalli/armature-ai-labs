import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const hash = (data) => createHash("sha256").update(data).digest("hex");
export const check = (condition, message) => { if (!condition) throw new Error(message); };
export const json = (path) => JSON.parse(readFileSync(path, "utf8"));
export const previousRoot = "/building-models/r03";
export const previousReleaseSha256 = "e5cd418b324c13c7a6dc7b2101fb16fef6f6a7ecb607f89346b4aac4fa4f0b6f";
export function publicPath(url) {
  check(/^\/building-models\/r0[34]\/[\w./-]+$/.test(url), "Unexpected public model URL: " + url);
  const root = resolve("public/building-models");
  const path = resolve("public" + url);
  check(path.startsWith(root + "/"), "Model path escapes public assets");
  return path;
}
export function previousRelease() {
  const bytes = readFileSync(publicPath(previousRoot + "/release.json"));
  check(hash(bytes) === previousReleaseSha256, "Immutable R03 manifest changed");
  return JSON.parse(bytes);
}
export function previousAsset(url, previous = previousRelease()) {
  const file = url.startsWith(previousRoot + "/")
    ? previous.files.find((entry) => url === previousRoot + "/" + entry.path)
    : previous.externalDownloads.find((entry) => entry.url === url);
  check(file, "Asset is not registered in immutable R03: " + url);
  return { url, bytes: file.bytes, sha256: file.sha256, sourceRelease: "R03" };
}
export function verifyBytes(path, record) {
  const data = readFileSync(path);
  check(data.length === record.bytes && hash(data) === record.sha256, "Asset byte/hash mismatch: " + path);
  return data;
}
export function expectedRetainedAssets(roomAudit) {
  const prior = previousRelease();
  const urls = new Set(["ground-floor.glb", "ground-floor.png", "ground-floor.FCStd", "ff04-cabins.png", "ff04-cad.png", "ff06-cabins.png", "ff06-cad.png"].map((file) => previousRoot + "/" + file));
  for (const room of roomAudit.rooms.filter((entry) => entry.id !== "FF-03")) {
    for (const asset of Object.values(room.files)) if (asset.url.startsWith("/")) urls.add(asset.url);
    urls.add(room.provenanceUrl);
    urls.add(`${previousRoot}/rooms/${room.id}-README.md`);
  }
  return [...urls].sort().map((url) => previousAsset(url, prior));
}
