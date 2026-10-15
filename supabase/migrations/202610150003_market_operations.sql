create table private.market_review_cases (
 id uuid primary key default gen_random_uuid(), report_id uuid unique references private.market_reports,
 milestone_id uuid references private.market_milestones, submission_version integer,
 status text not null default 'open' check(status in ('open','assigned','resolved')),
 reviewer_id uuid references auth.users, reason text not null, resolution text,
 created_at timestamptz not null default now(), resolved_at timestamptz,
 unique(milestone_id,submission_version)
);
create table private.market_case_audit(id bigint generated always as identity primary key,case_id uuid references private.market_review_cases,actor uuid,event text not null,note text,created_at timestamptz not null default now());
create table private.market_milestone_notices(id bigint generated always as identity primary key,milestone_id uuid references private.market_milestones,submission_version integer,recipient_id uuid references auth.users,stage integer check(stage in (1,2)),created_at timestamptz not null default now(),unique(milestone_id,submission_version,recipient_id,stage));
create table private.market_amendments(id uuid primary key default gen_random_uuid(),project_id uuid not null references private.market_projects,base_version integer not null,terms jsonb not null,proposed_by uuid not null references auth.users,status text not null default 'pending' check(status in ('pending','accepted','withdrawn')),buyer_accepted boolean not null default false,provider_accepted boolean not null default false,created_at timestamptz not null default now());
create unique index market_one_pending_amendment on private.market_amendments(project_id) where status='pending';
do $$ declare t text; begin foreach t in array array['market_review_cases','market_case_audit','market_milestone_notices','market_amendments'] loop execute format('alter table private.%I enable row level security',t); execute format('revoke all on private.%I from public,anon,authenticated',t); end loop; end $$;

create function private.market_capture_report() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into private.market_review_cases(report_id,reason) values(new.id,'Conversation report: '||new.reason); return new; end $$;
create trigger market_report_case after insert on private.market_reports for each row execute function private.market_capture_report();
create function private.market_capture_dispute() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.disputed and not old.disputed then insert into private.market_review_cases(milestone_id,submission_version,reason) values(new.id,new.submission_version,'Participant requested milestone mediation') on conflict(milestone_id,submission_version) do update set status='open',reviewer_id=null,resolution=null,resolved_at=null; end if; return new; end $$;
create trigger market_dispute_case after update of disputed on private.market_milestones for each row execute function private.market_capture_dispute();

create function public.market_review_cases() returns jsonb language plpgsql security definer set search_path='' as $$ declare u uuid:=private.market_account(); begin
 return coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from private.market_review_cases c where (c.reviewer_id=u and exists(select 1 from public.staff_roles sr where sr.user_id=u)) or private.is_staff(array['admin','super_admin']::public.staff_role[])),'[]'); end $$;
