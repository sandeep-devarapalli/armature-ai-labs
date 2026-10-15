import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [input, source, output] = process.argv.slice(2);
if (!input || !source || !output) throw Error('Usage: node scripts/benchmark-talent-search.mjs DATA_JSON SEARCH_TS OUTPUT_JSON');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'talent-search-benchmark-'));
const compiled = path.join(scratch, 'search.mjs');
const raw=fs.readFileSync(input);const people=JSON.parse(raw);
const project={title:'UAV sensor board',summary:'Drone telemetry and onboard sensing',contribution:'Implemented embedded C++ firmware and SPI sampling for drone navigation',skills:['Embedded','C++','SPI'],evidenceUrl:'https://example.org/synthetic'};
const cases={original:people,syntheticPortfolioOverlay:people.map((p,i)=>i%10===0?{...p,portfolioProjects:[project,{...project,title:'Sensor validation',contribution:'Built a hardware validation harness'}]}:p)};
const queries=['embedded drone','firmware','SLAM navigation','perception','unmatchedterm',''];
const quant=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
const results={runtime:process.version,platform:`${os.platform()} ${os.arch()} ${os.release()}`,records:people.length,inputSha256:crypto.createHash('sha256').update(raw).digest('hex'),concurrency:1,warmups:10,rounds:30,cases:{}};
await build({entryPoints:[source],outfile:compiled,bundle:true,platform:'node',format:'esm',minify:true});
const {buildDirectoryIndex,searchDirectory}=await import(pathToFileURL(compiled).href);
for(const [name,data]of Object.entries(cases)){
 const builds=[];let index;for(let i=0;i<6;i++){const t=performance.now();index=buildDirectoryIndex(data);if(i)builds.push(performance.now()-t);}
 const query=q=>({query:q,location:'',category:[],company:'',sort:'relevance'});
 for(let i=0;i<10;i++)for(const q of queries)searchDirectory(index,query(q));
 const timings=[];for(let i=0;i<30;i++)for(const q of queries){const t=performance.now();searchDirectory(index,query(q));timings.push(performance.now()-t);}
 results.cases[name]={indexMedianMs:quant(builds,.5),indexMaxMs:Math.max(...builds),searchMedianMs:quant(timings,.5),searchP95Ms:quant(timings,.95),resultCounts:queries.map(q=>searchDirectory(index,query(q)).length),resultIdentityHash:crypto.createHash('sha256').update(JSON.stringify(queries.map(q=>searchDirectory(index,query(q)).map(x=>x.person.id)))).digest('hex')};
}
fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));

fs.rmSync(scratch, { recursive: true });
