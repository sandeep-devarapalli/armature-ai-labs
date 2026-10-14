create function private.talent_canonical_linkedin(value text) returns text language plpgsql immutable set search_path='' as $$
declare v text:=lower(trim(value)); match text[]; slug text; raw bytea:=''::bytea; c text; i integer:=1;
begin
 match:=regexp_match(v,'^(https?://)?([a-z]{2,3}[.])?linkedin[.]com/in/([^/?#[:space:]]+)(/)?([?#].*)?$');
 if match is null or length(v)>1000 then raise exception 'Enter a LinkedIn personal profile URL' using errcode='22023'; end if;
 slug:=match[3];
 while i<=length(slug) loop
  c:=substr(slug,i,1);
  if c='%' then
   if substr(slug,i+1,2)!~'^[0-9a-f]{2}$' then raise exception 'Invalid LinkedIn URL encoding' using errcode='22023'; end if;
   raw:=raw||decode(substr(slug,i+1,2),'hex'); i:=i+3;
  else raw:=raw||convert_to(c,'UTF8'); i:=i+1; end if;
 end loop;
 slug:=lower(convert_from(raw,'UTF8'));
 if slug~'[/?#%[:space:][:cntrl:]]' or position(chr(92) in slug)>0 then raise exception 'Invalid LinkedIn profile identifier' using errcode='22023'; end if;
 return 'https://www.linkedin.com/in/'||slug;
end $$;
-- Covers imports as well as simultaneous approvals, even when URL spelling differs.
create unique index talent_canonical_identity on public.talent_profiles(private.talent_canonical_linkedin(data->>'linkedinUrl'));

alter function private.talent_validate_patch(jsonb) rename to talent_validate_original_patch;
create function private.talent_validate_patch(patch jsonb) returns void language plpgsql set search_path='' as $$
declare k text;
begin
 perform private.talent_validate_original_patch(patch-array['education','experience','availability']);
 foreach k in array array['education','experience'] loop
  if patch ? k and (jsonb_typeof(patch->k)<>'string' or length(patch->>k)>4000) then raise exception 'Invalid profile history' using errcode='22023'; end if;
 end loop;
 if patch ? 'availability' and (jsonb_typeof(patch->'availability')<>'string' or patch->>'availability' not in ('unknown','available','unavailable')) then raise exception 'Invalid availability' using errcode='22023'; end if;
 if octet_length(patch::text)>20000 then raise exception 'Profile too large' using errcode='22023'; end if;
end $$;
create table private.talent_submissions(
 id uuid primary key default gen_random_uuid(),requester_id uuid not null references auth.users(id),
 status text not null default 'draft' check(status in ('draft','pending','approved','rejected','changes_requested')),
 revision integer not null default 1,data jsonb not null,evidence text not null default '',
 profile_id text references public.talent_profiles(id),review_note text,reviewer_id uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),submitted_at timestamptz,reviewed_at timestamptz
);
create unique index talent_one_open_submission on private.talent_submissions(requester_id) where status<>'approved';
create unique index talent_active_submission_identity on private.talent_submissions(private.talent_canonical_linkedin(data->>'linkedinUrl')) where status='pending';
create index talent_submission_pending on private.talent_submissions(status,submitted_at);
create table private.talent_submission_history(
 id bigint generated always as identity primary key,submission_id uuid not null references private.talent_submissions(id),
 revision integer not null,event text not null,actor_id uuid not null references auth.users(id),snapshot jsonb not null,at timestamptz not null default now()
);
alter table private.talent_submissions enable row level security;
alter table private.talent_submission_history enable row level security;
revoke all on private.talent_submissions,private.talent_submission_history from public,anon,authenticated;
create function private.talent_immutable_history() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Submission history is immutable' using errcode='22023'; end $$;
create trigger talent_submission_history_immutable before update or delete on private.talent_submission_history for each row execute function private.talent_immutable_history();
create function private.talent_submission_account() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account();
begin
 if not private.has_basic_membership(u) then raise exception 'Basic membership required' using errcode='42501'; end if; return u;
