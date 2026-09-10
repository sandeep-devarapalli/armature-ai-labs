import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("public/building-vision/model-aligned-r01");
const manifestPath = `${root}/provenance.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
function chunks(data) {
  const result = [];
  for (let offset = 8; offset < data.length;) {
    const end = offset + data.readUInt32BE(offset) + 12;
    if (end > data.length) throw new Error("Truncated PNG");
    result.push({ type: data.toString("ascii", offset + 4, offset + 8), bytes: data.subarray(offset, end) });
    offset = end;
  }
  return result;
}
const pixels = (parts) => Buffer.concat(parts.filter((part) => ["IHDR", "PLTE", "tRNS", "IDAT"].includes(part.type)).map((part) => part.bytes));
for (const entry of manifest.images) {
  const path = resolve(root, entry.file);
  if (!path.startsWith(`${root}/`)) throw new Error("Image path escapes release");
  const original = readFileSync(path);
  if (hash(original) !== entry.sha256) throw new Error(`Unexpected input: ${entry.file}`);
  const parts = chunks(original);
  const retained = parts.filter((part) => !["tEXt", "iTXt", "zTXt"].includes(part.type));
  const output = Buffer.concat([original.subarray(0, 8), ...retained.map((part) => part.bytes)]);
  if (!pixels(parts).equals(pixels(chunks(output)))) throw new Error("Pixel chunks changed");
  entry.sourceImageSha256 ??= entry.sha256;
  entry.sha256 = hash(output);
  entry.pixelChunksSha256 = hash(pixels(parts));
  entry.metadataSanitization = "PNG text chunks removed; original pixel and color-profile chunks preserved byte-for-byte";
  writeFileSync(path, output);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Sanitized metadata from ${manifest.images.length} PNGs without changing pixel data.`);
