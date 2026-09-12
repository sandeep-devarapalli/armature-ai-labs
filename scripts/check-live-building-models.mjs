import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = new URL(process.argv[2] ?? "https://armatureailabs.com");
const active = JSON.parse(await readFile("src/data/buildingModelRelease.json", "utf8"));
const local = await readFile(resolve(`public${active.root}/release.json`));
const manifest = JSON.parse(local);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (manifest.release !== active.label) throw new Error("Active model release and manifest differ");

async function verify(url, expected) {
  let bytes = 0;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { "Cache-Control": "no-cache" }
    });
    if (response.status !== 200 || !response.body) throw new Error(`HTTP ${response.status}`);
    const digest = createHash("sha256");
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > expected.bytes) throw new Error("Unexpected extra bytes");
      digest.update(chunk);
    }
    if (bytes !== expected.bytes || digest.digest("hex") !== expected.sha256) {
      throw new Error("Published file differs from reviewed bytes");
    }
  } catch (error) {
    throw new Error(`Download verification failed for ${url} (${bytes}/${expected.bytes} bytes): ${error.message}`, { cause: error });
  }
}

await verify(new URL(`${active.root}/release.json`, base), { bytes: local.length, sha256: hash(local) });
const assets = manifest.files.map((file) => ({
  url: new URL(`${active.root}/${file.path}`, base), ...file
}));
const retainedManifest = await readFile(resolve(`public${manifest.retainedRelease.url}`));
if (hash(retainedManifest) !== manifest.retainedRelease.sha256) throw new Error("Retained release manifest drift");
assets.push({ url: new URL(manifest.retainedRelease.url, base), bytes: retainedManifest.length, sha256: manifest.retainedRelease.sha256 });
for (const asset of manifest.retainedAssets) {
  const expectedRoot = { R03: "/building-models/r03/", R04: "/building-models/r04/", R05: "/building-models/r05/" }[asset.sourceRelease];
  if (!expectedRoot || !asset.url.startsWith(expectedRoot)) throw new Error("Unexpected retained asset URL");
  assets.push({ url: new URL(asset.url, base), bytes: asset.bytes, sha256: asset.sha256 });
}
for (const entry of Object.values(active.downloads)) {
  if (!entry.url.startsWith("https://")) continue;
  const download = manifest.externalDownloads?.find((file) => file.url === entry.url);
  if (!download) throw new Error(`External download is absent from the release manifest: ${entry.url}`);
}
for (const download of manifest.externalDownloads ?? []) {
  const revision = download.sourceRelease ? download.sourceRelease.toLowerCase() : active.revision;
  if (!download.url.startsWith(`https://github.com/sandeep-devarapalli/armature-ai-labs/releases/download/building-models-${revision}/`)) {
    throw new Error("Unexpected external download host or release");
  }
  assets.push({ url: new URL(download.url), bytes: download.bytes, sha256: download.sha256 });
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(4, assets.length) }, async () => {
  while (next < assets.length) {
    const asset = assets[next++];
    await verify(asset.url, asset);
  }
}));
console.log(`${active.label}: verified manifest and ${assets.length} published files by byte count and SHA-256 at ${base.origin}.`);