end $$;
create function public.talent_check_submission_identity(linkedin_url text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_submission_account(); url text:=private.talent_canonical_linkedin(linkedin_url); p public.talent_profiles;
begin
 if exists(select 1 from private.talent_suppressions s where private.talent_canonical_linkedin(s.linkedin_url)=url) then return jsonb_build_object('status','unavailable'); end if;
 select * into p from public.talent_profiles t where private.talent_canonical_linkedin(t.data->>'linkedinUrl')=url;
 if found then
  if p.published then return jsonb_build_object('status','existing','profile_id',p.id,'linkedin_url',url); end if;
  return jsonb_build_object('status','unavailable');
 end if;
 if exists(select 1 from private.talent_submissions s where s.requester_id<>u and s.status='pending' and private.talent_canonical_linkedin(s.data->>'linkedinUrl')=url) then return jsonb_build_object('status','unavailable'); end if;
 return jsonb_build_object('status','available','linkedin_url',url);
end $$;
create function public.talent_save_submission(submission_id uuid,expected_revision integer,profile_data jsonb,private_evidence text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_submission_account(); r private.talent_submissions; d jsonb; check_result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,714));
 if profile_data is null or jsonb_typeof(profile_data)<>'object' or private_evidence is null or length(private_evidence)>4000 then raise exception 'Invalid draft' using errcode='22023'; end if;
 perform private.talent_validate_patch((profile_data-'linkedinUrl') || case when profile_data->>'name'='' then '{"name":"Draft"}'::jsonb else '{}'::jsonb end);
 check_result:=public.talent_check_submission_identity(profile_data->>'linkedinUrl');
 if check_result->>'status'<>'available' then raise exception 'Profile already listed or unavailable; check the directory or contact support' using errcode='P0409'; end if;
 d:='{"name":"","title":"","location":"","company":"","headline":"","summary":"","skills":[],"physicalAiAreas":[],"previousCompanies":[],"yearsExperience":null,"education":"","experience":"","availability":"unknown"}'::jsonb||profile_data||jsonb_build_object('linkedinUrl',check_result->>'linkedin_url');
 if submission_id is null then
  if expected_revision is not null then raise exception 'Unexpected revision' using errcode='P0409'; end if;
  if exists(select 1 from private.talent_owners where user_id=u) then raise exception 'You already own a profile; edit it instead' using errcode='P0409'; end if;
  insert into private.talent_submissions(requester_id,data,evidence) values(u,d,trim(private_evidence)) returning * into r;
 else
  select * into r from private.talent_submissions s where s.id=submission_id and s.requester_id=u for update;
  if not found then raise exception 'Draft unavailable' using errcode='42501'; end if;
  if r.status in ('pending','approved') or r.revision is distinct from expected_revision then raise exception 'Draft changed or awaiting review' using errcode='P0409'; end if;
  update private.talent_submissions set data=d,evidence=trim(private_evidence),revision=revision+1,status='draft',updated_at=now() where id=r.id returning * into r;
 end if;
 return to_jsonb(r);
