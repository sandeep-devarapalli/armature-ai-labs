create table private.market_projects (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references auth.users,
 status text not null default 'draft' check(status in ('draft','review','open','agreement','active','completed')),
 brief jsonb not null, provider_id uuid references auth.users, selected_proposal_id uuid,
 agreement_version integer not null default 0, agreement jsonb, buyer_agreed integer, provider_agreed integer,
 created_at timestamptz not null default now()
);
create table private.market_proposals (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references private.market_projects,
 provider_id uuid not null references auth.users, version integer not null, offer jsonb not null,
 withdrawn boolean not null default false, created_at timestamptz not null default now(),
 unique(project_id,provider_id,version)
);
create table private.market_milestones (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references private.market_projects,
 position integer not null, terms jsonb not null, funded boolean not null default false,
 submission jsonb, submission_version integer not null default 0, buyer_accepted integer, provider_accepted integer,
 disputed boolean not null default false, paid boolean not null default false, submitted_at timestamptz,
 reminder_stage integer not null default 0, mediation boolean not null default false, unique(project_id,position)
);
create table private.market_invitations(id uuid primary key default gen_random_uuid(),project_id uuid not null references private.market_projects,provider_id uuid not null references auth.users,status text not null default 'pending' check(status in ('pending','accepted','declined')),created_at timestamptz not null default now(),unique(project_id,provider_id));
alter table private.market_invitations enable row level security;
revoke all on private.market_invitations from public,anon,authenticated;
create table private.market_saved_projects(user_id uuid references auth.users,project_id uuid references private.market_projects,primary key(user_id,project_id));
create table private.market_activity(id bigint generated always as identity primary key,project_id uuid references private.market_projects,actor uuid,event text,payload jsonb default '{}',created_at timestamptz default now());
alter table private.market_projects enable row level security;
alter table private.market_proposals enable row level security;
alter table private.market_milestones enable row level security;
alter table private.market_saved_projects enable row level security;
alter table private.market_activity enable row level security;
revoke all on private.market_projects,private.market_proposals,private.market_milestones,private.market_saved_projects,private.market_activity from public,anon,authenticated;

create function private.market_validate_terms(value jsonb) returns void language plpgsql set search_path='' as $$
declare m jsonb;
begin
 if jsonb_typeof(value)<>'object' or octet_length(value::text)>50000 or length(trim(coalesce(value->>'approach','')))=0 or jsonb_typeof(value->'milestones') is distinct from 'array' or jsonb_array_length(value->'milestones') not between 1 and 20 then raise exception 'Approach and 1–20 milestones required'; end if;
 if length(trim(coalesce(value->>'schedule','')))=0 or length(trim(coalesce(value->>'ipTerms','')))=0 or length(trim(coalesce(value->>'confidentiality','')))=0 or coalesce(value->>'revisions','') !~ '^[0-9]+$' then raise exception 'Schedule, source/IP terms, confidentiality and revision allowance required'; end if;
 for m in select * from jsonb_array_elements(value->'milestones') loop
 if coalesce(m->>'serviceAmount','') !~ '^[0-9]+(\.[0-9]{1,2})?$' or coalesce(m->>'materialsAmount','0') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Amounts must be finite INR values with at most two decimals'; end if;
 if length(trim(coalesce(m->>'title','')))=0 or length(trim(coalesce(m->>'deliverables','')))=0 or length(trim(coalesce(m->>'acceptance','')))=0 or coalesce((m->>'serviceAmount')::numeric,0)<=0 or coalesce((m->>'materialsAmount')::numeric,0)<0 then raise exception 'Milestone title, deliverables, acceptance criteria and positive service amount required'; end if;
 end loop;
