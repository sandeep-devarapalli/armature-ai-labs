import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
const config=JSON.parse(execFileSync('docker',['inspect','supabase_auth_armature-membership-levels-check']))[0];
const settings=Object.fromEntries(config.Config.Env.map(x=>{const n=x.indexOf('=');return [x.slice(0,n),x.slice(n+1)]}));
const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const body=Buffer.from(JSON.stringify({role:'service_role',iss:'supabase-demo',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const unsigned=head+'.'+body;const key=unsigned+'.'+createHmac('sha256',settings.GOTRUE_JWT_SECRET).update(unsigned).digest('base64url');
const url='http://127.0.0.1:59421';const headers={apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'};
const email='basic-course-browser@example.test',password=randomBytes(24).toString('hex');
const created=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true})});const user=await created.json();if(!created.ok)throw Error('Synthetic auth fixture failed '+created.status);
const sql=text=>execFileSync('psql',['-h','127.0.0.1','-p','59422','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:text,env:{...process.env,PGPASSWORD:'postgres'},stdio:['pipe','pipe','pipe']});
const course='88000000-0000-4000-8000-000000000001',version='88000000-0000-4000-8000-000000000002',moduleId='88000000-0000-4000-8000-000000000003',lesson='88000000-0000-4000-8000-000000000004';
const out='/Users/dev/Downloads/Armature Lab/output/membership-levels-2026-10-10/browser-evidence';mkdirSync(out,{recursive:true});
let browser;
try{
 sql(`update private.membership_level_settings set enabled=true;
 insert into public.courses(id,slug) values('${course}','synthetic-basic-course');
 insert into public.course_versions(id,course_id,version,title,source_reference,source_sha256,status,access_tier) values('${version}','${course}',1,'Basic learning verification','synthetic',repeat('a',64),'published','free');
 insert into public.course_modules(id,course_version_id,source_id,title,position) values('${moduleId}','${version}','module','First principles',0);
 insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position,is_sample) values('${lesson}','${version}','${moduleId}','lesson','Full free lesson',0,false);
 insert into private.course_lesson_content values('${lesson}','[{"id":"intro","type":"text","content":{"html":"<p>This full lesson is available to a confirmed-email Basic member without identity or mobile verification.</p>"}}]'::jsonb);
 notify pgrst,'reload schema';`);
 browser=await chromium.launch({headless:true});const findings=[];
 for(const [name,viewport]of[['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4196');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Local test password').fill(password);await page.getByRole('button',{name:'Sign in to local test'}).click();
  await page.getByRole('button',{name:'View course'}).click();
  if(await page.getByRole('button',{name:'Enroll in course'}).count()) await page.getByRole('button',{name:'Enroll in course'}).click();
  await page.locator('.curriculum-module > summary').click();
  await page.getByRole('button',{name:'Full free lesson',exact:true}).click();await page.getByText('This full lesson is available',{exact:false}).waitFor();
  if(await page.getByRole('button',{name:'Mark as read',exact:true}).count()) await page.getByRole('button',{name:'Mark as read',exact:true}).click();await page.getByText('Marked as read',{exact:true}).waitFor();
  await page.getByLabel('Account menu',{exact:true}).click();await page.getByText('Basic member',{exact:true}).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(errors.length||overflow)throw Error(name+' rendering issue '+JSON.stringify({errors,overflow}));
  await page.screenshot({path:out+'/courses-basic-'+name+'.png',fullPage:true});
  await page.reload();await page.getByText('This full lesson is available',{exact:false}).waitFor();await page.getByText('Marked as read',{exact:true}).waitFor();
  findings.push({viewport:name,basicFullLesson:true,enrolled:true,progressSurvivesReload:true,consoleErrors:errors,overflow});await context.close();
 }
 writeFileSync(out+'/courses-basic-results.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings));
}catch(error){console.error(error.message);throw error;}finally{await browser?.close();sql(`delete from public.course_lesson_progress where course_version_id='${version}';delete from public.course_enrollments where course_version_id='${version}';delete from private.course_lesson_content where lesson_id='${lesson}';delete from public.course_lessons where id='${lesson}';delete from public.course_modules where id='${moduleId}';delete from public.course_versions where id='${version}';delete from public.courses where id='${course}';update private.membership_level_settings set enabled=false;`);await fetch(url+'/auth/v1/admin/users/'+user.id,{method:'DELETE',headers});}
