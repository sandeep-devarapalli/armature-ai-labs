import { performance } from "node:perf_hooks";
import { cpus, release } from "node:os";
import { bengaluruEcosystem } from "../../src/data/bengaluruEcosystem.ts";
import { findEcosystemMatches, indexEcosystemListings } from "../../src/lib/ecosystemMatches.ts";

const rows = Array.from({ length: 1000 }, (_, index) => {
  const data = bengaluruEcosystem[index % bengaluruEcosystem.length];
  return { slug: `${data.slug}-${index}`, revision: 1, data: { ...data, name: index < bengaluruEcosystem.length ? data.name : `${data.name} ${index}` } };
});
const queries = ["Armature", "Avathon", "Robotics", "Synthetic Missing", "Ati Motors", "Ather Energy", "GreyOrange", "Tata", "Indian Institute of Science"].map(name => ({ name }));
queries.push({ name: "", websiteUrl: "https://www.avathon.com/" });
const index = indexEcosystemListings(rows);
for (let run = 0; run < 200; run++) findEcosystemMatches(index, queries[run % queries.length]);
const latencies = [];
let results = 0;
for (let run = 0; run < 1000; run++) {
  const start = performance.now();
  results += findEcosystemMatches(index, queries[run % queries.length]).length;
  latencies.push(performance.now() - start);
}
const preparation = [];
for (let run = 0; run < 100; run++) {
  const start = performance.now();
  indexEcosystemListings(rows);
  preparation.push(performance.now() - start);
}
const distribution = values => { values.sort((a, b) => a - b); return { p50ms: values[Math.floor(values.length * .5)], p95ms: values[Math.floor(values.length * .95)] }; };
console.log(JSON.stringify({ node: process.version, os: `${process.platform} ${release()}`, architecture: process.arch, cpu: cpus()[0].model, rows: rows.length, originalRows: bengaluruEcosystem.length, samples: latencies.length, warmup: 200, concurrency: 1, query: distribution(latencies), indexPreparation: distribution(preparation), results, scope: "Local synthetic-expanded dataset; excludes React rendering and network; not a device or production latency claim." }, null, 2));
