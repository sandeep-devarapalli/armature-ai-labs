import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Confirms the published S02 electrical plan files on the live site match the reviewed bytes.
const base = new URL(process.argv[2] ?? "https://armatureailabs.com");
const active = JSON.parse(await readFile("src/data/buildingElectricalS02.json", "utf8"));
const local = await readFile(resolve(`public${active.root}/release.json`));
const manifest = JSON.parse(local);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (manifest.release !== active.revision) throw new Error("Active electrical plan revision and manifest differ");

async function verify(url, expected) {
  let bytes = 0;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "Cache-Control": "no-cache" } });
    if (response.status !== 200 || !response.body) throw new Error(`HTTP ${response.status}`);
    const digest = createHash("sha256");
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > expected.bytes) throw new Error("Unexpected extra bytes");
      digest.update(chunk);
    }
    if (bytes !== expected.bytes || digest.digest("hex") !== expected.sha256) throw new Error("Published file differs from reviewed bytes");
  } catch (error) {
    throw new Error(`Download verification failed for ${url} (${bytes}/${expected.bytes} bytes): ${error.message}`, { cause: error });
  }
}

const assets = [
  { url: new URL(`${active.root}/release.json`, base), bytes: local.length, sha256: hash(local) },
  ...manifest.files.map((file) => ({ url: new URL(`${active.root}/${file.path}`, base), ...file }))
];
let next = 0;
await Promise.all(Array.from({ length: Math.min(4, assets.length) }, async () => {
  while (next < assets.length) {
    const asset = assets[next++];
    await verify(asset.url, asset);
  }
}));
console.log(`${active.revision}: verified manifest and ${assets.length} published electrical plan files by byte count and SHA-256 at ${base.origin}.`);