end $$;
create function public.market_list_projects() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg((to_jsonb(p)-'agreement'-'buyer_agreed'-'provider_agreed')||jsonb_build_object('has_proposal',exists(select 1 from private.market_proposals q where q.project_id=p.id and q.provider_id=auth.uid()),'saved',exists(select 1 from private.market_saved_projects s where s.project_id=p.id and s.user_id=auth.uid())) order by p.created_at desc),'[]') from private.market_projects p where p.status='open' or p.buyer_id=auth.uid() or p.provider_id=auth.uid() or exists(select 1 from private.market_proposals q where q.project_id=p.id and q.provider_id=auth.uid()) or private.is_staff(array['admin','super_admin']::public.staff_role[])
$$;
create function public.market_project_detail(project_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.market_projects; u uuid:=auth.uid(); privileged boolean;
begin
 select * into p from private.market_projects where id=project_id;
 privileged:=p.buyer_id=u or p.provider_id=u;
 if p.id is null or not(coalesce(privileged,false) or p.status='open' or exists(select 1 from private.market_proposals q where q.project_id=p.id and q.provider_id=u) or private.is_staff(array['admin','super_admin']::public.staff_role[])) then raise exception 'Project unavailable' using errcode='42501'; end if;
 return jsonb_build_object('viewer_admin',private.is_staff(array['admin','super_admin']::public.staff_role[]),'project',case when privileged then to_jsonb(p) else to_jsonb(p)-'agreement'-'buyer_agreed'-'provider_agreed' end,'invitations',coalesce((select jsonb_agg(to_jsonb(i)) from private.market_invitations i where i.project_id=p.id and (p.buyer_id=u or i.provider_id=u)),'[]'),'proposals',coalesce((select jsonb_agg(to_jsonb(q)||coalesce((select jsonb_build_object('provider_name',t.data->>'name','profile_id',o.profile_id) from private.talent_owners o join public.talent_profiles t on t.id=o.profile_id where o.user_id=q.provider_id and t.published order by o.profile_id limit 1),'{}'::jsonb) order by q.created_at desc) from private.market_proposals q where q.project_id=p.id and (p.buyer_id=u or q.provider_id=u)),'[]'),'milestones',case when privileged then coalesce((select jsonb_agg(to_jsonb(m) order by position) from private.market_milestones m where m.project_id=p.id),'[]') else '[]'::jsonb end,'activity',case when privileged then coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from private.market_activity a where a.project_id=p.id and (p.buyer_id=u or a.event not in ('propose','withdraw_proposal') or a.actor=u)),'[]') else '[]'::jsonb end);
