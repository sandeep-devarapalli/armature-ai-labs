// Synthetic hosted verification; credentials come from private files, never output.
import http2 from 'node:http2';
import fs from 'node:fs';
import crypto from 'node:crypto';
const url=process.env.SCANNER_TEST_URL;
if(!url?.startsWith('https://')||!new URL(url).hostname.endsWith('.run.app'))throw Error('Explicit Cloud Run test URL required');
const secret=fs.readFileSync(process.env.SCANNER_TEST_SECRET_FILE,'utf8').trim();
const identity=fs.readFileSync(process.env.SCANNER_TEST_IDENTITY_FILE,'utf8').trim();
const client=http2.connect(url,{family:4});client.on('error',()=>{});
const evidence=[];
async function request(data,name,type,{auth=true,bearer=secret,digest}={}) {
 return new Promise((resolve,reject)=>{
  const headers={':method':data?'POST':'GET',':path':data?'/scan':'/health',...(auth?{'x-serverless-authorization':'Bearer '+identity,authorization:'Bearer '+bearer}:{}),...(data?{'content-length':data.length,'content-type':type,'x-file-name':encodeURIComponent(name),'x-content-sha256':digest??crypto.createHash('sha256').update(data).digest('hex')}:{})};
  const req=client.request(headers);const chunks=[];let status;
  const timer=setTimeout(()=>{req.close();reject(Error('Hosted check timeout'));},120000);
  req.on('response',h=>status=h[':status']);req.on('data',x=>chunks.push(x));
  req.on('error',error=>{clearTimeout(timer);reject(error);});
  req.on('end',()=>{clearTimeout(timer);let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{}resolve({status,body});});req.end(data);
 });
}
async function check(label,data,name,type,expected,options){const start=Date.now();const result=await request(data,name,type,options);if(result.status!==expected.http||(expected.verdict&&result.body?.status!==expected.verdict))throw Error(label+': '+JSON.stringify(result));evidence.push({label,status:result.status,verdict:result.body?.status,bytes:data?.length??0,ms:Date.now()-start});}
try{
 await check('private IAM',null,'','',{http:403},{auth:false});
 await check('independent bearer',null,'','',{http:401},{bearer:'wrong'});
 await check('authenticated fresh antivirus',null,'','',{http:200});
 await check('valid STEP',Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;'),'part.step','application/octet-stream',{http:200,verdict:'clean'});
 await check('digest mismatch',Buffer.from('synthetic'),'notes.txt','text/plain',{http:400},{digest:'wrong'});
 await check('EICAR test signature',Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),'eicar.txt','text/plain',{http:200,verdict:'rejected'});
 await check('active HTML disguise',Buffer.from('<html><script>alert(1)</script></html>'),'notes.txt','text/plain',{http:200,verdict:'rejected'});
 for(const [name,type] of [['image.png','image/png'],['document.pdf','application/pdf'],['work.zip','application/zip']])await check(name,fs.readFileSync(process.env.SCANNER_TEST_FIXTURES+'/'+name),name,type,{http:200,verdict:'clean'});
 await check('50 MiB boundary',Buffer.alloc(50*1024*1024,65),'measurements.txt','text/plain',{http:200,verdict:'clean'});
 console.log(JSON.stringify({passed:true,transport:'hosted HTTPS HTTP/2',checks:evidence.length,evidence},null,2));
}catch(error){console.error(JSON.stringify({passed:false,completed:evidence,error:String(error)},null,2));process.exitCode=1;}finally{client.close();}
