import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
vi.hoisted(()=>{globalThis.Deno={env:{get:()=>undefined}};});
import {HttpError} from '../../supabase/functions/_shared/http';
const code=ts.transpileModule(readFileSync('supabase/functions/talent-profile-photo/index.ts','utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup({owner=true,avatar=true,document=true,scanFails=false,stale=false,publicRemoved=false,ownerRemoved=false}={}){
 const queries=[];let reads=0;let ownerReads=0;
 const from=(table)=>{const q={then:r=>r({error:null}),maybeSingle:async()=>({data:table==='talent_profiles'?{id:'profile'}:table==='member_avatars'?(avatar?{object_path:'owner/avatar'}:null):document?{object_path:'owner/photo'}:null})};for(const method of ['select','eq','is','not','gt','order','limit','insert'])q[method]=(...args)=>{queries.push([table,method,...args]);return q;};return q;};
 const upload=vi.fn(async()=>({error:null}));const download=vi.fn(async()=>({data:new Blob([new Uint8Array([137,80,78,71,13,10,26,10])])}));
 const rpc=vi.fn(async(name)=>({data:name==='talent_my_status'?{owner:++ownerReads>1&&ownerRemoved?false:owner}:name==='talent_photo_finish'?!stale:name==='talent_photo_read'?(++reads>1&&publicRemoved?null:{object_path:'owner/public',content_type:'image/png',version:'operation'}):'operation'}));
 const client={from,rpc,storage:{from:()=>({upload,download})}}; const scan=vi.fn(async b=>{if(scanFails)throw new HttpError(503,'Scanner unavailable');return b;});let handler;
 new Function('Deno','createClient','requiredEnv','corsHeaders','HttpError','json','adminClient','authenticatedUser','bearerToken','scanOnboardingImage',code)({serve:fn=>handler=fn,env:{get:()=>undefined}},()=>client,()=> 'https://example.test',()=>({}),HttpError,(_r,b,status=200)=>Response.json(b,{status}),()=>client,async()=>({id:'owner'}),()=> 'session',scan);
 return {handler,queries,rpc,download,upload,scan};
}
const url='https://example.test?profile_id=profile';const consent='2026-10-13-public-photo-v1';
const post=(body={use_membership_photo:true,consent_version:consent})=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
it('requires approved ownership before membership bytes or mutation',async()=>{const f=setup({owner:false});expect((await f.handler(post())).status).toBe(403);expect(f.download).not.toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled();});
it('requires explicit public consent before copying membership image',async()=>{const f=setup();expect((await f.handler(post({}))).status).toBe(400);expect(f.download).not.toHaveBeenCalled();});
it('prefers member avatar, scans copied bytes, and publishes separately',async()=>{const f=setup();expect((await f.handler(post())).status).toBe(201);expect(f.scan).toHaveBeenCalledTimes(1);expect(f.queries.some(q=>q[0]==='onboarding_documents')).toBe(false);expect(f.rpc).toHaveBeenCalledWith('talent_photo_finish',expect.objectContaining({p_source:'membership',p_consent:consent,p_path:'owner/operation'}));});
it('fallback selects only own unexpired registration PHOTO, not identity documents',async()=>{const f=setup({avatar:false});expect((await f.handler(post())).status).toBe(201);expect(f.queries).toContainEqual(['onboarding_documents','eq','kind','photo']);expect(f.queries).toContainEqual(['onboarding_documents','eq','user_id','owner']);expect(f.queries.some(q=>q[0]==='onboarding_documents'&&q[1]==='gt'&&q[2]==='expires_at')).toBe(true);});
it('private preview sends no publication and has no-store headers',async()=>{const f=setup();const r=await f.handler(new Request(url+'&source=membership'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(f.rpc.mock.calls.some(c=>c[0]==='talent_photo_finish')).toBe(false);});
it('fails closed on scanner failure',async()=>{const f=setup({scanFails:true});expect((await f.handler(post())).status).toBe(503);expect(f.upload).not.toHaveBeenCalled();});
it('rejects unsupported and oversized uploads before scanning',async()=>{const f=setup();for(const [type,body,status] of [['text/html','<html>',415],['image/png',new Uint8Array(5242881),413]]){expect((await f.handler(new Request(url,{method:'POST',headers:{'content-type':type,'x-photo-consent':consent},body}))).status).toBe(status);}expect(f.scan).not.toHaveBeenCalled();});
it('stale upload remains unpublished and cleanup-reserved',async()=>{const f=setup({stale:true});expect((await f.handler(post())).status).toBe(409);expect(f.queries.some(q=>q[0]==='talent_photo_cleanup'&&q[1]==='insert')).toBe(true);});
it('public download rechecks consent after storage read',async()=>{const f=setup({publicRemoved:true});expect((await f.handler(new Request(url))).status).toBe(404);});
it('removal invalidates directory photo without touching membership storage',async()=>{const f=setup();expect((await f.handler(new Request(url,{method:'DELETE'}))).status).toBe(200);expect(f.rpc).toHaveBeenCalledWith('talent_photo_begin',{p_profile:'profile',p_user:'owner',p_remove:true});expect(f.download).not.toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled();});

it('private preview rechecks ownership after storage read',async()=>{const f=setup({ownerRemoved:true});const r=await f.handler(new Request(url+'&source=membership'));expect(r.status).toBe(403);expect(f.download).toHaveBeenCalledOnce();});