end $$;
create function public.market_project_action(project_id uuid,action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account(); p private.market_projects; q private.market_proposals; m private.market_milestones; v integer; item jsonb; result uuid; invited uuid; invitation private.market_invitations;
begin
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>50000 then raise exception 'Invalid payload'; end if;
 if action='create' then
 if length(trim(coalesce(payload->>'title','')))=0 or length(trim(coalesce(payload->>'deliverables','')))=0 or length(trim(coalesce(payload->>'acceptance','')))=0 then raise exception 'Title, deliverables and acceptance required'; end if;
 insert into private.market_projects(buyer_id,brief) values(u,payload) returning id into result;
 insert into private.market_activity(project_id,actor,event) values(result,u,'create'); return public.market_project_detail(result);
 end if;
 select * into p from private.market_projects where id=project_id for update;
 if p.id is null then raise exception 'Project unavailable'; end if;
 if action='save' then
 if p.status<>'open' and p.buyer_id<>u then raise exception 'Project unavailable'; end if;
 if coalesce((payload->>'saved')::boolean,true) then insert into private.market_saved_projects values(u,p.id) on conflict do nothing; else delete from private.market_saved_projects s where s.user_id=u and s.project_id=p.id; end if;
 elsif action='submit_review' then
 if p.buyer_id<>u or p.status<>'draft' then raise exception 'Draft owner required'; end if;
 update private.market_projects set status='review' where id=p.id;
 elsif action='publish' then
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) or p.status<>'review' then raise exception 'Reviewer required'; end if;
 update private.market_projects set status='open' where id=p.id;
 elsif action='invite' then
 if p.buyer_id<>u or p.status<>'open' then raise exception 'Open project buyer required'; end if;
 select o.user_id into invited from private.talent_owners o join public.talent_profiles t on t.id=o.profile_id where o.profile_id=payload->>'profileId' and t.published;
 if invited is null or invited=u then raise exception 'Approved claimed provider required'; end if;
 insert into private.market_invitations(project_id,provider_id) values(p.id,invited) on conflict on constraint market_invitations_project_id_provider_id_key do nothing;
 elsif action in ('accept_invitation','decline_invitation') then
 select * into invitation from private.market_invitations i where i.id=(payload->>'invitationId')::uuid and i.project_id=p.id and i.provider_id=u for update;
 if invitation.id is null or invitation.status<>'pending' or p.status<>'open' then raise exception 'Pending invitation to open project required'; end if;
 update private.market_invitations set status=case when action='accept_invitation' then 'accepted' else 'declined' end where id=invitation.id;
 if action='accept_invitation' then execute 'select private.market_project_conversation($1,$2,$3,$4)' using p.id,invitation.id,p.buyer_id,u; end if;
 elsif action='propose' then
 if p.status<>'open' or p.buyer_id=u or not exists(select 1 from private.talent_owners o join public.talent_profiles t on t.id=o.profile_id where o.user_id=u and t.published) then raise exception 'Approved profile owner and open project required'; end if;
 perform private.market_validate_terms(payload);
 select coalesce(max(version),0)+1 into v from private.market_proposals where market_proposals.project_id=p.id and provider_id=u;
 update private.market_proposals set withdrawn=true where market_proposals.project_id=p.id and provider_id=u;
 insert into private.market_proposals(project_id,provider_id,version,offer) values(p.id,u,v,payload) returning * into q;
 if to_regprocedure('private.market_project_conversation(uuid,uuid,uuid,uuid)') is not null then execute 'select private.market_project_conversation($1,$2,$3,$4)' using p.id,q.id,p.buyer_id,u; end if;
 elsif action='withdraw_proposal' then
 if p.status<>'open' then raise exception 'Selection already closed'; end if;
 update private.market_proposals set withdrawn=true where id=(payload->>'proposalId')::uuid and provider_id=u and market_proposals.project_id=p.id;
 if not found then raise exception 'Own proposal required'; end if;
 elsif action='select_provider' then
 if p.buyer_id<>u or p.status<>'open' then raise exception 'Open project buyer required'; end if;
 select * into q from private.market_proposals where id=(payload->>'proposalId')::uuid and market_proposals.project_id=p.id and not withdrawn;
 if q.id is null then raise exception 'Active proposal required'; end if;
 update private.market_projects set provider_id=q.provider_id,selected_proposal_id=q.id,agreement=q.offer,agreement_version=1,status='agreement' where id=p.id;
 elsif action='revise_agreement' then
 if u<>p.buyer_id and u is distinct from p.provider_id then raise exception 'Participant required'; end if;
 if p.status<>'agreement' or exists(select 1 from private.market_milestones x where x.project_id=p.id and x.funded) then raise exception 'Funded scope cannot be overwritten'; end if;
 perform private.market_validate_terms(payload);
 update private.market_projects set agreement=payload,agreement_version=agreement_version+1,buyer_agreed=null,provider_agreed=null where id=p.id;
 delete from private.market_milestones where market_milestones.project_id=p.id;
 elsif action='agree' then
 if p.status<>'agreement' or (payload->>'version')::integer is distinct from p.agreement_version then raise exception 'Current agreement required'; end if;
 if u=p.buyer_id then update private.market_projects set buyer_agreed=agreement_version where id=p.id;
 elsif u=p.provider_id then update private.market_projects set provider_agreed=agreement_version where id=p.id; else raise exception 'Participant required'; end if;
 select * into p from private.market_projects where id=p.id;
 if p.buyer_agreed=p.agreement_version and p.provider_agreed=p.agreement_version then
 v:=0; for item in select * from jsonb_array_elements(p.agreement->'milestones') loop v:=v+1; insert into private.market_milestones(project_id,position,terms) values(p.id,v,item) on conflict do nothing; end loop;
 end if;
 elsif action in ('submit_deliverable','accept_delivery','dispute') then
 if u<>p.buyer_id and u is distinct from p.provider_id then raise exception 'Participant required'; end if;
 select * into m from private.market_milestones where id=(payload->>'milestoneId')::uuid and market_milestones.project_id=p.id for update;
 if m.id is null or not m.funded or m.paid then raise exception 'Funded unpaid milestone required'; end if;
 if action='submit_deliverable' then
 if u is distinct from p.provider_id or m.disputed or length(trim(coalesce(payload->>'delivery','')))=0 then raise exception 'Provider delivery required'; end if;
 update private.market_milestones set submission=payload,submission_version=submission_version+1,buyer_accepted=null,provider_accepted=null,submitted_at=now(),reminder_stage=0 where id=m.id;
 elsif action='accept_delivery' then
 if m.disputed or m.submission_version=0 or (payload->>'version')::integer is distinct from m.submission_version then raise exception 'Current undisputed submission required'; end if;
 if u=p.buyer_id then update private.market_milestones set buyer_accepted=submission_version where id=m.id; else update private.market_milestones set provider_accepted=submission_version where id=m.id; end if;
 else
 if length(trim(coalesce(payload->>'reason','')))=0 then raise exception 'Dispute reason required'; end if;
 update private.market_milestones set disputed=true,mediation=true where id=m.id;
 end if;
 else raise exception 'Unsupported action'; end if;
 insert into private.market_activity(project_id,actor,event,payload) values(p.id,u,action,payload);
 return public.market_project_detail(p.id);
