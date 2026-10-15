import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
const source='supabase_db_armature-equipment-wishlist-check';
const name=`armature-network-replay-${Date.now()}`;
const out=path.join('/private/tmp',name);fs.mkdirSync(out);
const log=fs.openSync(path.join(out,'replay.log'),'w');
function docker(args,input){return execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:64*1024*1024,timeout:300000});}
function sql(text){return docker(['exec','-i','-e','PGPASSWORD=postgres',name,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],text);}
const image=docker(['inspect','--format','{{.Config.Image}}',source]).trim();
// Schema only: no accounts, credentials, application records or running production service.
const base=docker(['exec','-e','PGPASSWORD=postgres',source,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--section=pre-data','--schema=auth','--schema=storage','--no-owner','--no-privileges']);
const post=docker(['exec','-e','PGPASSWORD=postgres',source,'pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--section=post-data','--schema=auth','--schema=storage','--no-owner','--no-privileges']);
const constraints=post.split(/(?=^-- Name: )/m).filter(section=>/; Type: (CONSTRAINT|FK CONSTRAINT|INDEX);/.test(section.split('\n')[0])).join('\n');
fs.writeFileSync(path.join(out,'platform-schema.sql'),base);
console.log(`Fresh isolated container ${name}; evidence ${out}`);
try {
 docker(['run','-d','--pull','never','--name',name,'--network','none','-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres',image,'postgres','-c','shared_preload_libraries=pg_stat_statements,pg_cron,pg_net','-c','cron.database_name=postgres','-c','cron.launch_active_jobs=off']);
 let ready=false;
 for(let n=0;n<60;n++){try{if(!docker(['exec',name,'cat','/proc/1/comm']).includes('postgres'))throw new Error('Bootstrap still running');sql('select 1;');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}
 if(!ready)throw new Error('Fresh database did not start');
 fs.writeSync(log,sql('drop extension if exists pg_graphql cascade; drop schema if exists auth cascade; drop schema if exists storage cascade;\n'+base+'\n'+constraints+'\ngrant usage on schema auth to anon,authenticated,service_role;'));
 const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const file of migrations){fs.writeSync(log,`\nMIGRATION ${file}\n`);try{fs.writeSync(log,sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8')));}catch(error){throw new Error(`Migration ${file}: ${error.stderr||error.message}`);}}
 console.log(`Replayed ${migrations.length} migrations`);
 const tests=['talent_network','talent_profile_photos','talent_admin_edit','talent_claim_declaration','talent_profile_submissions','talent_submission_notifications','talent_notifications','talent_portfolio','market_projects','market_messages','market_message_delivery','market_file_cleanup','market_file_limit','market_operations','market_authorization','market_wakeups','market_worker_health'];
 sql('create extension if not exists pgtap with schema extensions;');
 tests.push('database/035_auth_notification_receipts','database/036_synthetic_notification_resolution');
 for(const file of tests){fs.writeSync(log,`\nTEST ${file}\n`);try{const result=sql('set search_path=public,extensions;\n'+fs.readFileSync(path.join(root,'supabase/tests',file+'.sql'),'utf8'));fs.writeSync(log,result);if(/(?:^|\n)\s*not ok \d+/m.test(result))throw new Error('pgTAP assertion failed');}catch(error){throw new Error(`Test ${file}: ${error.stderr||error.message}`);}}
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({container:name,image,network:'none',migrations,tests,status:'passed'},null,2));
 console.log(`Passed ${tests.length} SQL suites. Container retained for inspection; remove only this container with docker rm -fv ${name}`);
}catch(error){fs.writeFileSync(path.join(out,'failure.txt'),String(error));console.error(String(error));process.exitCode=1;}
finally{fs.closeSync(log);}
