-- Wishlist support is independent of paid membership and booking activation.
alter table public.component_requests
 add column request_scope text not null default 'component' check(request_scope in ('component','equipment_wishlist')),
 add column wishlist_category text check(length(trim(wishlist_category)) between 2 and 80),
 add column wishlist_model text check(length(wishlist_model)<=160),
 add column wishlist_status text not null default 'open' check(wishlist_status in ('open','under_review','planned','ordered','available','deferred','not_proceeding')),
 add column merged_into uuid references public.component_requests(id),
 add column public_note text check(length(public_note)<=1000),
 add column linked_component_slug text references public.components(slug),
 add column image_path text,
 add column image_content_type text check(image_content_type in ('image/png','image/jpeg','image/webp')),
 add constraint wishlist_merge_self check(merged_into is null or merged_into<>id),
 add constraint wishlist_image_pair check((image_path is null)=(image_content_type is null));
alter table public.component_requests drop constraint component_requests_verification_contract;
alter table public.component_requests add constraint component_requests_verification_contract check(
 (request_scope='equipment_wishlist' and verified_at is not null and verification_token_hash is null and verification_expires_at is null)
 or (request_scope='component' and ((verified_at is null and not is_published and verification_token_hash is not null and verification_expires_at is not null)
 or (verified_at is not null and verification_token_hash is null and is_published))));
create index equipment_wishlist_moderation on public.component_requests(created_at desc) where request_scope='equipment_wishlist' and not is_published and merged_into is null;

drop policy component_requests_staff_all on public.component_requests;
create policy component_requests_staff_all on public.component_requests for all to authenticated
using (request_scope='component' and private.is_staff(null))
with check (request_scope='component' and private.is_staff(null));
create policy equipment_requests_admin_read on public.component_requests for select to authenticated using(request_scope='equipment_wishlist' and private.is_staff(array['admin','super_admin']::public.staff_role[]));
drop policy component_request_votes_staff_all on public.component_request_votes;
create policy component_request_votes_staff_all on public.component_request_votes for all to authenticated
using (private.is_staff(null) and exists(select 1 from public.component_requests r where r.id=request_id and r.request_scope='component'))
with check (private.is_staff(null) and exists(select 1 from public.component_requests r where r.id=request_id and r.request_scope='component'));
create policy equipment_votes_admin_read on public.component_request_votes for select to authenticated using(private.is_staff(array['admin','super_admin']::public.staff_role[]));
create or replace view public.public_component_requests with(security_barrier=true) as
select r.id,r.component_name,r.vendor_url,r.project_use_case,r.requested_quantity,r.urgency,r.budget_band,r.notes,r.status,r.verified_at,r.created_at,count(v.member_id)::integer vote_count
from public.component_requests r left join public.component_request_votes v on v.request_id=r.id
where r.request_scope='component' and r.is_published and r.verified_at is not null group by r.id;
create view public.public_equipment_wishlist with(security_barrier=true) as
select r.id,r.component_name,r.project_use_case,r.vendor_url,r.requested_quantity,r.budget_band,r.wishlist_category,r.wishlist_model,r.wishlist_status,r.created_at,r.public_note,r.linked_component_slug,(r.image_path is not null) has_image,count(v.member_id)::integer vote_count
from public.component_requests r left join public.component_request_votes v on v.request_id=r.id
where r.request_scope='equipment_wishlist' and r.is_published and r.merged_into is null group by r.id;
grant select on public.public_equipment_wishlist to anon,authenticated;

create view public.my_equipment_wishlist with(security_barrier=true) as
select r.id,r.component_name,r.project_use_case,r.vendor_url,r.requested_quantity,r.budget_band,r.wishlist_category,r.wishlist_model,r.wishlist_status,r.created_at,r.public_note,r.linked_component_slug,r.is_published,r.merged_into,(r.image_path is not null) has_image,count(v.member_id)::integer vote_count
from public.component_requests r left join public.component_request_votes v on v.request_id=r.id
where r.request_scope='equipment_wishlist' and r.requester_user_id=auth.uid() group by r.id;
grant select on public.my_equipment_wishlist to authenticated;

create view public.public_equipment_wishlist_redirects with(security_barrier=true) as select s.id,s.merged_into from public.component_requests s join public.component_requests t on t.id=s.merged_into where s.request_scope='equipment_wishlist' and t.request_scope='equipment_wishlist' and t.is_published and t.merged_into is null;
grant select on public.public_equipment_wishlist_redirects to anon,authenticated;

create function private.wishlist_member_approved(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.basic_onboarding_applications a join auth.users u on u.id=a.user_id
 left join public.memberships m on m.user_id=a.user_id where a.user_id=p_user_id and a.status='approved'
 and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 and coalesce(m.status<>'suspended',true));
