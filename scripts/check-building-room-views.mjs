import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const json = path => JSON.parse(readFileSync(path, "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const views = json("src/data/buildingRoomViews.json");
const rooms = json("src/data/buildingRoomServices.json");
const release = json("src/data/buildingModelRelease.json");
const prefix = "/building-vision/room-views-r01";
const expected = ["GF-01", "GF-02", "GF-03", "GF-04", "GF-06", "GF-07", "GF-08", "GF-09", "GF-10", "FF-01", "FF-05"];
const provenance = json(`public${prefix}/provenance.json`);
assert.deepEqual(views.map(view => view.id).sort(), [...expected].sort());
assert.deepEqual(provenance.images.map(image => image.id).sort(), [...expected].sort());
assert.equal(provenance.status, "PASS");
assert.equal(provenance.revision, "RV01");
assert.equal(provenance.sourceModelRelease, release.label);
assert.equal(provenance.sourceSaved, false);
assert.equal(provenance.aiGenerated, false);
assert.equal(provenance.originalAndFrozenBytesUnchanged, true);
assert.equal(provenance.geometryMaterialsUVPlacementsAndMembershipUnchanged, true);
assert.equal(provenance.objectsCompared, 3484);
assert.equal(provenance.beforeObjectDigest, provenance.afterObjectDigest);
assert.equal(provenance.sourceNativeSha256, hash(readFileSync(`public${release.downloads.blender.url}`)));
assert(!/\/Users\/|\/private\/tmp\/|\/var\/folders\//.test(JSON.stringify(provenance)));
assert.equal(rooms.length, 15);
for (const room of rooms) {
  const image = views.find(view => view.id === room.id)?.image ?? release.roomPreviews[room.id]?.blender ?? (release.enclosure.roomId === room.id ? release.enclosure.blender : null);
  assert(image && existsSync(`public${image}`), `Missing room preview: ${room.id}`);
}
for (const base of ["public", ...(existsSync("dist") ? ["dist"] : [])]) {
  assert.deepEqual(readdirSync(`${base}${prefix}`).sort(), [...expected.map(id => `${id}.png`), "provenance.json"].sort());
  assert.equal(hash(readFileSync(`${base}${prefix}/provenance.json`)), hash(readFileSync(`public${prefix}/provenance.json`)));
  for (const view of views) {
    assert.equal(view.image, `${prefix}/${view.id}.png`);
    assert.equal(view.sourceSha256, provenance.sourceNativeSha256);
    const entry = provenance.images.find(image => image.id === view.id);
    assert.equal(entry.file, `${view.id}.png`);
    assert.equal(entry.floorObject, `${view.id} | floor`);
    assert.equal(entry.sourceScene, view.id.startsWith("GF") ? "Ground floor - selected current" : "First floor - R06 FF02 glass enclosure");
    assert.equal(entry.cameraOnly, true);
    assert.deepEqual(entry.objectsHiddenForRender, []);
    assert.equal(entry.neighbouringContextRetained, true);
    const bytes = readFileSync(`${base}${view.image}`);
    assert.equal(hash(bytes), entry.sha256, `Image hash drift: ${view.id}`);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), view.width);
    assert.equal(bytes.readUInt32BE(20), view.height);
    assert.equal(view.width, entry.width);
    assert.equal(view.height, entry.height);
    for (let offset = 8; offset < bytes.length;) {
      assert(offset + 12 <= bytes.length);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      assert(!["tEXt", "iTXt", "zTXt"].includes(type), `PNG metadata in ${view.id}`);
      offset += bytes.readUInt32BE(offset) + 12;
      assert(offset <= bytes.length);
    }
    assert.equal(hash(bytes.subarray(8)), entry.retainedChunksSha256);
  }
}
console.log("Room views PASS: 11 source-backed additions, all 15 rooms covered, unchanged R06 native source.");

if (process.argv[2] === "--live") {
  const origin = new URL(process.argv[3] ?? "https://armatureailabs.com");
  for (const path of [`${prefix}/provenance.json`, ...views.map(view => view.image)]) {
    const response = await fetch(new URL(path, origin), { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, `Live room asset unavailable: ${path}`);
    assert((response.headers.get("content-type") ?? "").includes(path.endsWith(".png") ? "image/png" : "application/json"), `Wrong live content type: ${path}`);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync(`public${path}`)), `Live room asset mismatch: ${path}`);
  }
  console.log(`Live room views verified: 11 PNGs and provenance match at ${origin.origin}.`);
}
