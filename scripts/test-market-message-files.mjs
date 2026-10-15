// Synthetic HTTP/Storage/scanner harness; no real antivirus or remote service is called.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
let handler;
const env = new Map([['MARKET_FILES_ENABLED','true'],['SUPABASE_URL','https://synthetic.invalid'],['SUPABASE_ANON_KEY','synthetic'],['SUPABASE_SERVICE_ROLE_KEY','synthetic']]);
globalThis.Deno = { env: { get: name => env.get(name) }, serve: fn => { handler = fn; } };
let state, mode;
const reset = () => { state = { status:'quarantined',uploads:0,signs:0,scanCalls:0 }; mode = 'clean'; env.delete('MARKET_FILE_SCANNER_URL'); env.delete('MARKET_FILE_SCANNER_SECRET'); };
const fail = { error:{message:'synthetic denial'},data:null };
const client = {
 auth:{getUser:async token => token===jwt ? {data:{user:{id:'synthetic-user'}},error:null}:fail},
 rpc:async(name,args) => {
   if(name==='market_thread') return args.conversation_id==='conversation' ? {data:{conversation:{status:'active'}},error:null}:fail;
   if(name==='market_prepare_attachment') {
     if(!['design.step','image.png','document.pdf'].includes(args.filename)||args.byte_size>52428800||args.byte_size<1||args.conversation_id!=='conversation') return fail;
     state.filename=args.filename;state.contentType=args.content_type;
     return {data:{id:'attachment',object_path:'conversation/attachment',status:'quarantined'},error:null};
   }
   if(name==='market_attachment_scan_result') { state.status=args.clean?'clean':'rejected'; return {data:null,error:null}; }
   if(name==='market_attachment_access') return args.attachment_id==='attachment'&&state.status==='clean'&&!state.blocked ? {data:{object_path:'conversation/attachment',filename:state.filename,content_type:state.contentType},error:null}:fail;
   throw Error(name);
 },
 storage:{from:() => ({upload:async(_path,bytes)=>{state.uploads++;state.bytes=bytes;return {error:mode==='upload-fail'?{}:null};},createSignedUrl:async(_path,ttl,options)=>{state.signs++;state.ttl=ttl;state.download=options.download;return {data:{signedUrl:'https://synthetic.invalid/signed'},error:null};},download:async()=>({data:new Blob([state.bytes]),error:null})})}
};
globalThis.__marketClient=client;
const compiled=await build({entryPoints:['supabase/functions/market-message-files/index.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'synthetic-supabase',setup(b){b.onResolve({filter:/^npm:@supabase/},()=>({path:'supabase',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export const createClient=()=>globalThis.__marketClient;',loader:'js'}));}}]});
await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const jwt='header.'+Buffer.from(JSON.stringify({sub:'synthetic-user',exp:9999999999})).toString('base64url')+'.signature';
const realFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 if(String(input).startsWith('https://scanner.invalid')) {
   state.scanCalls++;
   if(mode==='scanner-fail') throw Error('synthetic scanner offline');
   return new Response(JSON.stringify({sha256:mode==='digest-mismatch'?'wrong':options.headers['x-content-sha256'],status:mode==='rejected'?'rejected':'clean'}),{status:200});
 }
 return realFetch(input,options);
};
const server=createServer(async(req,res)=>{
 try { const chunks=[];for await(const chunk of req) chunks.push(chunk);const body=Buffer.concat(chunks);const response=await handler(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer())); } catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const post=(name='design.step',type='application/octet-stream',extras={})=>fetch(base,{method:'POST',headers:{authorization:`Bearer ${jwt}`,'x-conversation-id':'conversation','x-file-name':encodeURIComponent(name),'content-type':type,...extras},body:'synthetic file bytes'});
const get=(suffix='',token=jwt)=>fetch(base+'?attachment_id=attachment'+suffix,{headers:{authorization:`Bearer ${token}`}});
const scanner=()=>{env.set('MARKET_FILE_SCANNER_URL','https://scanner.invalid/scan');env.set('MARKET_FILE_SCANNER_SECRET','synthetic-secret');};
let checks=0;
try {
 reset();assert.equal((await get('','expired-token')).status,401);checks++;
 assert.equal((await post('bad.html','text/html')).status,400);assert.equal(state.uploads,0);checks++;
 const oversize=await handler(new Request(base,{method:'POST',headers:{authorization:`Bearer ${jwt}`,'x-conversation-id':'conversation','content-length':'52428801'},body:'x'}));assert.equal(oversize.status,413);checks++;
 assert.equal((await post()).status,202);assert.equal(state.status,'quarantined');assert.equal((await get()).status,403);checks++;
 reset();scanner();mode='scanner-fail';assert.equal((await post()).status,202);assert.equal((await get()).status,403);checks++;
 reset();scanner();mode='digest-mismatch';assert.equal((await post()).status,202);assert.equal(state.status,'quarantined');checks++;
 reset();scanner();mode='rejected';assert.equal((await post()).status,200);assert.equal(state.status,'rejected');assert.equal((await get()).status,403);checks++;
 reset();scanner();assert.equal((await post()).status,200);assert.equal(state.status,'clean');const signed=await get();assert.equal(signed.status,200);assert.equal((await signed.json()).expires_in,60);assert.equal(state.ttl,60);assert.equal(state.download,'design.step');assert.equal((await get('&preview=true')).status,415);checks++;
 state.blocked=true;assert.equal((await get()).status,403);checks++;
 reset();scanner();assert.equal((await post('image.png','image/png')).status,200);const preview=await get('&preview=true');assert.equal(preview.status,200);assert.equal(preview.headers.get('x-content-type-options'),'nosniff');assert.match(preview.headers.get('content-security-policy'),/sandbox/);checks++;
 reset();mode='upload-fail';assert.equal((await post()).status,503);assert.equal(state.scanCalls,0);checks++;
 reset();assert.equal((await post('design.step','application/octet-stream',{'x-conversation-id':'outsider'})).status,403);assert.equal(state.uploads,0);checks++;
 reset();env.set('MARKET_FILE_SCANNER_URL','https://scanner-example.run.app/scan');env.set('MARKET_FILE_SCANNER_SECRET','synthetic-secret');assert.equal((await post()).status,202);assert.equal(state.status,'quarantined');assert.equal(state.scanCalls,0);checks++;
 console.log(JSON.stringify({checks,result:'passed',scope:'synthetic HTTP handler, mocked auth/storage/scanner; no live scan or signed URL expiry execution',signedUrlTtl:60}));
} finally {await new Promise(resolve=>server.close(resolve));globalThis.fetch=realFetch;}