$$;
revoke all on function private.wishlist_member_approved(uuid) from public,anon,authenticated;

create function public.submit_equipment_wish(p_name text,p_use_case text,p_category text default 'Other',p_vendor_url text default null,p_quantity integer default 1,p_budget public.component_request_budget default 'unknown',p_model text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; email text;
begin
 perform 1 from public.basic_onboarding_applications where user_id=auth.uid() for share;
 if private.wishlist_member_approved(auth.uid()) is not true then raise exception 'Approved basic membership required' using errcode='42501'; end if;
 if p_category is null or length(trim(p_category)) not between 2 and 80 or length(coalesce(p_vendor_url,''))>2048 then raise exception 'Valid category and optional HTTPS URL required' using errcode='22023'; end if;
 select u.email into email from auth.users u where id=auth.uid();
 insert into public.component_requests(requester_user_id,requester_email,component_name,project_use_case,vendor_url,requested_quantity,budget_band,verified_at,request_scope,wishlist_category,wishlist_model)
 values(auth.uid(),lower(email),trim(p_name),trim(p_use_case),nullif(trim(p_vendor_url),''),p_quantity,p_budget,now(),'equipment_wishlist',trim(p_category),nullif(trim(p_model),'')) returning id into result;
 return result;
end; $$;
create or replace function public.vote_component_request(p_request_id uuid,p_enabled boolean default true) returns integer
language plpgsql security definer set search_path='' as $$
declare r public.component_requests; count_votes integer;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_enabled is null then raise exception 'Vote state required' using errcode='22023'; end if;
 perform 1 from public.basic_onboarding_applications where user_id=auth.uid() for share;
 select * into r from public.component_requests where id=p_request_id for update;
 if r.request_scope='equipment_wishlist' then
  if private.wishlist_member_approved(auth.uid()) is not true then raise exception 'Approved basic membership required' using errcode='42501'; end if;
  if not r.is_published or r.merged_into is not null or (p_enabled and r.wishlist_status in ('available','not_proceeding')) then raise exception 'Published open wishlist item required' using errcode='P0002'; end if;
 else
  if not private.has_active_membership(auth.uid(),now()) then raise exception 'active membership is required' using errcode='42501'; end if;
  if r.id is null or not r.is_published or r.verified_at is null or r.status='declined' then raise exception 'published request not found' using errcode='P0002'; end if;
 end if;
 if p_enabled then insert into public.component_request_votes(request_id,member_id) values(p_request_id,auth.uid()) on conflict do nothing;
 else delete from public.component_request_votes where request_id=p_request_id and member_id=auth.uid(); end if;
 select count(*)::integer into count_votes from public.component_request_votes where request_id=p_request_id;
 return count_votes;
end; $$;
create function public.edit_equipment_wish(p_request_id uuid,p_name text,p_use_case text,p_category text,p_vendor_url text,p_quantity integer,p_budget public.component_request_budget,p_model text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.component_requests;
begin
 perform pg_advisory_xact_lock(92726001);
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Website Admin required' using errcode='42501'; end if;
 if p_category is null or length(trim(p_category)) not between 2 and 80 or length(coalesce(p_vendor_url,''))>2048 then raise exception 'Valid category and optional HTTPS URL required' using errcode='22023'; end if;
 select * into r from public.component_requests where id=p_request_id and request_scope='equipment_wishlist' and merged_into is null for update;
 if not found then raise exception 'Wishlist item not found' using errcode='P0002'; end if;
 update public.component_requests set component_name=trim(p_name),project_use_case=trim(p_use_case),wishlist_category=trim(p_category),vendor_url=nullif(trim(p_vendor_url),''),requested_quantity=p_quantity,budget_band=p_budget,wishlist_model=nullif(trim(p_model),'') where id=r.id;
 perform private.record_audit(auth.uid(),'staff','equipment_wishlist.edited','component_request',r.id,
 jsonb_build_object('name',r.component_name,'use_case',r.project_use_case,'category',r.wishlist_category,'vendor_url',r.vendor_url,'quantity',r.requested_quantity,'budget',r.budget_band,'model',r.wishlist_model),
 jsonb_build_object('name',trim(p_name),'use_case',trim(p_use_case),'category',trim(p_category),'vendor_url',nullif(trim(p_vendor_url),''),'quantity',p_quantity,'budget',p_budget,'model',nullif(trim(p_model),'')));
end; $$;
revoke all on function public.edit_equipment_wish(uuid,text,text,text,text,integer,public.component_request_budget,text) from public,anon;
grant execute on function public.edit_equipment_wish(uuid,text,text,text,text,integer,public.component_request_budget,text) to authenticated;

create function public.moderate_equipment_wish(p_request_id uuid,p_publish boolean,p_status text,p_note text,p_public_note text default null,p_component_slug text default null) returns void
language plpgsql security definer set search_path='' as $$
declare r public.component_requests;
begin
 perform pg_advisory_xact_lock(92726001);
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Website Admin required' using errcode='42501'; end if;
 if p_publish is null or p_note is null or length(trim(p_note)) not between 2 and 1000 or p_status is null or p_status not in ('open','under_review','planned','ordered','available','deferred','not_proceeding') then raise exception 'Valid publication state, status and moderation note required' using errcode='22023'; end if;
 select * into r from public.component_requests where id=p_request_id and request_scope='equipment_wishlist' and merged_into is null for update;
 if not found then raise exception 'Wishlist item not found' using errcode='P0002'; end if;
 if p_status='available' and (case when p_component_slug is null then r.linked_component_slug else nullif(trim(p_component_slug),'') end) is null then raise exception 'Available equipment needs a catalogue link' using errcode='22023'; end if;
 update public.component_requests set is_published=p_publish,wishlist_status=p_status,decision_note=trim(p_note),public_note=case when p_public_note is null then r.public_note else nullif(trim(p_public_note),'') end,linked_component_slug=case when p_component_slug is null then r.linked_component_slug else nullif(trim(p_component_slug),'') end where id=r.id;
 perform private.record_audit(auth.uid(),'staff','equipment_wishlist.moderated','component_request',r.id,jsonb_build_object('published',r.is_published,'status',r.wishlist_status),jsonb_build_object('published',p_publish,'status',p_status,'public_note',p_public_note,'component_slug',p_component_slug),trim(p_note));
end; $$;
create function public.merge_equipment_wishes(p_source_id uuid,p_target_id uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare source public.component_requests; target public.component_requests;
begin
 perform pg_advisory_xact_lock(92726001);
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Website Admin required' using errcode='42501'; end if;
 if p_source_id=p_target_id or p_note is null or length(trim(p_note)) not between 2 and 1000 then raise exception 'Distinct items and merge note required' using errcode='22023'; end if;
 perform 1 from public.component_requests where id in(p_source_id,p_target_id) order by id for update;
 select * into source from public.component_requests where id=p_source_id and request_scope='equipment_wishlist' and merged_into is null;
 select * into target from public.component_requests where id=p_target_id and request_scope='equipment_wishlist' and merged_into is null and is_published;
 if source.id is null or target.id is null then raise exception 'Unmerged source and published target required' using errcode='P0002'; end if;
 insert into public.component_request_votes(request_id,member_id,created_at) select target.id,member_id,created_at from public.component_request_votes where request_id=source.id on conflict do nothing;
 delete from public.component_request_votes where request_id=source.id;
 update public.component_requests set merged_into=target.id where merged_into=source.id;
 update public.component_requests set merged_into=target.id,is_published=false,decision_note=trim(p_note) where id=source.id;
 perform private.record_audit(auth.uid(),'staff','equipment_wishlist.merged','component_request',source.id,jsonb_build_object('published',source.is_published),jsonb_build_object('merged_into',target.id),trim(p_note));
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('equipment-wishlist-images','equipment-wishlist-images',false,5242880,array['image/png','image/jpeg','image/webp']);
create table public.equipment_wishlist_image_cleanup(object_path text primary key, queued_at timestamptz not null default now(), claimed_at timestamptz);
alter table public.equipment_wishlist_image_cleanup enable row level security;
revoke all on public.equipment_wishlist_image_cleanup from public,anon,authenticated;
grant all on public.equipment_wishlist_image_cleanup to service_role;
create function public.claim_equipment_wish_images(p_limit integer default 100) returns table(object_path text)
language sql security definer set search_path='' as $$
 with due as (
  select q.object_path from public.equipment_wishlist_image_cleanup q
  where q.queued_at<=clock_timestamp() and (q.claimed_at is null or q.claimed_at<clock_timestamp()-interval '10 minutes')
  order by q.queued_at limit least(greatest(p_limit,0),100) for update skip locked
 ) update public.equipment_wishlist_image_cleanup q set claimed_at=clock_timestamp()
 from due where q.object_path=due.object_path returning q.object_path;
$$;
revoke all on function public.claim_equipment_wish_images(integer) from public,anon,authenticated;
grant execute on function public.claim_equipment_wish_images(integer) to service_role;
create function public.finish_equipment_wish_image(p_request_id uuid,p_user_id uuid,p_path text,p_type text) returns text
language plpgsql security definer set search_path='' as $$
declare r public.component_requests; extension text;
begin
 perform 1 from public.basic_onboarding_applications where user_id=p_user_id for share;
 if private.wishlist_member_approved(p_user_id) is not true then raise exception 'Approved basic membership required' using errcode='42501'; end if;
 extension:=case p_type when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' else null end;
 if extension is null or p_path is null or p_path !~ ('^'||p_request_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'||extension||'$') then raise exception 'Valid scoped image path required' using errcode='22023'; end if;
 select * into r from public.component_requests where id=p_request_id and request_scope='equipment_wishlist' and requester_user_id=p_user_id and not is_published and merged_into is null for update;
 if not found then raise exception 'Own unpublished wishlist item required' using errcode='42501'; end if;
 perform 1 from public.equipment_wishlist_image_cleanup where object_path=p_path and queued_at>clock_timestamp() and claimed_at is null for update;
 if not found then raise exception 'Unexpired image upload reservation required' using errcode='22023'; end if;
 update public.component_requests set image_path=p_path,image_content_type=p_type where id=r.id;
 delete from public.equipment_wishlist_image_cleanup where object_path=p_path;
 if r.image_path is not null and r.image_path<>p_path then
  insert into public.equipment_wishlist_image_cleanup(object_path) values(r.image_path) on conflict(object_path) do nothing;
 end if;
 return r.image_path;
end; $$;
revoke all on function public.submit_equipment_wish(text,text,text,text,integer,public.component_request_budget,text),public.moderate_equipment_wish(uuid,boolean,text,text,text,text),public.merge_equipment_wishes(uuid,uuid,text) from public,anon;
grant execute on function public.submit_equipment_wish(text,text,text,text,integer,public.component_request_budget,text),public.moderate_equipment_wish(uuid,boolean,text,text,text,text),public.merge_equipment_wishes(uuid,uuid,text) to authenticated;
revoke all on function public.finish_equipment_wish_image(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_equipment_wish_image(uuid,uuid,text,text) to service_role;
insert into public.component_requests(id,requester_email,component_name,project_use_case,request_scope,wishlist_category,wishlist_status,verified_at,is_published)
values
('e0000000-0000-4000-8000-000000000001','hello@armatureailabs.com','Jetson Thor','Explore demand for future local physical AI compute.','equipment_wishlist','Compute','deferred',now(),true),
('e0000000-0000-4000-8000-000000000002','hello@armatureailabs.com','Industrial robotic arms','Explore demand for future industrial robotics projects.','equipment_wishlist','Robotics','deferred',now(),true),
('e0000000-0000-4000-8000-000000000003','hello@armatureailabs.com','Laser cutting','Explore demand for future in-lab laser cutting access.','equipment_wishlist','Fabrication','deferred',now(),true),
('e0000000-0000-4000-8000-000000000004','hello@armatureailabs.com','Rapid PCB fabrication','Explore demand for future rapid circuit-board prototyping.','equipment_wishlist','Electronics','deferred',now(),true);

create or replace function public.verify_component_request(
  p_request_id uuid,
  p_verification_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  update public.component_requests
  set
    verification_token_hash = null,
    verification_expires_at = null,
    verified_at = now(),
    is_published = true
  where id = p_request_id
    and request_scope = 'component'
    and verified_at is null
    and verification_expires_at > now()
    and verification_token_hash = extensions.digest(
      convert_to(p_verification_token, 'utf8'),
      'sha256'
    )
  returning id into v_request_id;

  if v_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'verification token is expired, invalid, or already used';
  end if;

  return v_request_id;
end;
$$;


create or replace function public.set_component_request_status(
  p_request_id uuid,
  p_status public.component_request_status,
  p_decision_note text default null
)
returns public.component_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid := auth.uid();
  v_before public.component_requests%rowtype;
begin
  if not private.is_staff(array['operations', 'admin', 'super_admin']::public.staff_role[]) then
    raise exception using errcode = '42501', message = 'operations staff role required';
  end if;

  select *
  into v_before
  from public.component_requests
  where id = p_request_id
    and request_scope = 'component'
    and is_published
    and verified_at is not null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'verified request not found';
  end if;

  update public.component_requests
  set
    status = p_status,
    decision_note = nullif(btrim(p_decision_note), ''),
    decided_by = case
      when p_status in ('submitted', 'under_review') then null
      else v_staff_id
    end,
    decided_at = case
      when p_status in ('submitted', 'under_review') then null
      else now()
    end
  where id = p_request_id;

  perform private.record_audit(
    v_staff_id,
    'staff',
    'component_request.status_changed',
    'component_request',
    p_request_id,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', p_status),
    coalesce(nullif(btrim(p_decision_note), ''), 'Staff request triage')
  );

  return p_status;
end;
$$;