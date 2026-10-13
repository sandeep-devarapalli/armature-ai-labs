create table public.talent_profiles (
 id text primary key,
 data jsonb not null check(jsonb_typeof(data)='object'),
 revision integer not null default 1,
 published boolean not null default true
);
create unique index talent_linkedin_identity on public.talent_profiles ((lower(rtrim(data->>'linkedinUrl','/'))));
alter table public.talent_profiles enable row level security;
revoke all on public.talent_profiles from anon, authenticated;
grant select on public.talent_profiles to anon, authenticated;
create policy talent_public_read on public.talent_profiles for select to anon, authenticated using(published);
create table private.talent_owners (
 profile_id text primary key references public.talent_profiles(id),
 user_id uuid not null references auth.users(id),
 approved_at timestamptz not null default now()
);
create index talent_owner_user on private.talent_owners(user_id);
create table private.talent_suppressions (
 profile_id text primary key references public.talent_profiles(id),
 linkedin_url text not null unique,
 removed_at timestamptz not null default now()
);
create table private.talent_requests (
 id uuid primary key default gen_random_uuid(),
 profile_id text not null references public.talent_profiles(id),
 requester_id uuid not null references auth.users(id),
 kind text not null check(kind in ('claim','correction','removal')),
 evidence text not null,
 base_revision integer not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewer_id uuid references auth.users(id),
 review_note text
);
create unique index talent_pending_request on private.talent_requests(profile_id,requester_id,kind) where status='pending';
create index talent_requests_user_time on private.talent_requests(requester_id,created_at);
create index talent_requests_queue on private.talent_requests(status,created_at);
alter table private.talent_owners enable row level security;
alter table private.talent_requests enable row level security;
alter table private.talent_suppressions enable row level security;
revoke all on private.talent_owners,private.talent_requests,private.talent_suppressions from public,anon,authenticated;

create function private.talent_require_account() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until < now()))
 or exists(select 1 from public.memberships where user_id=u and status='suspended')
 or exists(select 1 from public.basic_onboarding_applications where user_id=u and status='revoked') then
 raise exception 'A confirmed email account is required' using errcode='42501'; end if;
 return u;
end $$;