end $$;

-- Local-only simulator requires an explicit database setting and service credentials.
create function public.market_simulate_payment(milestone_id uuid,operation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m private.market_milestones; p private.market_projects;
begin
 if current_setting('armature.local_market_simulator',true) is distinct from 'on' then raise exception 'Payment activation is disabled'; end if;
 select * into p from private.market_projects where id=(select project_id from private.market_milestones where id=milestone_id) for update;
 select * into m from private.market_milestones where id=milestone_id for update;
 if m.id is null then raise exception 'Milestone unavailable'; end if;
 if (operation='fund' and m.funded) or (operation='payout' and m.paid) then return jsonb_build_object('simulated',true,'operation',operation,'duplicate',true); end if;
 if operation='fund' then
 if p.buyer_agreed is distinct from p.agreement_version or p.provider_agreed is distinct from p.agreement_version or m.disputed or m.paid or exists(select 1 from private.market_milestones x where x.project_id=p.id and x.position<m.position and not x.paid) then raise exception 'Agreement and previous milestone completion required'; end if;
 update private.market_milestones set funded=true where id=m.id; update private.market_projects set status='active' where id=p.id;
 elsif operation='payout' then
 if not m.funded or m.disputed or m.submission_version=0 or m.buyer_accepted is distinct from m.submission_version or m.provider_accepted is distinct from m.submission_version then raise exception 'Confirmed funding and mutual acceptance required'; end if;
 update private.market_milestones set paid=true where id=m.id;
 if not exists(select 1 from private.market_milestones x where x.project_id=p.id and not x.paid) then update private.market_projects set status='completed' where id=p.id; end if;
 else raise exception 'Unsupported payment simulation'; end if;
 insert into private.market_activity(project_id,event,payload) values(p.id,'simulated_'||operation,jsonb_build_object('milestoneId',m.id,'serviceFee',(m.terms->>'serviceAmount')::numeric*0.10,'materialsCommission',0));
 return jsonb_build_object('simulated',true,'operation',operation);
end $$;
create function public.market_process_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare m private.market_milestones; count integer:=0; stage integer;
begin
 for m in select * from private.market_milestones where submitted_at<=now()-interval '3 days' and not paid and not disputed and (buyer_accepted is distinct from submission_version or provider_accepted is distinct from submission_version) for update skip locked loop
 stage:=case when m.submitted_at<=now()-interval '7 days' then 2 else 1 end;
 if stage>m.reminder_stage then
 update private.market_milestones set reminder_stage=stage,mediation=stage=2 where id=m.id;
 insert into private.market_activity(project_id,event,payload) values(m.project_id,case when stage=2 then 'mediation_required' else 'acceptance_reminder' end,jsonb_build_object('milestoneId',m.id)); count:=count+1;
 end if; end loop; return count;
end $$;
revoke all on function private.market_validate_terms(jsonb),public.market_list_projects(),public.market_project_detail(uuid),public.market_project_action(uuid,text,jsonb),public.market_simulate_payment(uuid,text),public.market_process_reminders() from public,anon,authenticated;
grant execute on function public.market_list_projects(),public.market_project_detail(uuid) to anon,authenticated;
grant execute on function public.market_project_action(uuid,text,jsonb) to authenticated;
grant execute on function public.market_simulate_payment(uuid,text),public.market_process_reminders() to service_role;

create function public.market_invitations() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare u uuid:=private.talent_require_account(); begin return coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('project_title',p.brief->>'title')) from private.market_invitations i join private.market_projects p on p.id=i.project_id where i.provider_id=u),'[]'); end $$;
revoke all on function public.market_invitations() from public,anon;
grant execute on function public.market_invitations() to authenticated;
