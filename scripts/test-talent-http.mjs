import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const serviceDir=process.env.TALENT_LOCAL_SERVICES || '/private/tmp/talent-local-services';
const env=Object.fromEntries(fs.readFileSync(`${serviceDir}/auth.env`,'utf8').trim().split('\n').map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
if(!env.GOTRUE_DB_DATABASE_URL.includes('/armature_talent_launch_check')) throw Error('Isolated database required');
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(role){const body=`${b64({alg:'HS256',typ:'JWT'})}.${b64({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})}`;return `${body}.${crypto.createHmac('sha256',env.GOTRUE_JWT_SECRET).update(body).digest('base64url')}`;}
const service=jwt('service_role'),anon=jwt('anon');
const evidence=[];
async function request(url,token,body,method='POST',expected=200){const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text};if(r.status!==expected) throw Error(`${method} ${new URL(url).pathname}: expected${expected}, got${r.status} ${JSON.stringify(data)}`);return data;}
const rpc=(name,token,body,expected=200)=>request(`http://127.0.0.1:60423/rpc/${name}`,token,body,'POST',expected);
function check(name,value){if(!value) throw Error(name);evidence.push(name);}
const run=Date.now();const password=`Talent-${crypto.randomBytes(12).toString('hex')}!`;
const accounts={};
for(const role of ['owner','admin','other']){
 const email=`talent-${role}-${run}@example.test`;
 const user=await request('http://127.0.0.1:60422/admin/users',service,{email,password,email_confirm:true});
 const session=await request('http://127.0.0.1:60422/token?grant_type=password',anon,{email,password});
 accounts[role]={email,password,id:user.id,token:session.access_token};
 check(`${role} actual password sign-in`,Boolean(session.access_token));
}
execFileSync('docker',['exec','-e','PGPASSWORD=postgres','supabase_db_armature-equipment-wishlist-check','psql','-U','supabase_admin','-d','armature_talent_launch_check','-v','ON_ERROR_STOP=1','-c',`insert into public.staff_roles(user_id,role) values('${accounts.admin.id}','admin')`],{stdio:'pipe'});
const source=JSON.parse(fs.readFileSync(new URL('../src/features/talent/directory-data.json',import.meta.url),'utf8'));
let imported=0,skipped=0;for(let i=0;i<source.length;i+=500){const r=await rpc('talent_import_profiles',service,{records:source.slice(i,i+500)});imported+=r.inserted;skipped+=r.skipped;}
check('all 8025 source records accepted',imported+skipped===8025);
const profile={id:`http-talent-${run}`,name:'HTTP Synthetic Engineer',title:'Embedded engineer',linkedinUrl:`https://www.linkedin.com/in/http-talent-${run}`,checkedAt:'2026-10-13',skills:['C++'],location:'Bengaluru'};
check('service import', (await rpc('talent_import_profiles',service,{records:[profile]})).inserted===1);
const rows=await request(`http://127.0.0.1:60423/talent_profiles?id=eq.${profile.id}&select=*`,anon,undefined,'GET');check('anonymous reads published profile',rows.length===1);
const owner=accounts.owner.token,admin=accounts.admin.token,other=accounts.other.token;
const id=await rpc('talent_submit_request',owner,{profile_id:profile.id,kind:'claim',evidence:'Synthetic ownership evidence for HTTP integration test',base_revision:1});
check('pending claim grants no owner rights',!(await rpc('talent_my_status',owner,{profile_id:profile.id})).owner);
await rpc('talent_update_profile',owner,{profile_id:profile.id,expected_revision:1,patch:{title:'Not yet'}},403);check('pending claimant cannot edit',true);
await request(`http://127.0.0.1:60423/talent_profiles?id=eq.${profile.id}`,other,{published:false},'PATCH',403);check('direct profile writes denied',true);
await request('http://127.0.0.1:60423/talent_owners',other,undefined,'GET',404);check('private ownership table not exposed',true);
check('other user cannot read claim evidence',(await rpc('talent_my_status',other,{profile_id:profile.id})).requests.length===0);
await rpc('talent_review_queue',other,{},403);check('non-admin queue denied',true);
check('admin sees claim',(await rpc('talent_review_queue',admin,{})).some(r=>r.id===id));
await rpc('talent_review_request',admin,{request_id:id,decision:'approved',note:'Synthetic ownership evidence manually reviewed'},204);
check('approved claimant owns profile',(await rpc('talent_my_status',owner,{profile_id:profile.id})).owner);
const changed=await rpc('talent_update_profile',owner,{profile_id:profile.id,expected_revision:2,patch:{title:'Robotics firmware engineer',skills:['C++','STM32']}});
check('owner edits persisted',changed.data.title==='Robotics firmware engineer'&&changed.revision===3);
const conflict=await rpc('talent_update_profile',owner,{profile_id:profile.id,expected_revision:2,patch:{title:'Stale'}},500);check('stale edit rejected',conflict.code==='P0409');
await rpc('talent_update_profile',other,{profile_id:profile.id,expected_revision:3,patch:{title:'Attack'}},403);check('other account edit rejected',true);
await rpc('talent_unlist_profile',owner,{profile_id:profile.id},204);
check('removed profile absent publicly',(await request(`http://127.0.0.1:60423/talent_profiles?id=eq.${profile.id}`,anon,undefined,'GET')).length===0);
check('reimport cannot republish',(await rpc('talent_import_profiles',service,{records:[profile]})).skipped===1);
const showcase={...profile,id:`http-showcase-${run}`,linkedinUrl:`https://www.linkedin.com/in/http-showcase-${run}`,name:'Browser Synthetic Engineer'};
await rpc('talent_import_profiles',service,{records:[showcase]});
fs.writeFileSync(`${serviceDir}/credentials.json`,JSON.stringify({accounts:Object.fromEntries(Object.entries(accounts).map(([k,v])=>[k,{email:v.email,password:v.password,id:v.id}])),profileId:showcase.id},null,2),{mode:0o600});
fs.writeFileSync(`${serviceDir}/public-config.json`,JSON.stringify({url:'http://127.0.0.1:60424',anonKey:anon},null,2));
fs.writeFileSync(`${serviceDir}/public.env`,`VITE_SUPABASE_URL=http://127.0.0.1:60424\nVITE_SUPABASE_ANON_KEY=${anon}\n`);
fs.writeFileSync(`${serviceDir}/http-evidence.json`,JSON.stringify({checkedAt:new Date().toISOString(),database:'armature_talent_launch_check',checks:evidence,passed:evidence.length},null,2));
console.log(`Passed ${evidence.length} HTTP integration checks. Credentials and public configuration saved locally.`);