create function public.market_case_action(case_id uuid,action text,note text,reviewer_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.market_account(); c private.market_review_cases; p private.market_projects; conv private.market_conversations;
begin
 if note is null or length(trim(note)) not between 10 and 4000 then raise exception 'Supply a 10–4000 character case note'; end if;
 -- Project then milestone then case is the same lock order used by delivery and payout.
 select * into p from private.market_projects where id=(select m.project_id from private.market_review_cases rc join private.market_milestones m on m.id=rc.milestone_id where rc.id=case_id) for update;
 perform 1 from private.market_milestones where id=(select rc.milestone_id from private.market_review_cases rc where rc.id=case_id) for update;
 select * into c from private.market_review_cases r where r.id=case_id for update;
 if not found or c.status='resolved' then raise exception 'Open case required'; end if;
 if action='assign' then
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Administrator required' using errcode='42501'; end if;
  if reviewer_id is null or not private.has_basic_membership(reviewer_id) or not exists(select 1 from public.staff_roles sr where sr.user_id=reviewer_id) then raise exception 'Active reviewer account required'; end if;
  if p.id is not null and reviewer_id in(p.buyer_id,p.provider_id) then raise exception 'Independent reviewer required'; end if;
  if c.report_id is not null then
   select * into conv from private.market_conversations where id=(select conversation_id from private.market_reports where id=c.report_id);
   if reviewer_id in(conv.initiator_id,conv.recipient_id) then raise exception 'Independent reviewer required'; end if;
   delete from private.market_case_reviewers where report_id=c.report_id;
   insert into private.market_case_reviewers values(c.report_id,reviewer_id);
  end if;
  update private.market_review_cases set reviewer_id=market_case_action.reviewer_id,status='assigned' where id=c.id;
 elsif action in ('resume_review','close_report') then
  if c.reviewer_id is distinct from u or not exists(select 1 from public.staff_roles sr where sr.user_id=u) then raise exception 'Assigned active staff reviewer required' using errcode='42501'; end if;
  if (c.report_id is null and action<>'resume_review') or (c.report_id is not null and action<>'close_report') then raise exception 'Case action does not match case type'; end if;
  if c.milestone_id is not null then
   update private.market_milestones set disputed=false,mediation=false,buyer_accepted=null,provider_accepted=null where id=c.milestone_id and not paid;
   insert into private.market_activity(project_id,actor,event,payload) values(p.id,u,'mediation_review_resumed',jsonb_build_object('milestoneId',c.milestone_id,'note',note));
  end if;
  delete from private.market_case_reviewers where report_id=c.report_id;
  update private.market_review_cases set status='resolved',resolution=note,resolved_at=now() where id=c.id;
 else raise exception 'Unsupported case action'; end if;
 insert into private.market_case_audit(case_id,actor,event,note) values(c.id,u,action,note);
 return (select to_jsonb(r) from private.market_review_cases r where r.id=c.id);
end $$;
create function public.market_case_detail(case_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.market_account(); c private.market_review_cases; result jsonb;
begin
 select * into c from private.market_review_cases r where r.id=case_id and r.reviewer_id=u and r.status='assigned' and exists(select 1 from public.staff_roles sr where sr.user_id=u);
 if not found then raise exception 'Active case assignment required' using errcode='42501'; end if;
 insert into private.market_case_audit(case_id,actor,event) values(c.id,u,'view');
 if c.report_id is not null then return public.market_case_thread(c.report_id); end if;
 select jsonb_build_object('milestone',to_jsonb(m),'agreement',p.agreement,'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from private.market_activity a where a.project_id=p.id and a.payload->>'milestoneId'=m.id::text and a.event in ('submit_deliverable','accept_delivery','dispute','mediation_review_resumed')),'[]')) into result from private.market_milestones m join private.market_projects p on p.id=m.project_id where m.id=c.milestone_id;
 return result;
end $$;

create or replace function public.market_process_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare m private.market_milestones; p private.market_projects; stage integer; total integer:=0; uid uuid;
begin
 for m in select * from private.market_milestones where submitted_at<=now()-interval '3 days' and not paid and not disputed and (buyer_accepted is distinct from submission_version or provider_accepted is distinct from submission_version) for update skip locked loop
  select * into p from private.market_projects where id=m.project_id;
  for stage in 1..case when m.submitted_at<=now()-interval '7 days' then 2 else 1 end loop
   if stage>m.reminder_stage then
    foreach uid in array array[p.buyer_id,p.provider_id] loop
     if uid is not null then insert into private.market_milestone_notices(milestone_id,submission_version,recipient_id,stage) values(m.id,m.submission_version,uid,stage) on conflict do nothing; end if;
    end loop;
    update private.market_milestones set reminder_stage=stage,mediation=stage=2 where id=m.id;
    insert into private.market_activity(project_id,event,payload) values(m.project_id,case when stage=2 then 'mediation_required' else 'acceptance_reminder' end,jsonb_build_object('milestoneId',m.id,'day',case when stage=2 then 7 else 3 end));
    if stage=2 then insert into private.market_review_cases(milestone_id,submission_version,reason) values(m.id,m.submission_version,'Seven-day acceptance review overdue') on conflict do nothing; end if;
    total:=total+1;
   end if;
  end loop;
 end loop; return total;
end $$;
create function public.market_milestone_notices() returns jsonb language plpgsql security definer set search_path='' as $$ declare u uuid:=private.market_account(); begin
 return coalesce((select jsonb_agg(to_jsonb(n)||jsonb_build_object('project_id',m.project_id,'title',m.terms->>'title') order by n.created_at desc) from private.market_milestone_notices n join private.market_milestones m on m.id=n.milestone_id where n.recipient_id=u and not m.paid and n.submission_version=m.submission_version and (m.buyer_accepted is distinct from m.submission_version or m.provider_accepted is distinct from m.submission_version)),'[]'); end $$;

create function public.market_amendments(project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare u uuid:=private.market_account(); begin
 if not exists(select 1 from private.market_projects p where p.id=project_id and u in(p.buyer_id,p.provider_id)) then raise exception 'Participant required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from private.market_amendments a where a.project_id=market_amendments.project_id),'[]'); end $$;
create function public.market_amendment_action(project_id uuid,action text,amendment_id uuid default null,terms jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.market_account(); p private.market_projects; a private.market_amendments; pos integer; item jsonb;
begin
 select * into p from private.market_projects where id=project_id for update;
 if p.id is null or u not in(p.buyer_id,p.provider_id) or p.provider_id is null then raise exception 'Selected participant required' using errcode='42501'; end if;
 if p.status not in ('active','agreement') then raise exception 'Active agreement required'; end if;
 if action='propose' then
  perform private.market_validate_terms(terms);
  insert into private.market_amendments(project_id,base_version,terms,proposed_by) values(p.id,p.agreement_version,terms,u);
 elsif action in ('accept','withdraw') then
  select * into a from private.market_amendments x where x.id=amendment_id and x.project_id=p.id for update;
  if a.id is null or a.status<>'pending' or a.base_version<>p.agreement_version then raise exception 'Current pending amendment required'; end if;
  if action='withdraw' then
   if a.proposed_by<>u then raise exception 'Proposer required'; end if;
   update private.market_amendments set status='withdrawn' where id=a.id;
  else
   update private.market_amendments set buyer_accepted=buyer_accepted or u=p.buyer_id,provider_accepted=provider_accepted or u=p.provider_id where id=a.id returning * into a;
   if a.buyer_accepted and a.provider_accepted then
    if p.buyer_agreed is distinct from p.agreement_version or p.provider_agreed is distinct from p.agreement_version then raise exception 'Both parties must first accept the current agreement'; end if;
    select coalesce(max(position),0) into pos from private.market_milestones where market_milestones.project_id=p.id;
    for item in select * from jsonb_array_elements(a.terms->'milestones') loop pos:=pos+1; insert into private.market_milestones(project_id,position,terms) values(p.id,pos,item); end loop;
    update private.market_amendments set status='accepted' where id=a.id;
    update private.market_projects set agreement=agreement||jsonb_build_object('amendments',coalesce(agreement->'amendments','[]')||jsonb_build_array(jsonb_build_object('version',agreement_version+1,'terms',a.terms))),agreement_version=agreement_version+1,buyer_agreed=agreement_version+1,provider_agreed=agreement_version+1 where id=p.id;
   end if;
  end if;
 else raise exception 'Unsupported amendment action'; end if;
 insert into private.market_activity(project_id,actor,event,payload) values(p.id,u,'amendment_'||action,jsonb_build_object('amendmentId',amendment_id));
 return public.market_amendments(p.id);
end $$;
-- Mediation prevents release; a reviewer can only reopen mutual review, never accept or pay.
alter function public.market_simulate_payment(uuid,text) rename to market_simulate_payment_before_operations;
create function public.market_simulate_payment(milestone_id uuid,operation text) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform 1 from private.market_projects where id=(select project_id from private.market_milestones where id=milestone_id) for update;
 if exists(select 1 from private.market_milestones where id=milestone_id and mediation) then raise exception 'Mediation must be resolved before payment'; end if;
 if exists(select 1 from private.market_amendments where project_id=(select project_id from private.market_milestones where id=milestone_id) and status='pending') then raise exception 'Resolve the pending amendment before payment'; end if;
 return public.market_simulate_payment_before_operations(milestone_id,operation); end $$;
revoke all on function public.market_simulate_payment_before_operations(uuid,text) from public,anon,authenticated,service_role;
do $$ declare f record; begin for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=any(array['market_capture_report','market_capture_dispute','market_review_cases','market_case_action','market_case_detail','market_milestone_notices','market_amendments','market_amendment_action','market_simulate_payment']) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); if f.nspname='public' then execute format('grant execute on function %s to %I',f.signature,case when f.proname='market_simulate_payment' then 'service_role' else 'authenticated' end); end if; end loop; end $$;

create function private.market_protect_reviewed_scope() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_table_name='market_milestones' then
  if old.mediation or old.disputed then raise exception 'Resolve mediation before submitting another delivery'; end if;
 else
  if exists(select 1 from private.market_amendments where project_id=old.id and status='pending') then raise exception 'Withdraw pending additions before revising the agreement'; end if;
 end if; return new;
end $$;
create trigger market_delivery_review_guard before update of submission_version on private.market_milestones for each row when(new.submission_version<>old.submission_version) execute function private.market_protect_reviewed_scope();
create trigger market_amendment_version_guard before update of agreement_version on private.market_projects for each row when(new.agreement_version<>old.agreement_version) execute function private.market_protect_reviewed_scope();
revoke all on function private.market_protect_reviewed_scope() from public,anon,authenticated,service_role;

insert into private.market_review_cases(report_id,reason) select id,'Conversation report: '||reason from private.market_reports on conflict do nothing;
insert into private.market_review_cases(milestone_id,submission_version,reason) select id,submission_version,'Existing milestone awaiting mediation' from private.market_milestones where mediation or disputed on conflict do nothing;

create function public.market_case_reviewer_options() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.market_account();
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'label',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),'Staff reviewer '||left(u.id::text,8))) order by u.id)
 from auth.users u where private.has_basic_membership(u.id) and exists(select 1 from public.staff_roles sr where sr.user_id=u.id)),'[]');