end $$;
create function public.talent_submit_profile(submission_id uuid,expected_revision integer,signed_name text,declaration_version text,declaration_accepted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_submission_account(); r private.talent_submissions; declaration jsonb;
begin
 select * into r from private.talent_submissions s where s.id=submission_id and s.requester_id=u for update;
 if not found then raise exception 'Draft unavailable' using errcode='42501'; end if;
 if r.status<>'draft' or r.revision is distinct from expected_revision then raise exception 'Draft changed or awaiting review' using errcode='P0409'; end if;
 if length(trim(r.data->>'name'))<2 or length(trim(r.data->>'title'))<2 or length(trim(r.data->>'location'))<2 or length(r.evidence)<20 then raise exception 'Name, title, location and private review evidence required' using errcode='22023'; end if;
 if declaration_accepted is distinct from true or declaration_version is distinct from '2026-10-14-add-profile-v1' or signed_name is null or lower(trim(signed_name))<>lower(trim(r.data->>'name')) then raise exception 'Sign your profile name and accept the declaration' using errcode='22023'; end if;
 if public.talent_check_submission_identity(r.data->>'linkedinUrl')->>'status'<>'available' then raise exception 'Profile already listed or unavailable' using errcode='P0409'; end if;
 if (select count(*) from private.talent_submission_history h where h.actor_id=u and h.event='submitted' and h.at>now()-interval '24 hours')>=10 then raise exception 'Daily submission limit reached' using errcode='P0429'; end if;
 declaration:=jsonb_build_object('version',declaration_version,'signed_name',trim(signed_name),'accepted_at',clock_timestamp(),'requester_id',u,'text','I confirm that this profile represents me, that the information I provided is accurate to the best of my knowledge, and that I am authorised to publish it. I understand that Armature will manually review my submission before publication and that impersonation may result in rejection or account restrictions.');
 update private.talent_submissions set status='pending',submitted_at=now(),updated_at=now(),review_note=null,reviewer_id=null,reviewed_at=null where id=r.id returning * into r;
 insert into private.talent_submission_history(submission_id,revision,event,actor_id,snapshot) values(r.id,r.revision,'submitted',u,to_jsonb(r)||jsonb_build_object('declaration',declaration));
 return to_jsonb(r);
end $$;
create function public.talent_my_submissions() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_submission_account();
begin return coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc) from private.talent_submissions s where s.requester_id=u),'[]'::jsonb); end $$;
create function public.talent_submission_queue() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.talent_require_account();
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('declaration',(select h.snapshot->'declaration' from private.talent_submission_history h where h.submission_id=s.id and h.revision=s.revision and h.event='submitted' order by h.id desc limit 1)) order by s.submitted_at) from private.talent_submissions s where status='pending'),'[]'::jsonb);
end $$;
create function public.talent_review_submission(submission_id uuid,expected_revision integer,decision text,note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account(); r private.talent_submissions; pid text; d jsonb;
begin
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Administrator required' using errcode='42501'; end if;
 if decision is null or decision not in ('approved','rejected','changes_requested') or note is null or length(trim(note)) not between 10 and 4000 then raise exception 'Decision and review note required' using errcode='22023'; end if;
 select * into r from private.talent_submissions s where s.id=submission_id for update;
 if not found or r.status<>'pending' or r.revision is distinct from expected_revision then raise exception 'Submission changed or no longer pending' using errcode='P0409'; end if;
 if u=r.requester_id then raise exception 'Another administrator must review your submission' using errcode='42501'; end if;
 if decision='approved' then
  perform pg_advisory_xact_lock(hashtextextended(r.requester_id::text,714));
  if not private.has_basic_membership(r.requester_id) then raise exception 'Applicant must retain basic membership' using errcode='42501'; end if;
  if exists(select 1 from private.talent_owners where user_id=r.requester_id) then raise exception 'Member already owns a profile' using errcode='P0409'; end if;
  if exists(select 1 from public.talent_profiles p where private.talent_canonical_linkedin(p.data->>'linkedinUrl')=r.data->>'linkedinUrl') or exists(select 1 from private.talent_suppressions s where private.talent_canonical_linkedin(s.linkedin_url)=r.data->>'linkedinUrl') then raise exception 'Profile already listed or unavailable' using errcode='P0409'; end if;
  if not exists(select 1 from private.talent_submission_history h where h.submission_id=r.id and h.revision=r.revision and h.event='submitted' and h.snapshot->'data'=r.data and h.snapshot->'declaration'->>'version'='2026-10-14-add-profile-v1') then raise exception 'Signed revision required' using errcode='22023'; end if;
  pid:='member-'||r.id::text;
  d:=r.data||jsonb_build_object('id',pid,'claimed',true,'source','member','checkedAt',to_char(now(),'YYYY-MM-DD'));
  insert into public.talent_profiles(id,data) values(pid,d);
  insert into private.talent_owners(profile_id,user_id) values(pid,r.requester_id);
 end if;
 update private.talent_submissions set status=decision,profile_id=pid,review_note=trim(note),reviewer_id=u,reviewed_at=now(),updated_at=now() where id=r.id returning * into r;
 insert into private.talent_submission_history(submission_id,revision,event,actor_id,snapshot) values(r.id,r.revision,decision,u,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function private.talent_canonical_linkedin(text),private.talent_validate_patch(jsonb),private.talent_immutable_history(),private.talent_submission_account() from public,anon,authenticated;
revoke all on function public.talent_check_submission_identity(text),public.talent_save_submission(uuid,integer,jsonb,text),public.talent_submit_profile(uuid,integer,text,text,boolean),public.talent_my_submissions(),public.talent_submission_queue(),public.talent_review_submission(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.talent_check_submission_identity(text),public.talent_save_submission(uuid,integer,jsonb,text),public.talent_submit_profile(uuid,integer,text,text,boolean),public.talent_my_submissions(),public.talent_submission_queue(),public.talent_review_submission(uuid,integer,text,text) to authenticated;

-- Claims and new submissions share the same one-owner guard and transaction lock.
create or replace function public.talent_review_request(request_id uuid,decision text,note text,corrected_data jsonb default null) returns void language plpgsql security definer set search_path='' as $$
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
   perform pg_advisory_xact_lock(hashtextextended(r.requester_id::text,714));
   if exists(select 1 from private.talent_owners where user_id=r.requester_id) then raise exception 'Member already owns a profile' using errcode='P0409'; end if;
   if r.declaration is null or r.declaration->>'version' is distinct from '2026-10-13-v1' then raise exception 'Unsigned legacy claims cannot be approved; reject and request a new signed claim' using errcode='22023'; end if;
   if not private.has_basic_membership(r.requester_id) then raise exception 'Claimant must retain basic membership' using errcode='42501'; end if;
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

