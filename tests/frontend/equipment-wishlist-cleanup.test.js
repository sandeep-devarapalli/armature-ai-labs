import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect,it,vi } from 'vitest';
const source=readFileSync('supabase/functions/onboarding-retention/index.ts','utf8').replace(/^import .*;\n/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup({enabled=true,removeFails=false,documents=0}={}) {
 let handler;const acknowledged=vi.fn();const queried=vi.fn();
 const from=table=>{const chain={select(){queried(table);return this;},lte(){return this;},order(){return this;},limit:async()=>({data:table==='equipment_wishlist_image_cleanup'?[{object_path:'abandoned'}]:[],error:null}),delete(){return this;},eq:async()=>{acknowledged(table);return {error:null};}};return chain;};
 const remove=vi.fn(async()=>({error:removeFails?new Error('retry'):null}));
 new Function('Deno','assertJobSecret','HttpError','json','adminClient',code)(
 {serve:fn=>handler=fn,env:{get:name=>name==='ONBOARDING_RETENTION_ENABLED'||(enabled&&name==='EQUIPMENT_WISHLIST_CLEANUP_ENABLED')?'true':undefined}},()=>{},class extends Error{},(_r,data,status=200)=>Response.json(data,{status}),()=>({from,storage:{from:()=>({remove})},rpc:async name=>{queried(name);return {data:name==='list_due_onboarding_documents'?Array.from({length:documents},(_,id)=>({id,object_path:`document-${id}`})):name==='claim_equipment_wish_images'?[{object_path:'abandoned'}]:null,error:null};}}));
 return {handler,acknowledged,queried,remove};
}
it('removes abandoned images before acknowledging their cleanup record',async()=>{
 const f=setup();const r=await f.handler(new Request('https://local.test',{method:'POST'}));
 expect(await r.json()).toEqual({examined:1,deleted:1,failed:0});expect(f.remove).toHaveBeenCalledWith(['abandoned']);expect(f.acknowledged).toHaveBeenCalledWith('equipment_wishlist_image_cleanup');
});
it('retains failures for retry and stays within the shared batch limit',async()=>{
 const f=setup({removeFails:true});expect((await f.handler(new Request('https://local.test',{method:'POST'}))).status).toBe(503);expect(f.acknowledged).not.toHaveBeenCalled();
 const full=setup({documents:100});await full.handler(new Request('https://local.test',{method:'POST'}));expect(full.queried).not.toHaveBeenCalledWith('claim_equipment_wish_images');
});
it('does not require the new queue before its explicit release flag',async()=>{
 const f=setup({enabled:false});await f.handler(new Request('https://local.test',{method:'POST'}));expect(f.queried).not.toHaveBeenCalledWith('claim_equipment_wish_images');
});
