-- Keep published and funded scope immutable; returned briefs are editable by their buyer only.
alter function public.market_project_action(uuid,text,jsonb) set schema private;
revoke all on function private.market_project_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.market_project_action(project_id uuid,action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account(); p private.market_projects; note text;
begin
 if action is null or action not in ('request_changes','edit_brief') then return private.market_project_action(project_id,action,payload); end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>50000 then raise exception 'Invalid payload'; end if;
 select * into p from private.market_projects where id=project_id for update;
 if p.id is null then raise exception 'Project unavailable' using errcode='42501'; end if;
 if action='request_changes' then
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) or p.status<>'review' then raise exception 'Administrator and review-stage brief required' using errcode='42501'; end if;
  note:=trim(coalesce(payload->>'note',''));
  if length(note)<10 or length(note)>4000 then raise exception 'Explain the requested changes in 10 to 4000 characters'; end if;
  update private.market_projects set status='draft' where id=p.id;
  insert into private.market_activity(project_id,actor,event,payload) values(p.id,u,action,jsonb_build_object('note',note));
 else
  if p.buyer_id<>u or p.status<>'draft' or p.agreement is not null or exists(select 1 from private.market_milestones m where m.project_id=p.id) then raise exception 'Unfunded draft owner required' using errcode='42501'; end if;
  if length(trim(coalesce(payload->>'title','')))=0 or length(trim(coalesce(payload->>'deliverables','')))=0 or length(trim(coalesce(payload->>'acceptance','')))=0 then raise exception 'Title, deliverables and acceptance required'; end if;
  if payload ? 'budget_min' or payload ? 'budget_max' then
   if jsonb_typeof(payload->'budget_min') is distinct from 'number' or jsonb_typeof(payload->'budget_max') is distinct from 'number' then raise exception 'Numeric service budget required'; end if;
   if (payload->>'budget_min')::numeric<=0 or (payload->>'budget_max')::numeric<(payload->>'budget_min')::numeric then raise exception 'Invalid service budget range'; end if;
  end if;
  update private.market_projects set brief=payload where id=p.id;
  insert into private.market_activity(project_id,actor,event,payload) values(p.id,u,action,jsonb_build_object('before',p.brief,'after',payload));
 end if;
 return public.market_project_detail(p.id);
end $$;
revoke all on function public.market_project_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.market_project_action(uuid,text,jsonb) to authenticated;
