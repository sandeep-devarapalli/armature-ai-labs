alter table private.talent_requests add column declaration jsonb;

create function private.talent_claim_declaration_text() returns text language sql immutable set search_path='' as $$
 select 'I declare that I am the person named in this profile and that the linked LinkedIn profile represents me. The information and evidence I provide are accurate to the best of my knowledge. I am not claiming this profile on behalf of another person. I understand that Armature will manually review my claim before granting editing access, and that a false claim may be rejected or my access revoked.'::text;
$$;

create function private.talent_preserve_claim_declaration() returns trigger language plpgsql set search_path='' as $$
begin
 if new.declaration is distinct from old.declaration or (old.declaration is not null and (new.requester_id is distinct from old.requester_id or new.profile_id is distinct from old.profile_id or new.kind is distinct from old.kind)) then
  raise exception 'A signed ownership declaration cannot be changed' using errcode='22023';
 end if;
 return new;
end $$;
create trigger talent_preserve_claim_declaration before update on private.talent_requests for each row execute function private.talent_preserve_claim_declaration();

drop function public.talent_submit_request(text,text,text,integer);
create function public.talent_submit_request(profile_id text,kind text,evidence text,base_revision integer,signed_name text default null,declaration_version text default null,declaration_accepted boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid := private.talent_require_account(); p public.talent_profiles; result uuid; signed_declaration jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,713));
 if kind not in ('claim','correction','removal') or kind is null or evidence is null or length(trim(evidence))<20 or length(evidence)>4000 then raise exception 'Supply a valid request and 20–4000 characters of evidence' using errcode='22023'; end if;
 select * into p from public.talent_profiles t where t.id=profile_id and t.published for update;
 if not found then raise exception 'Profile unavailable' using errcode='22023'; end if;
 if base_revision is distinct from p.revision then raise exception 'Profile changed; reload before requesting' using errcode='P0409'; end if;
 if kind='claim' then
  if not private.has_basic_membership(u) then raise exception 'Basic membership is required to claim a profile' using errcode='42501'; end if;
  if declaration_accepted is distinct from true or declaration_version is distinct from '2026-10-13-v1' or signed_name is null or length(trim(signed_name)) not between 2 and 200 then raise exception 'Sign and accept the current ownership declaration' using errcode='22023'; end if;
  signed_declaration:=jsonb_build_object('signed_name',trim(signed_name),'version','2026-10-13-v1','text',private.talent_claim_declaration_text(),'accepted_at',clock_timestamp(),'requester_id',u,'profile_id',p.id,'profile_name',p.data->>'name','linkedin_url',p.data->>'linkedinUrl');
 end if;
 if kind='claim' and exists(select 1 from private.talent_owners o where o.profile_id=p.id) then raise exception 'Profile already claimed' using errcode='P0409'; end if;
 if exists(select 1 from private.talent_requests r where r.profile_id=p.id and r.requester_id=u and r.kind=talent_submit_request.kind and r.status='pending') then raise exception 'A request is already pending' using errcode='P0409'; end if;
 if (select count(*) from private.talent_requests where requester_id=u and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily request limit reached' using errcode='P0429'; end if;
 insert into private.talent_requests(profile_id,requester_id,kind,evidence,base_revision,declaration) values(p.id,u,kind,trim(evidence),p.revision,signed_declaration) returning id into result;
 return result;
end $$;

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

revoke all on function private.talent_claim_declaration_text(),private.talent_preserve_claim_declaration(),public.talent_submit_request(text,text,text,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.talent_submit_request(text,text,text,integer,text,text,boolean) to authenticated;