create function private.talent_validate_patch(patch jsonb) returns void language plpgsql set search_path='' as $$
declare k text; v jsonb; item jsonb;
begin
 if patch is null or jsonb_typeof(patch)<>'object' or octet_length(patch::text)>20000 then raise exception 'Invalid profile patch' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(patch) loop
  if k in ('name','title','company','headline','location','summary') then
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>(case when k='summary' then 4000 when k='headline' then 1000 else 250 end) or (k='name' and length(trim(v#>>'{}'))=0) then raise exception 'Invalid text field: %',k using errcode='22023'; end if;
  elsif k in ('skills','physicalAiAreas','previousCompanies') then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>50 then raise exception 'Invalid list: %',k using errcode='22023'; end if;
   for item in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(item)<>'string' or length(item#>>'{}')>250 then raise exception 'Invalid list item' using errcode='22023'; end if;
   end loop;
  elsif k='yearsExperience' then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number') then raise exception 'Invalid experience' using errcode='22023'; end if;
   if jsonb_typeof(v)='number' and ((v#>>'{}')::numeric<0 or (v#>>'{}')::numeric>90) then raise exception 'Invalid experience' using errcode='22023'; end if;
  else raise exception 'Field is not editable: %',k using errcode='22023';
  end if;
 end loop;
end $$;

create function public.talent_submit_request(profile_id text,kind text,evidence text,base_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid := private.talent_require_account(); p public.talent_profiles; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,713));
 if kind not in ('claim','correction','removal') or kind is null or evidence is null or length(trim(evidence))<20 or length(evidence)>4000 then raise exception 'Supply a valid request and 20–4000 characters of evidence' using errcode='22023'; end if;
 select * into p from public.talent_profiles t where t.id=profile_id and t.published for update;
 if not found then raise exception 'Profile unavailable' using errcode='22023'; end if;
 if base_revision is distinct from p.revision then raise exception 'Profile changed; reload before requesting' using errcode='P0409'; end if;
 if kind='claim' and exists(select 1 from private.talent_owners o where o.profile_id=p.id) then raise exception 'Profile already claimed' using errcode='P0409'; end if;
 if exists(select 1 from private.talent_requests r where r.profile_id=p.id and r.requester_id=u and r.kind=talent_submit_request.kind and r.status='pending') then raise exception 'A request is already pending' using errcode='P0409'; end if;
 if (select count(*) from private.talent_requests where requester_id=u and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily request limit reached' using errcode='P0429'; end if;
 insert into private.talent_requests(profile_id,requester_id,kind,evidence,base_revision) values(p.id,u,kind,trim(evidence),p.revision) returning id into result;
 return result;
end $$;

create function public.talent_my_status(profile_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := private.talent_require_account();
begin
 return jsonb_build_object('owner',exists(select 1 from private.talent_owners o where o.profile_id=talent_my_status.profile_id and o.user_id=u),'admin',private.is_staff(array['admin','super_admin']::public.staff_role[]),'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'status',r.status,'evidence',r.evidence,'review_note',r.review_note,'created_at',r.created_at,'base_revision',r.base_revision) order by r.created_at desc) from private.talent_requests r where r.profile_id=talent_my_status.profile_id and r.requester_id=u),'[]'::jsonb));
end $$;

create function public.talent_review_queue() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.talent_require_account();
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select r.*,p.data->>'name' as profile_name from private.talent_requests r join public.talent_profiles p on p.id=r.profile_id where r.status='pending' order by r.created_at,r.id) q),'[]'::jsonb);
end $$;

create function public.talent_review_request(request_id uuid,decision text,note text,corrected_data jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare u uuid := private.talent_require_account(); r private.talent_requests; p public.talent_profiles;
begin
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Administrator required' using errcode='42501'; end if;
 if decision is null or decision not in ('approved','rejected') or note is null or length(trim(note))<10 or length(note)>4000 then raise exception 'Decision and review evidence required' using errcode='22023'; end if;
 select * into r from private.talent_requests where id=request_id for update;
 if not found or r.status<>'pending' then raise exception 'Request is not pending' using errcode='P0409'; end if;
 if r.requester_id=u then raise exception 'Another administrator must review your request' using errcode='42501'; end if;
 select * into p from public.talent_profiles where id=r.profile_id for update;
 if decision='approved' then
  if not p.published or p.revision<>r.base_revision then raise exception 'Profile changed; reject this request and request fresh evidence' using errcode='P0409'; end if;
  if r.kind='claim' then
   if exists(select 1 from private.talent_owners where profile_id=p.id) then raise exception 'Already claimed' using errcode='P0409'; end if;
   insert into private.talent_owners(profile_id,user_id) values(p.id,r.requester_id);
   update public.talent_profiles set data=jsonb_set(data,'{claimed}','true'),revision=revision+1 where id=p.id;
  elsif r.kind='removal' then
   insert into private.talent_suppressions(profile_id,linkedin_url) values(p.id,lower(rtrim(p.data->>'linkedinUrl','/'))) on conflict do nothing;
   update public.talent_profiles set published=false,revision=revision+1 where id=p.id;
  else
   if corrected_data is null or corrected_data='{}'::jsonb then raise exception 'Correction requires a reviewed patch' using errcode='22023'; end if;
   perform private.talent_validate_patch(corrected_data);
   update public.talent_profiles set data=data||corrected_data,revision=revision+1 where id=p.id;
  end if;
 end if;
 update private.talent_requests set status=decision,reviewed_at=now(),reviewer_id=u,review_note=trim(note) where id=r.id;
end $$;

create function public.talent_update_profile(profile_id text,expected_revision integer,patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account(); p public.talent_profiles;
begin
 if not exists(select 1 from private.talent_owners o where o.profile_id=talent_update_profile.profile_id and o.user_id=u) then raise exception 'Profile ownership required' using errcode='42501'; end if;
 perform private.talent_validate_patch(patch);
 select * into p from public.talent_profiles where id=profile_id for update;
 if not p.published or p.revision is distinct from expected_revision then raise exception 'Profile changed or removed; reload' using errcode='P0409'; end if;
 update public.talent_profiles set data=data||patch,revision=revision+1 where id=p.id returning * into p;
 return to_jsonb(p);
end $$;

create function public.talent_unlist_profile(profile_id text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account(); p public.talent_profiles;
begin
 if not exists(select 1 from private.talent_owners o where o.profile_id=talent_unlist_profile.profile_id and o.user_id=u) then raise exception 'Profile ownership required' using errcode='42501'; end if;
 select * into p from public.talent_profiles where id=profile_id for update;
 insert into private.talent_suppressions(profile_id,linkedin_url) values(p.id,lower(rtrim(p.data->>'linkedinUrl','/'))) on conflict do nothing;
 update public.talent_profiles set published=false,revision=revision+1 where id=p.id;
end $$;

create function public.talent_import_profiles(records jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; k text; added integer:=0; skipped integer:=0; affected integer;
begin
 if records is null or jsonb_typeof(records)<>'array' or jsonb_array_length(records)>500 then raise exception 'Import batches must contain at most 500 records' using errcode='22023'; end if;
 for p in select * from jsonb_array_elements(records) loop
  if jsonb_typeof(p)<>'object' or p->>'id' is null or length(p->>'id') not between 1 and 120 or p->>'id'~'[[:space:][:cntrl:]/?#]' or position(chr(92) in p->>'id')>0 or p->>'linkedinUrl' is null or p->>'linkedinUrl'!~'^https://www[.]linkedin[.]com/in/[^/?#]+/?$' or p->>'name' is null or p->>'checkedAt' is null or p->>'checkedAt'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid source identity' using errcode='22023'; end if;
  for k in select jsonb_object_keys(p) loop
   if k not in ('id','linkedinUrl','checkedAt','claimed','name','title','company','headline','location','summary','skills','physicalAiAreas','previousCompanies','yearsExperience') then raise exception 'Unexpected imported field: %',k using errcode='22023'; end if;
  end loop;
  perform private.talent_validate_patch(p-array['id','linkedinUrl','checkedAt','claimed']);
  p:='{"headline":"","title":"","company":"","location":"","summary":"","skills":[],"physicalAiAreas":[],"previousCompanies":[],"yearsExperience":null}'::jsonb || p;
  p:=jsonb_set(jsonb_set(p,'{claimed}','false'),'{linkedinUrl}',to_jsonb(rtrim(p->>'linkedinUrl','/')));
  if exists(select 1 from private.talent_suppressions s where s.profile_id=p->>'id' or s.linkedin_url=lower(p->>'linkedinUrl')) then skipped:=skipped+1; continue; end if;
  insert into public.talent_profiles(id,data) values(p->>'id',p) on conflict do nothing;
  get diagnostics affected=row_count;
  added:=added+affected; skipped:=skipped+1-affected;
 end loop;
 return jsonb_build_object('inserted',added,'skipped',skipped);
end $$;

revoke all on function private.talent_require_account(),private.talent_validate_patch(jsonb) from public,anon,authenticated;
revoke all on function public.talent_submit_request(text,text,text,integer),public.talent_my_status(text),public.talent_review_queue(),public.talent_review_request(uuid,text,text,jsonb),public.talent_update_profile(text,integer,jsonb),public.talent_unlist_profile(text),public.talent_import_profiles(jsonb) from public,anon,authenticated;
grant execute on function public.talent_submit_request(text,text,text,integer),public.talent_my_status(text),public.talent_review_queue(),public.talent_review_request(uuid,text,text,jsonb),public.talent_update_profile(text,integer,jsonb),public.talent_unlist_profile(text) to authenticated;
grant execute on function public.talent_import_profiles(jsonb) to service_role;
