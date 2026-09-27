import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Blob as NodeBlob } from 'node:buffer';
import { expect, it, vi } from 'vitest';
vi.hoisted(() => { globalThis.Deno = { env: { get: () => undefined } }; });
import { HttpError } from '../../supabase/functions/_shared/http';
const source = readFileSync('supabase/functions/equipment-wishlist-image/index.ts','utf8').replace(/^import .*;\n/gm, '');
const code = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const id='10000000-0000-4000-8000-000000000001';
function setup({ published=false, owner='owner', role=[], approved=true, changed=false, scanFails=false }={}) {
  let handler; let lookups=0;
  const row={id,requester_user_id:owner,is_published:published,image_path:'image',image_content_type:'image/png'};
  const query=(table)=>{
    const chain={then(resolve){resolve({data:role,error:null});},maybeSingle:async()=>({data:table==='basic_onboarding_applications'?(approved?{status:'approved'}:null):changed && ++lookups>1?null:row,error:null})};
    for(const name of ['select','eq','is','in','limit','insert'])chain[name]=()=>chain;
    return chain;
  };
  const upload=vi.fn(async()=>({error:null}));
  const download=vi.fn(async()=>({data:new NodeBlob(['clean']),error:null}));
  const rpc=vi.fn(async()=>({error:changed?new Error('stale'):null}));
  const client={from:query,rpc,storage:{from:()=>({upload,download})}};
  const scan=vi.fn(async bytes=>{if(scanFails)throw new HttpError(503,'Scanner unavailable');return bytes;});
  new Function('Deno','createClient','requiredEnv','corsHeaders','HttpError','json','adminClient','authenticatedUser','bearerToken','scanOnboardingImage',code)(
    {serve:fn=>handler=fn,env:{get:()=>undefined}},()=>client,()=> 'https://example.test',()=>({}),HttpError,(_r,data,status=200)=>Response.json(data,{status}),()=>client,async()=>({id:'owner'}),()=> 'session',scan);
  return {handler,upload,download,scan,rpc};
}
const request=(method='GET',headers={},body)=>new Request(`https://example.test?request_id=${id}`,{method,headers,body});
const post=(rights='confirmed',mime='image/png',size=8)=>request('POST',{'content-type':mime,'x-image-rights':rights},new Uint8Array(size));
it('serves published images and denies another member private images',async()=>{
  const visible=setup({published:true,owner:'another'});expect((await visible.handler(request())).status).toBe(200);
  const hidden=setup({owner:'another'});expect((await hidden.handler(request())).status).toBe(404);expect(hidden.download).not.toHaveBeenCalled();
});
it('allows the owner or administrator to review unpublished images',async()=>{
  expect((await setup().handler(request())).status).toBe(200);
  expect((await setup({owner:'another',role:[{role:'admin'}]}).handler(request())).status).toBe(200);
});
it('rechecks publication before returning downloaded bytes',async()=>{
  expect((await setup({published:true,changed:true}).handler(request())).status).toBe(404);
});
it('requires approval, rights, accepted MIME and bounded uploads',async()=>{
  const f=setup({approved:false});expect((await f.handler(post())).status).toBe(403);expect(f.scan).not.toHaveBeenCalled();
  expect((await setup().handler(post(''))).status).toBe(400);
  expect((await setup().handler(post('confirmed','text/html'))).status).toBe(415);
  const large=setup();expect((await large.handler(post('confirmed','image/png',5242881))).status).toBe(413);expect(large.scan).not.toHaveBeenCalled();
});
it('never stores bytes if scanning fails and opts into WebP only here',async()=>{
  const bad=setup({scanFails:true});expect((await bad.handler(post())).status).toBe(503);expect(bad.upload).not.toHaveBeenCalled();
  const good=setup();expect((await good.handler(post('confirmed','image/webp'))).status).toBe(201);expect(good.scan.mock.calls[0][2]).toMatchObject({allowWebp:true});
  expect(good.rpc).toHaveBeenCalledWith('finish_equipment_wish_image',expect.objectContaining({p_request_id:id,p_user_id:'owner',p_type:'image/webp'}));
});
it('stale moderation wins over a concurrent image upload',async()=>{
  expect((await setup({changed:true}).handler(post())).status).toBe(409);
});
