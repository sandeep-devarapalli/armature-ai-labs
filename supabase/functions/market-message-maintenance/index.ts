import { adminClient } from '../_shared/supabase.ts';
import { authorizeMarketWakeup } from '../_shared/market-wakeup.ts';
Deno.serve(async (request: Request) => {
 const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
 if (request.method !== 'POST') return reply({error:'method_not_allowed'},405);
 if (Deno.env.get('MARKET_FILE_CLEANUP_ENABLED') !== 'true') return reply({error:'disabled'},503);
 if (!await authorizeMarketWakeup(request, 'market-message-maintenance', 'MARKET_FILE_CLEANUP_WAKEUP_KEY', 'MARKET_FILE_CLEANUP_SECRET')) return reply({error:'unauthorized'},401);
 try {
  const client=adminClient();
  const {data,error}=await client.rpc('market_attachment_cleanup_candidates');
  if(error || !Array.isArray(data) || data.length>100) throw new Error('claim_failed');
  let removed=0;
  for(const item of data) {
   const deletion=await client.storage.from('market-files').remove([item.object_path]);
   if(deletion.error) throw new Error('delete_failed');
   const completed=await client.rpc('market_attachment_cleanup_complete',{attachment_id:item.id});
   if(completed.error) throw new Error('record_failed');
   removed++;
  }
  return reply({removed});
 } catch { return reply({error:'cleanup_failed'},503); }
});
