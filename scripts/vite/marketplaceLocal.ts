import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';
const run = promisify(execFile);
const directory = '/private/tmp/talent-local-services';
const database = 'postgresql://supabase_admin:postgres@127.0.0.1:58322/armature_network_20261015_check';
export function marketplaceLocal(url?: string): Plugin {
 return { name: 'marketplace-local-pilot', apply: 'serve', configureServer(server) {
  if (!['http://127.0.0.1:61424', 'http://localhost:61424'].includes(url ?? '')) return;
  server.middlewares.use('/__market-local', async (req, res) => {
   res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
   try {
    const host=req.headers.host ?? ''; const address=req.socket.remoteAddress ?? '';
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address) || req.headers.origin!==`http://${host}` || req.method!=='POST') { res.statusCode=403; res.end(JSON.stringify({error:'Local same-origin POST required'})); return; }
    let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>4096) throw Error('Request too large'); }
    const body=JSON.parse(raw||'{}');
    const credentials=JSON.parse(await readFile(`${directory}/marketplace-credentials.json`,'utf8'));
    if(req.url==='/sign-in') {
     if(!['buyer','provider','admin'].includes(body.role)) throw Error('Unknown test role');
     const config=JSON.parse(await readFile(`${directory}/public-config.json`,'utf8'));
     const account=credentials.accounts[body.role];
     const result=await fetch('http://127.0.0.1:61424/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey},body:JSON.stringify({email:account.email,password:account.password})});
     if(!result.ok) throw Error(`Local sign-in failed (${result.status})`);
     res.end(JSON.stringify(await result.json())); return;
    }
    if(req.url==='/reset') { await run('python3',['scripts/seed-marketplace-local.py','--reset'],{cwd:server.config.root});res.end(JSON.stringify({reset:true,projectId:'75000000-0000-4000-8000-000000000100'}));return; }
    if(req.url==='/payment') {
     if(!/^[0-9a-f-]{36}$/i.test(body.milestoneId ?? '') || !['fund','payout'].includes(body.operation)) throw Error('Invalid simulation');
     const buyer=credentials.accounts.buyer.id;
     if(!/^[0-9a-f-]{36}$/i.test(buyer)) throw Error('Invalid fixture');
     const sql=`begin; do $$ begin if current_database()<>'armature_network_20261015_check' or not exists(select 1 from private.market_milestones m join private.market_projects p on p.id=m.project_id where m.id='${body.milestoneId}' and p.buyer_id='${buyer}' and p.id='75000000-0000-4000-8000-000000000100' and p.brief->>'synthetic'='true') then raise exception 'Synthetic local milestone required'; end if; end $$; set local armature.local_market_simulator='on'; select public.market_simulate_payment('${body.milestoneId}','${body.operation}'); commit;`;
     await run('psql',[database,'-v','ON_ERROR_STOP=1','-c',sql]);res.end(JSON.stringify({simulated:true,operation:body.operation}));return;
    }
    res.statusCode=404; res.end(JSON.stringify({error:'Unknown local action'}));
   } catch(error) { res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error && !('stderr' in error) ? error.message:'Local operation rejected; check the milestone state'})); }
  });
 }};
}
