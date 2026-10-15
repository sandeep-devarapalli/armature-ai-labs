"""Seed synthetic marketplace fixtures in the explicitly named local test database."""
import json, pathlib, subprocess, sys
root=pathlib.Path('/private/tmp/talent-local-services')
source=json.loads((root/'credentials.json').read_text())['accounts']
accounts={k:source[v] for k,v in {'buyer':'other','provider':'owner','admin':'admin'}.items()}
private=root/'marketplace-credentials.json'
private.write_text(json.dumps({'accounts':accounts},indent=2));private.chmod(0o600)
buyer=accounts['buyer']['id'];provider=accounts['provider']['id']
reset=""
if "--reset" in sys.argv:
 reset="""
create temp table reset_conversations as select id from private.market_conversations where project_id='75000000-0000-4000-8000-000000000100';
delete from private.market_case_access where report_id in(select id from private.market_reports where conversation_id in(select id from reset_conversations));
delete from private.market_case_reviewers where report_id in(select id from private.market_reports where conversation_id in(select id from reset_conversations));
delete from private.market_reports where conversation_id in(select id from reset_conversations);
delete from public.market_inbox_events where conversation_id in(select id from reset_conversations);
delete from private.market_read_positions where conversation_id in(select id from reset_conversations);
delete from private.market_attachments where conversation_id in(select id from reset_conversations);
delete from private.market_messages where conversation_id in(select id from reset_conversations);
delete from private.market_conversations where id in(select id from reset_conversations);
delete from private.market_activity where project_id='75000000-0000-4000-8000-000000000100';
delete from private.market_saved_projects where project_id='75000000-0000-4000-8000-000000000100';
delete from private.market_milestones where project_id='75000000-0000-4000-8000-000000000100';
delete from private.market_invitations where project_id='75000000-0000-4000-8000-000000000100';
delete from private.market_proposals where project_id='75000000-0000-4000-8000-000000000100';
delete from private.market_projects where id='75000000-0000-4000-8000-000000000100' and brief->>'synthetic'='true';
"""
sql=f"""
begin;
do $$ begin if current_database()<>'armature_network_20261015_check' or exists(select 1 from private.market_projects where id='75000000-0000-4000-8000-000000000100' and brief->>'synthetic' is distinct from 'true') then raise exception 'Isolated local database required'; end if; end $$;
{reset}
insert into public.talent_profiles(id,data,published) values('market-local-provider','{{"id":"market-local-provider","company":"Synthetic test fixture","headline":"Local marketplace testing only","previousCompanies":[],"yearsExperience":null,"summary":"Synthetic profile for local test journeys. Not a real provider.","checkedAt":"2026-10-13","availability":"unknown","name":"Synthetic Marketplace Provider","title":"Synthetic firmware engineer","linkedinUrl":"https://www.linkedin.com/in/armature-synthetic-market-provider","claimed":true,"location":"Bengaluru","skills":[],"physicalAiAreas":[]}}',true) on conflict(id) do nothing;
insert into private.talent_owners(profile_id,user_id) values('market-local-provider','{provider}') on conflict(profile_id) do nothing;
insert into private.market_projects(id,buyer_id,status,brief) values('75000000-0000-4000-8000-000000000100','{buyer}','open', '{{"title":"Synthetic drone controller firmware","deliverables":"Editable firmware and bench test report","acceptance":"Agreed bench tests pass","category":"Embedded / Firmware","skills":"STM32, C++, control","budget":"INR 30000–50000","timeline":"3 weeks","location":"Bengaluru","workMode":"Hybrid","materials":"Separately reimbursed","synthetic":true}}') on conflict(id) do update set brief=excluded.brief;
notify pgrst,'reload schema';
commit;
"""
subprocess.run(['psql','postgresql://supabase_admin:postgres@127.0.0.1:58322/armature_network_20261015_check','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
print('Synthetic listing ready. Private role credentials written; no emails sent.')