end $$;
revoke all on function public.market_case_reviewer_options() from public,anon,authenticated,service_role;
grant execute on function public.market_case_reviewer_options() to authenticated;

create function private.market_validate_brief_fields() returns trigger language plpgsql set search_path='' as $$
begin
 if new.brief ? 'budget_min' or new.brief ? 'budget_max' then
  if coalesce(new.brief->>'budget_min','') !~ '^[0-9]+([.][0-9]{1,2})?$' or coalesce(new.brief->>'budget_max','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Numeric service budget bounds required'; end if;
  if (new.brief->>'budget_min')::numeric<=0 or (new.brief->>'budget_max')::numeric<(new.brief->>'budget_min')::numeric then raise exception 'Budget maximum must be at least the positive minimum'; end if;
 end if;
 if new.brief ? 'skills' then
  if jsonb_typeof(new.brief->'skills') not in ('string','array') or length((new.brief->'skills')::text)>4000 then raise exception 'Invalid required skills'; end if;
  if jsonb_typeof(new.brief->'skills')='array' then
   if exists(select 1 from jsonb_array_elements(new.brief->'skills') item where jsonb_typeof(item)<>'string') then raise exception 'Skills must be text'; end if;
  end if;
 end if;
 return new;
end $$;
create trigger market_brief_fields before insert or update of brief on private.market_projects for each row execute function private.market_validate_brief_fields();
revoke all on function private.market_validate_brief_fields() from public,anon,authenticated,service_role;

alter function public.market_case_thread(uuid) set schema private;
revoke all on function private.market_case_thread(uuid) from public,anon,authenticated,service_role;
create function public.market_case_thread(report_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.market_account(); begin
 if not exists(select 1 from public.staff_roles sr where sr.user_id=u) or not exists(select 1 from private.market_review_cases c where c.report_id=market_case_thread.report_id and c.reviewer_id=u and c.status='assigned') then raise exception 'Active staff case assignment required' using errcode='42501'; end if;
 return private.market_case_thread(report_id);
end $$;
revoke all on function public.market_case_thread(uuid) from public,anon,authenticated,service_role;
grant execute on function public.market_case_thread(uuid) to authenticated;
