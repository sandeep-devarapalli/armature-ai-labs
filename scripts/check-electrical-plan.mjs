import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { check, hash, json } from "./building-vision/release-assets.mjs";

// S02 electrical and setup plan: the published assets must match the reviewed manifest byte for byte,
// carry no private path metadata, and every URL the page uses must be registered.
const validHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const configPath = "src/data/buildingElectricalS02.json";
const config = json(configPath);
check(config.revision === "S02" && config.root === "/building-models/s02", "Active electrical plan configuration mismatch");
const root = resolve("public" + config.root);
function local(file) {
  const path = resolve(root, file);
  check(path.startsWith(root + "/"), "Manifest path escapes S02");
  return path;
}
const manifest = json(local("release.json"));
check(manifest.release === "S02" && manifest.root === config.root && manifest.date === config.date, "S02 manifest/frontend drift");
check(manifest.sources.groundFloorCad.release === "R03" && manifest.sources.groundFloorCad.sha256 === "3282f8e42579b73b24f097e8b65bad672d5bc2b4dc8d46c486eb163780cff0df", "S02 ground CAD source must be the published R03 file");
check(manifest.sources.firstFloorCad.release === "R04" && manifest.sources.firstFloorCad.sha256 === "ad1397f6b855e309b0093e64baf582db559be5b4ebab1e22ef3f428a3b77d5e9", "S02 first CAD source must be the published R04 file");
check(/not a certified/.test(manifest.status) && /AI-generated imagery: none/.test(manifest.method), "S02 scope statement missing");
check(new Set(manifest.files.map((file) => file.path)).size === manifest.files.length && manifest.files.length === 12, "S02 manifest must register exactly twelve files");

