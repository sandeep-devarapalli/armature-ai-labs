// Synthetic worker tests: no external email delivery.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
let handler, mode='accepted',calls=[],eligible=true;
const env=new Map([['MARKET_MESSAGE_EMAIL_ENABLED','true'],['MARKET_MESSAGE_JOB_SECRET','x'.repeat(32)],['MEMBER_NOTIFICATIONS_RESEND_KEY','synthetic'],['MARKET_MESSAGE_FROM','test@example.invalid']]);
globalThis.Deno={env:{get:k=>env.get(k)},serve:f=>handler=f};
globalThis.__reminderClient={rpc:async(name,args)=>{calls.push({name,args});return {error:null,data:name==='market_claim_reminders'?[{user_id:'synthetic',lease_token:'lease',email:'synthetic@fixture.internal',event_key:'synthetic:day'}]:name==='market_prepare_reminder'?eligible:null};}};
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
console.log(JSON.stringify({checks,result:'passed',scope:'synthetic worker and provider responses; no email sent'}));
