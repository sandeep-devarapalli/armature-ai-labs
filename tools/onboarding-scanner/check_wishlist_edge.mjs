import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
assert.equal(process.env.ARMATURE_LOCAL_WISHLIST_IMAGE_TEST, '1', 'Explicit local synthetic test opt-in required');
const {createClient}=require('@supabase/supabase-js');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();await page.goto('http://127.0.0.1:4344/components/wishlist');
const status=JSON.parse(execFileSync('supabase',['status','--workdir','/private/tmp/armature-equipment-wishlist-check','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(status.API_URL,'http://127.0.0.1:58321');
const opts={auth:{persistSession:false,autoRefreshToken:false}}, admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,opts), users=[],clients=[],tokens=[],paths=[];
const sql=q=>execFileSync('psql',[status.DB_URL,'-XAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
const python=source=>execFileSync('docker',['exec','-i','armature-wishlist-scanner-local','python','-c',source]);
const endpoint=id=>status.API_URL+'/functions/v1/equipment-wishlist-image?request_id='+id;
const request=(id,token,method='GET',body,type='image/png')=>fetch(endpoint(id),{method,headers:{apikey:status.ANON_KEY,...(token?{Authorization:'Bearer '+token}:{}),...(method==='POST'?{'content-type':type,'x-image-rights':'confirmed'}:{})},body});
try {
 for(const role of ['member','admin']){const password=randomUUID(),email='wishimage-'+randomUUID()+'@example.test';const r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(r.error);users.push(r.data.user.id);const c=createClient(status.API_URL,status.ANON_KEY,opts);const signed=await c.auth.signInWithPassword({email,password});assert.ifError(signed.error);clients.push(c);tokens.push(signed.data.session.access_token);}
 sql(`insert into public.staff_roles(user_id,role) values('${users[1]}','admin'); insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) select id,'Synthetic image',email,'9999999999','https://linkedin.com/in/synthetic','1990-01-01','approved' from auth.users where id='${users[0]}';`);
 const wish=await clients[0].rpc('submit_equipment_wish',{p_name:'Synthetic scanner image',p_use_case:'Check synthetic metadata removal for equipment images.'});assert.ifError(wish.error);const id=wish.data;
 for(const [format,mime] of [['JPEG','image/jpeg'],['PNG','image/png'],['WEBP','image/webp']]){
  const bytes=python(`import io,sys\nfrom PIL import Image,PngImagePlugin\nim=Image.new('RGB',(64,64),'white');out=io.BytesIO();ex=Image.Exif();ex[270]='PRIVATE-METADATA-SENTINEL';meta=PngImagePlugin.PngInfo();meta.add_text('Description','PRIVATE-METADATA-SENTINEL');im.save(out,format='${format}',**({'pnginfo':meta} if '${format}'=='PNG' else {'exif':ex}));sys.stdout.buffer.write(out.getvalue())`);
  assert.ok(bytes.includes(Buffer.from('PRIVATE-METADATA-SENTINEL')));
  const posted=await page.evaluate(async ({url,token,body,type})=>{const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':type,'x-image-rights':'confirmed'},body:new Uint8Array(body)});return {status:r.status,text:await r.text()};},{url:endpoint(id),token:tokens[0],body:Array.from(bytes),type:mime});assert.equal(posted.status,201,format+': '+posted.text);
  paths.push(sql(`select image_path from public.component_requests where id='${id}'`));
  const owner=await request(id,tokens[0]);assert.equal(owner.status,200);const clean=Buffer.from(await owner.arrayBuffer());assert.equal(clean.includes(Buffer.from('PRIVATE-METADATA-SENTINEL')),false);
  assert.equal((await request(id,tokens[1])).status,200);assert.ok([401,404].includes((await request(id,null)).status));
  console.log(format+': scanned, normalized, metadata absent; private owner/admin access and anonymous denial passed');
 }
 const before=paths.at(-1);
 const cleanPng=python("import io,sys;from PIL import Image;o=io.BytesIO();Image.new('RGB',(64,64),'white').save(o,format='PNG');sys.stdout.buffer.write(o.getvalue())");
 for(const [name,bytes] of [['malformed',Buffer.from('not an image')],['EICAR',Buffer.concat([cleanPng,Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')])]]){const r=await request(id,tokens[0],'POST',bytes);assert.equal(r.status,422,name+': '+r.status);assert.equal(sql(`select image_path from public.component_requests where id='${id}'`),before);console.log(name+': rejected with422; prior scanned image preserved');}
 sql(`delete from public.staff_roles where user_id='${users[1]}';`);assert.equal((await request(id,tokens[1])).status,404);console.log('Removed Admin loses private image access immediately');
 sql(`insert into public.staff_roles(user_id,role) values('${users[1]}','admin');`);assert.ifError((await clients[1].rpc('moderate_equipment_wish',{p_request_id:id,p_publish:true,p_status:'open',p_note:'Synthetic image reviewed.'})).error);assert.equal((await request(id,null)).status,200);console.log('Published image publicly readable');
 assert.ifError((await clients[1].rpc('moderate_equipment_wish',{p_request_id:id,p_publish:false,p_status:'open',p_note:'Synthetic image hidden.'})).error);assert.ok([401,404].includes((await request(id,null)).status));
 sql(`update public.basic_onboarding_applications set status='revoked' where user_id='${users[0]}';`);assert.equal((await request(id,tokens[0],'POST',Buffer.from('bad'))).status,403);console.log('Revoked membership cannot upload; unpublished image no longer public');
} finally {
 await browser.close();
 if(paths.length)assert.ifError((await admin.storage.from('equipment-wishlist-images').remove(paths)).error);
 const ids=users.map(x=>"'"+x+"'").join(',')||'null';sql(`begin;delete from public.component_requests where requester_user_id in (${ids});delete from public.basic_onboarding_applications where user_id in (${ids});set local session_replication_role=replica;delete from public.audit_events where actor_user_id in (${ids});set local session_replication_role=origin;commit;`);
 for(const id of users.reverse())assert.ifError((await admin.auth.admin.deleteUser(id)).error);console.log('Synthetic accounts, requests and storage images removed');
}