const urls = new Set(manifest.files.map((file) => config.root + "/" + file.path));
const used = [
  ...Object.values(config.plans).flatMap((plan) => [plan.svg, plan.png]),
  ...Object.values(config.downloads)
];
for (const url of used) check(url === config.root + "/release.json" || urls.has(url), "Unregistered electrical plan asset: " + url);
for (const [floor, plan] of Object.entries(config.plans)) {
  check(plan.svg === `${config.root}/${floor}-floor-electrical.svg` && plan.png === `${config.root}/${floor}-floor-electrical.png`, "Electrical plan drawing URL drift: " + floor);
  check(Number.isInteger(plan.width) && Number.isInteger(plan.height) && plan.width > 0 && plan.height > 0, "Electrical plan drawing dimensions missing: " + floor);
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const file of manifest.files) {
  check(validHash(file.sha256) && Number.isInteger(file.bytes), "Invalid S02 manifest entry: " + file.path);
  const data = readFileSync(local(file.path));
  check(data.length === file.bytes && hash(data) === file.sha256, "S02 asset byte/hash mismatch: " + file.path);
  check(data.length < 25 * 1024 * 1024, "Pages single-file limit exceeded: " + file.path);
  if (file.path.endsWith(".FCStd")) check(data.toString("ascii", 0, 2) === "PK", "Invalid FreeCAD archive: " + file.path);
  if (file.path.endsWith(".step")) check(data.toString("ascii", 0, 9) === "ISO-10303", "Invalid STEP file: " + file.path);
  if (/\.(json|svg|md|step)$/.test(file.path)) check(!["/Users/", "/private/tmp/", "/var/folders/", "/home/"].some((token) => data.includes(Buffer.from(token))), "Private path in public S02 file: " + file.path);
  if (file.path.endsWith(".png")) {
    check(data.subarray(0, 8).equals(pngSignature), "Invalid PNG: " + file.path);
    for (let offset = 8; offset < data.length;) {
      const end = offset + data.readUInt32BE(offset) + 12;
      check(end <= data.length && !["tEXt", "iTXt", "zTXt"].includes(data.toString("ascii", offset + 4, offset + 8)), "Unreviewed PNG metadata: " + file.path);
      offset = end;
    }
    const floor = file.path.startsWith("ground") ? "ground" : "first";
    check(data.readUInt32BE(16) === config.plans[floor].width * 1.5 && data.readUInt32BE(20) === config.plans[floor].height * 1.5, "Electrical plan PNG dimensions drift: " + file.path);
  }
  if (file.path.endsWith(".svg")) {
    const floor = file.path.startsWith("ground") ? "ground" : "first";
    const header = data.toString("utf8", 0, 200);
    check(header.includes(`width="${config.plans[floor].width}" height="${config.plans[floor].height}"`), "Electrical plan SVG dimensions drift: " + file.path);
    check(!/<script|<image|href="http/i.test(data.toString("utf8")), "Electrical plan SVG must be self-contained vector only: " + file.path);
  }
}
for (const name of readdirSync(root)) {
  check(!statSync(resolve(root, name)).isDirectory() && (name === "release.json" || manifest.files.some((file) => file.path === relative(root, resolve(root, name)))), "Unregistered S02 file: " + name);
}
const reopen = json(local("fresh-reopen.json"));
const reopened = Object.values(reopen.documents);
check(reopen.revision === "S02" && reopen.nativeSaveReopen === "PASS" && reopened.length === 2, "S02 native fresh reopen evidence missing");
for (const doc of reopened) {
  const native = manifest.files.find((file) => file.sha256 === doc.fcstd_sha256), step = manifest.files.find((file) => file.sha256 === doc.step_sha256);
  check(native?.path.endsWith(".FCStd") && native.bytes === doc.bytes && step?.path.endsWith(".step") && step.bytes === doc.step_bytes && doc.invalid.length === 0 && doc.symbols > 0, "S02 fresh reopen record is stale: " + doc.file);
}

// Page data must add up to the published schedule.
const schedule = json(local("schedule.json"));
const ids = ["GF-01", "GF-02", "GF-03", "GF-04", "GF-06", "GF-07", "GF-08", "GF-09", "GF-10", "FF-01", "FF-02", "FF-03", "FF-04", "FF-05", "FF-06"];
check(JSON.stringify(config.rooms.map((room) => room.id)) === JSON.stringify(ids) && JSON.stringify(schedule.rooms.map((room) => room.id)) === JSON.stringify(ids), "S02 room list drift");
const sum = (key) => config.rooms.reduce((total, room) => total + room[key], 0);
check(sum("sockets6") === config.totals.sockets6 && sum("sockets16") === config.totals.sockets16 && sum("lights") === config.totals.luminaires && sum("fans") === config.totals.fans && sum("exhaust") === config.totals.exhaust &&
  config.rooms.reduce((total, room) => total + room.ac.length, 0) === config.totals.acUnits, "S02 totals do not match the room schedule");
for (const room of config.rooms) {
  const source = schedule.rooms.find((entry) => entry.id === room.id);
  check(room.floor === (room.id.startsWith("GF") ? "GF" : "FF") && source.sockets6 === room.sockets6 && source.sockets16 === room.sockets16 && source.lights === room.lights &&
    source.fans === room.fans && source.exhaust === room.exhaust && JSON.stringify(source.ac_units) === JSON.stringify(room.ac) && source.connected_w === room.connectedW && source.typical_w === room.typicalW, "S02 page room drifts from schedule: " + room.id);
}
check(config.cameras.length === config.totals.cameras && config.accessDoors.length === config.totals.accessDoors && config.accessDoors.filter((door) => door.floor === "GF").length >= 3 && config.accessDoors.filter((door) => door.floor === "FF").length >= 3, "S02 cameras/access doors drift (at least three access doors per floor)");
check(Math.abs(config.totals.connectedKw - schedule.scenarios.connected_kw) < 0.005 && config.scenarios.length === 4 && config.scenarios[0].kw === schedule.scenarios.design_25.total_kw && config.scenarios[0].kw <= 8, "S02 design case must stay at or below 8 kW");
for (const scenario of config.scenarios.slice(0, 3)) check(scenario.kw <= 10.7, "S02 published stress case exceeds the reconciled limit: " + scenario.key);
check(config.ups.rating_kva === 3 && config.ups.backup_h === 2 && config.inverters.GF && config.inverters.FF, "S02 backup power decisions drift");
check(config.rules.length >= 5 && /not a certified/i.test(config.boundary), "S02 house rules or boundary statement missing");
console.log(`S02 verified: ${manifest.files.length} published electrical plan files, ${config.rooms.length} rooms, ${config.totals.sockets6} × 6 A and ${config.totals.sockets16} × 16 A points, design case ${config.scenarios[0].kw} kW.`);
