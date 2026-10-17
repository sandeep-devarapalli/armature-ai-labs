// Synthetic worker tests: no external email delivery.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
let handler, mode='accepted',calls=[],eligible=true, rpcFailure=null, failuresLeft=0, signals=[];
const logs=[], originalConsole={info:console.info,warn:console.warn,error:console.error}, originalTimeout=globalThis.setTimeout;
for(const level of ['info','warn','error']) console[level]=value=>logs.push(JSON.parse(value));
const delays=[];globalThis.setTimeout=(callback,ms,...args)=>{if(ms===3000){delays.push(ms);queueMicrotask(()=>callback(...args));return 0;}return originalTimeout(callback,ms,...args);};
const env=new Map([['MARKET_MESSAGE_EMAIL_ENABLED','true'],['MARKET_MESSAGE_JOB_SECRET','x'.repeat(32)],['MEMBER_NOTIFICATIONS_RESEND_KEY','synthetic'],['MARKET_MESSAGE_FROM','test@example.invalid']]);
globalThis.Deno={env:{get:k=>env.get(k)},serve:f=>handler=f};
globalThis.__reminderClient={rpc:(name,args)=>{calls.push({name,args});return {abortSignal:async signal=>{
 signals.push(signal);
 if(rpcFailure && name===rpcFailure.operation && failuresLeft-->0){if(rpcFailure.thrown) throw rpcFailure.thrown;return rpcFailure.result;}
 return {status:200,error:null,data:name==='market_claim_reminders'?[{user_id:'synthetic',lease_token:'lease',email:'synthetic@fixture.internal',event_key:'synthetic:day'}]:name==='market_prepare_reminder'?eligible:0};
}};}};
const out=await build({entryPoints:['supabase/functions/market-message-reminders/index.ts'],write:false,bundle:true,platform:'node',format:'esm',plugins:[{name:'mock',setup(b){b.onResolve({filter:/_shared\/supabase.ts$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const adminClient=()=>globalThis.__reminderClient;'}));}}]});
await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
let sends=[];
globalThis.fetch=async(url,options)=>{sends.push({url,options});if(mode==='network')throw Error('synthetic');return new Response(JSON.stringify(mode==='accepted'?{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}:{}),{status:mode==='retry'?429:mode==='failed'?400:200});};
const run=async(secret='x'.repeat(32))=>handler(new Request('http://localhost',{method:'POST',headers:{'x-armature-job-secret':secret}}));
let checks=0;
assert.equal((await run('wrong')).status,401);assert.equal(sends.length,0);checks++;
env.set('MARKET_MESSAGE_EMAIL_ENABLED','false');assert.equal((await run()).status,200);assert.equal(calls.at(-1).name,'market_process_reminders');checks++;env.set('MARKET_MESSAGE_EMAIL_ENABLED','true');
assert.equal((await run()).status,200);assert.equal(calls.at(-1).args.outcome,'accepted');const first=sends.at(-1);assert.equal(first.options.body.includes('Message contents'),true);assert.deepEqual(Object.keys(JSON.parse(first.options.body)),['from','to','subject','text']);checks++;
await run();assert.equal(sends.at(-1).options.headers['Idempotency-Key'],first.options.headers['Idempotency-Key']);checks++;
eligible=false;const n=sends.length;await run();assert.equal(sends.length,n);assert.equal(calls.at(-1).args.outcome,'skipped');checks++;eligible=true;
for(const outcome of ['retry','failed','network']){mode=outcome;await run();assert.equal(calls.at(-1).args.outcome,outcome==='network'?'unknown':outcome);checks++;}
assert.equal(calls.find(c=>c.name==='market_prepare_reminder').args.recipient_email,'synthetic@fixture.internal');checks++;
const reset=()=>{calls=[];sends=[];logs.length=0;signals=[];delays.length=0;mode='accepted';rpcFailure=null;failuresLeft=0;};
const authFailure={data:null,status:401,error:{code:'PGRST303',message:'PRIVATE-TOKEN',details:'PRIVATE-PERSON'}};
reset();rpcFailure={operation:'market_process_reminders',result:authFailure};failuresLeft=1;
assert.equal((await run()).status,200);assert.equal(calls.filter(c=>c.name==='market_process_reminders').length,2);assert.equal(sends.length,1);assert.deepEqual(delays,[3000]);assert.notEqual(signals[0],signals[1]);assert.equal(logs.some(l=>l.event==='market_reminder_auth_recovered'),true);checks++;
reset();rpcFailure={operation:'market_process_reminders',result:authFailure};failuresLeft=3;
assert.equal((await run()).status,503);assert.equal(calls.length,2);assert.equal(sends.length,0);assert.deepEqual(delays,[3000]);checks++;
for(const [status,code,data] of [[401,'PGRST301',null],[403,'42501',null],[500,'PGRST303',null],[503,'PGRST000',null],[0,'',null],[401,'private-secret',null],[401,'PGRST303',1]]){
 reset();rpcFailure={operation:'market_process_reminders',result:{status,data,error:{code,message:'PRIVATE-TOKEN',details:'PRIVATE-PERSON'}}};failuresLeft=3;
 assert.equal((await run()).status,503);assert.equal(calls.length,1);assert.equal(sends.length,0);assert.equal(delays.length,0);assert.equal(JSON.stringify(logs).includes('PRIVATE-'),false);assert.equal(JSON.stringify(logs).includes('private-secret'),false);checks++;
}
for(const operation of ['market_claim_reminders','market_prepare_reminder','market_finish_reminder']){
 reset();rpcFailure={operation,result:authFailure};failuresLeft=3;
 assert.equal((await run()).status,503);assert.equal(calls.filter(c=>c.name===operation).length,1);assert.equal(delays.length,0);assert.equal(sends.length,operation==='market_finish_reminder'?1:0);assert.equal(logs.at(-1).operation,operation);checks++;
}
for(const [name,code] of [['TimeoutError','request_timeout'],['AbortError','request_timeout'],['Error','transport_error']]){
 reset();const error=new Error('PRIVATE-TOKEN');error.name=name;rpcFailure={operation:'market_process_reminders',thrown:error};failuresLeft=3;
 assert.equal((await run()).status,503);assert.equal(calls.length,1);assert.equal(sends.length,0);assert.equal(logs.at(-1).code,code);assert.equal(JSON.stringify(logs).includes('PRIVATE-'),false);checks++;
}
for(const timedOut of [false,true]){
 reset();const timeout=AbortSignal.timeout;
 if(timedOut) AbortSignal.timeout=()=>AbortSignal.abort();
 rpcFailure={operation:'market_process_reminders',result:{status:0,data:null,error:{code:'',message:'PRIVATE-TOKEN'}}};failuresLeft=3;
 try{assert.equal((await run()).status,503);}finally{AbortSignal.timeout=timeout;}
 assert.equal(calls.length,1);assert.equal(sends.length,0);assert.equal(delays.length,0);assert.equal(logs.at(-1).code,timedOut?'request_timeout':'transport_error');assert.equal(JSON.stringify(logs).includes('PRIVATE-'),false);checks++;
}
reset();mode='network';assert.equal((await run()).status,200);assert.equal(sends.length,1);assert.equal(calls.at(-1).args.outcome,'unknown');assert.equal(delays.length,0);checks++;
Object.assign(console,originalConsole);globalThis.setTimeout=originalTimeout;
console.log(JSON.stringify({checks,result:'passed',scope:'synthetic RPC/auth failures, bounded retries, private log exclusion and ambiguous provider responses; no email sent'}));
