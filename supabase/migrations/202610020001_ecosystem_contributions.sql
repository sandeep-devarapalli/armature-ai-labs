-- Public snapshots are separate from private drafts. Only review RPCs publish.
create table public.ecosystem_listings (
 slug text primary key check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 revision integer not null default 1 check(revision > 0),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=24000),
 published boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.ecosystem_submissions (
 id uuid primary key default extensions.gen_random_uuid(),
 idempotency_key text not null unique, payload_hash text not null,
 kind text not null check(kind in ('new','update')),
 target_slug text references public.ecosystem_listings(slug), base_revision integer,
 base_data jsonb, proposed jsonb not null check(jsonb_typeof(proposed)='object' and octet_length(proposed::text)<=24000),
 proposal_revision integer not null default 1 check(proposal_revision>0),
 submitter_name text check(length(submitter_name)<=120), submitter_email text check(length(submitter_email)<=254),
 contacts_permission boolean not null default false,
 status text not null default 'pending' check(status in ('pending','needs_info','rejected','approved')),
 reviewer_notes text check(length(reviewer_notes)<=4000), reviewer_id uuid references auth.users(id) on delete set null,
 source text not null default 'web' check(source in ('web','github','research')),
 created_at timestamptz not null default now(), closed_at timestamptz,
 check((kind='new' and target_slug is null and base_revision is null) or (kind='update' and target_slug is not null and base_revision is not null))
);
create index ecosystem_submission_queue on public.ecosystem_submissions(status,created_at);
create table public.ecosystem_review_history (
 id bigint generated always as identity primary key,
 submission_id uuid not null references public.ecosystem_submissions(id),
 reviewer_id uuid references auth.users(id) on delete set null,
 action text not null, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
create table private.ecosystem_rate_limits (
 key_hash text primary key, window_start timestamptz not null, count integer not null
);
create table private.ecosystem_notifications (
 submission_id uuid primary key references public.ecosystem_submissions(id),
 state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
 attempts integer not null default 0, lease uuid, retry_at timestamptz not null default now(), sent_at timestamptz
);
alter table public.ecosystem_listings enable row level security;
alter table public.ecosystem_submissions enable row level security;
alter table public.ecosystem_review_history enable row level security;
revoke all on public.ecosystem_listings,public.ecosystem_submissions,public.ecosystem_review_history from public,anon,authenticated,service_role;
revoke all on private.ecosystem_rate_limits from public,anon,authenticated,service_role;
revoke all on private.ecosystem_notifications from public,anon,authenticated,service_role;
grant select on public.ecosystem_listings to anon,authenticated;
grant select on public.ecosystem_listings to service_role;
grant select on public.ecosystem_submissions,public.ecosystem_review_history to authenticated;
create policy ecosystem_published_read on public.ecosystem_listings for select to anon using(published);
create policy ecosystem_member_read on public.ecosystem_listings for select to authenticated using(published or private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy ecosystem_admin_read on public.ecosystem_submissions for select to authenticated using(private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy ecosystem_history_admin_read on public.ecosystem_review_history for select to authenticated using(private.is_staff(array['admin','super_admin']::public.staff_role[]));

create function private.validate_ecosystem_data(d jsonb) returns void language plpgsql set search_path='' as $$
declare k text; phone jsonb; item jsonb;
begin
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>24000 or length(coalesce(d->>'name','')) not between 2 and 160
 or length(coalesce(d->>'summary','')) not between 10 and 2000 or coalesce(d->>'primaryType','') not in ('startup','research-ecosystem','supplier','vendor','other') then
 raise exception 'Invalid listing data' using errcode='22023'; end if;
 for k in select jsonb_object_keys(d) loop
 if k not in ('slug','name','entityType','sectors','summary','locality','coordinates','locationPrecision','confidence','locationConfidence','websiteUrl','sourceUrl','founders','provenance','verifiedAt','primaryType','alsoListedAs','needs','subcategory','publicPhones','publicEmail','accessNote','tips','engageHow','salesChannel','priceLevel','minOrder','pricingModel','turnaround','credit') then
 raise exception 'Unsupported public field' using errcode='22023'; end if;
 if k not in ('sectors','coordinates','alsoListedAs','needs','publicPhones','credit') and (jsonb_typeof(d->k)<>'string' or length(d->>k)>2000) then raise exception 'Invalid public text' using errcode='22023'; end if;
 end loop;
 if (d ? 'entityType' and d->>'entityType' not in ('Startup','Company','Research & ecosystem'))
 or (d ? 'locationPrecision' and d->>'locationPrecision' not in ('Address-level','Locality-level','City-level','Metro presence'))
 or (d ? 'confidence' and d->>'confidence' not in ('High','Medium'))
 or (d ? 'locationConfidence' and d->>'locationConfidence' not in ('High','Medium')) then raise exception 'Invalid listing metadata' using errcode='22023'; end if;
 if coalesce(d->>'websiteUrl','')='' and coalesce(d->>'sourceUrl','')='' and coalesce(d->>'publicEmail','')='' and jsonb_array_length(coalesce(d->'publicPhones','[]'))=0 then raise exception 'Public link or contact required' using errcode='22023'; end if;
 if d->>'primaryType'='startup' and coalesce(d->>'sourceUrl','')='' then raise exception 'Source required' using errcode='22023'; end if;
 if coalesce(d->>'publicEmail','')<>'' and (length(d->>'publicEmail')>254 or d->>'publicEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid public email' using errcode='22023'; end if;
 foreach k in array array['websiteUrl','sourceUrl'] loop
 if coalesce(d->>k,'')<>'' and (d->>k !~ '^https?://[^[:space:]]+$' or d->>k ~ '^https?://[^/]*@') then raise exception 'Invalid public URL' using errcode='22023'; end if;
 end loop;
 foreach k in array array['sectors','alsoListedAs','needs'] loop
 if d ? k then
 if jsonb_typeof(d->k)<>'array' or jsonb_array_length(d->k)>12 then raise exception 'Invalid listing categories' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(d->k) loop
 if jsonb_typeof(item)<>'string' or (k='needs' and item#>>'{}' not in ('build','source','manufacture','test','learn','fund','pilot'))
 or (k='alsoListedAs' and item#>>'{}' not in ('startup','research-ecosystem','supplier','vendor','other'))
 or (k='sectors' and item#>>'{}' not in ('Robotics','Physical AI','Drones & aerospace','Space hardware','Industrial automation','Hardware & sensing','Edge & embedded systems','Learning & training','Research & ecosystem')) then raise exception 'Invalid listing category' using errcode='22023'; end if;
 end loop;
 end if;
 end loop;
 if d ? 'coordinates' then
 if coalesce(d->>'locationPrecision','') not in ('Address-level','Locality-level') then raise exception 'Unconfirmed locations must remain unpinned' using errcode='22023'; end if;
 if jsonb_typeof(d->'coordinates')<>'array' or jsonb_array_length(d->'coordinates')<>2 or jsonb_typeof(d->'coordinates'->0)<>'number' or jsonb_typeof(d->'coordinates'->1)<>'number' then raise exception 'Invalid coordinates' using errcode='22023'; end if;
 if abs((d->'coordinates'->>0)::numeric)>180 or abs((d->'coordinates'->>1)::numeric)>90 then raise exception 'Invalid coordinates' using errcode='22023'; end if;
 end if;
 if d ? 'publicPhones' then
 if jsonb_typeof(d->'publicPhones')<>'array' or jsonb_array_length(d->'publicPhones')>5 then raise exception 'Invalid public phones' using errcode='22023'; end if;
 for phone in select * from jsonb_array_elements(d->'publicPhones') loop
 if jsonb_typeof(phone)<>'object' or phone - array['label','number'] <> '{}'::jsonb then raise exception 'Invalid phone details' using errcode='22023'; end if;
 if jsonb_typeof(phone->'label') is distinct from 'string' or jsonb_typeof(phone->'number') is distinct from 'string' or coalesce(phone->>'label','')='' or length(phone->>'label')>60 or coalesce(phone->>'number','') !~ '^\+[1-9][0-9 ()-]{6,24}$' then raise exception 'Invalid phone' using errcode='22023'; end if;
 end loop;
 end if;
 if d ? 'credit' and d->'credit'<>'null'::jsonb then
 if jsonb_typeof(d->'credit')<>'object' or (d->'credit') - array['name','link'] <> '{}'::jsonb or jsonb_typeof(d->'credit'->'name') is distinct from 'string' or ((d->'credit') ? 'link' and jsonb_typeof(d->'credit'->'link') is distinct from 'string') or length(coalesce(d->'credit'->>'name','')) not between 1 and 120
 or (coalesce(d->'credit'->>'link','')<>'' and (d->'credit'->>'link' !~ '^https?://[^[:space:]]+$' or d->'credit'->>'link' ~ '^https?://[^/]*@')) then raise exception 'Invalid public credit' using errcode='22023'; end if;
 end if;
 if d->>'primaryType'='other' and coalesce(d->>'subcategory','') ~* '(people|person|housing)' and d ? 'coordinates' then raise exception 'Private locations must remain unpinned' using errcode='22023'; end if;
end; $$;

create function public.cleanup_ecosystem_private_data() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.ecosystem_rate_limits where window_start < now()-interval '24 hours';
 update private.ecosystem_notifications set state='failed',lease=null where state='sending' and attempts>=5 and retry_at<=now();
 update public.ecosystem_submissions set submitter_name=null,submitter_email=null,reviewer_notes=null,payload_hash='expired:'||id::text
 where closed_at < now()-interval '90 days' and (submitter_name is not null or submitter_email is not null or reviewer_notes is not null);
end; $$;

create function private.queue_ecosystem_submission(p_key text,p_hash text,p_kind text,p_target text,p_revision integer,p_data jsonb,p_name text,p_email text,p_source text,p_permission boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.ecosystem_submissions; current_listing public.ecosystem_listings; receipt uuid;
begin
 p_data:='{"sectors":[],"needs":[],"alsoListedAs":[],"publicPhones":[],"credit":null}'::jsonb||p_data;
 perform pg_advisory_xact_lock(hashtextextended(p_key,82010));
 select * into s from public.ecosystem_submissions where idempotency_key=p_key;
 if found then
 if s.payload_hash<>p_hash then raise exception 'Idempotency key already used with different content' using errcode='22023'; end if;
 return s.id;
 end if;
 perform private.validate_ecosystem_data(p_data);
 if (coalesce(p_data->>'publicEmail','')<>'' or jsonb_array_length(coalesce(p_data->'publicPhones','[]'))>0) and p_permission is distinct from true then raise exception 'Publication permission required' using errcode='22023'; end if;
 if p_kind='update' then
 select * into current_listing from public.ecosystem_listings where slug=p_target and published for share;
 if not found or current_listing.revision is distinct from p_revision then raise exception 'Listing changed; reload before submitting' using errcode='40001'; end if;
 elsif p_kind<>'new' or p_target is not null or p_revision is not null then raise exception 'Invalid submission target' using errcode='22023';
 elsif exists(select 1 from public.ecosystem_listings where slug=p_data->>'slug') then raise exception 'Listing already exists; suggest an edit' using errcode='22023'; end if;
 insert into public.ecosystem_submissions(idempotency_key,payload_hash,kind,target_slug,base_revision,base_data,proposed,submitter_name,submitter_email,source,contacts_permission)
 values(p_key,p_hash,p_kind,p_target,p_revision,current_listing.data,p_data,p_name,p_email,p_source,p_permission) returning id into receipt;
 insert into private.ecosystem_notifications(submission_id) values(receipt);
 return receipt;
end; $$;

create function public.receive_ecosystem_submission(p_idempotency_key uuid,p_payload_hash text,p_kind text,p_target_slug text,p_base_revision integer,p_proposed jsonb,p_submitter_name text,p_submitter_email text,p_ip_hash text,p_permission_to_share boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare n integer; existing public.ecosystem_submissions; key text := 'web:'||p_idempotency_key::text;
begin
 if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' or p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request fingerprint' using errcode='22023'; end if;
 perform public.cleanup_ecosystem_private_data();
 perform pg_advisory_xact_lock(hashtextextended(key,82010));
 select * into existing from public.ecosystem_submissions where idempotency_key=key;
 if found then
 if existing.payload_hash<>p_payload_hash then raise exception 'Idempotency key already used with different content' using errcode='22023'; end if;
 return existing.id;
 end if;
 insert into private.ecosystem_rate_limits as r(key_hash,window_start,count) values(p_ip_hash,now(),1)
 on conflict(key_hash) do update set window_start=case when r.window_start < now()-interval '1 hour' then now() else r.window_start end,
 count=case when r.window_start < now()-interval '1 hour' then 1 else r.count+1 end returning count into n;
 if n>5 then raise exception 'Submission rate limit reached' using errcode='P0429'; end if;
 return private.queue_ecosystem_submission(key,p_payload_hash,p_kind,p_target_slug,p_base_revision,p_proposed,p_submitter_name,p_submitter_email,'web',p_permission_to_share);
end; $$;

create function public.import_ecosystem_submission(p_import_key text,p_kind text,p_target_slug text,p_base_revision integer,p_proposed jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if p_import_key !~ '^(github|research):[a-zA-Z0-9/_-]{1,180}$' then raise exception 'Invalid import key' using errcode='22023'; end if;
 return private.queue_ecosystem_submission(p_import_key,encode(extensions.digest(jsonb_build_array(p_kind,p_target_slug,p_base_revision,p_proposed)::text,'sha256'),'hex'),p_kind,p_target_slug,p_base_revision,p_proposed,null,null,split_part(p_import_key,':',1),true);
end; $$;

create function public.review_ecosystem_submission(p_submission_id uuid,p_decision text,p_expected_revision integer default null,p_reviewer_notes text default null,p_expected_proposal_revision integer default null) returns text
language plpgsql security definer set search_path='' as $$
declare s public.ecosystem_submissions; current_listing public.ecosystem_listings; target text; next_data jsonb;
begin
 perform pg_advisory_xact_lock(92726001);
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Admin required' using errcode='42501'; end if;
 if p_decision not in ('approved','needs_info','rejected') or length(p_reviewer_notes)>4000 then raise exception 'Invalid review' using errcode='22023'; end if;
 select * into s from public.ecosystem_submissions where id=p_submission_id for update;
 if not found then raise exception 'Submission not found' using errcode='22023'; end if;
 if s.proposal_revision is distinct from p_expected_proposal_revision then raise exception 'Proposal changed; reload review' using errcode='40001'; end if;
 if s.status='approved' and p_decision='approved' then return coalesce(s.target_slug,s.proposed->>'slug'); end if;
 if s.status not in ('pending','needs_info') then raise exception 'Submission is closed' using errcode='22023'; end if;
 if p_decision='approved' then
 perform private.validate_ecosystem_data(s.proposed);
 if (coalesce(s.proposed->>'publicEmail','')<>'' or jsonb_array_length(coalesce(s.proposed->'publicPhones','[]'))>0) and not s.contacts_permission then raise exception 'Contact permission not recorded' using errcode='22023'; end if;
 if s.kind='update' then
 select * into current_listing from public.ecosystem_listings where slug=s.target_slug for update;
 if not found or not current_listing.published or current_listing.revision is distinct from s.base_revision or current_listing.revision is distinct from p_expected_revision then raise exception 'Listing changed; review and rebase first' using errcode='40001'; end if;
 target:=s.target_slug;
 next_data:=s.proposed||jsonb_build_object('slug',target);
 update public.ecosystem_listings set data=next_data,revision=revision+1,updated_at=now() where slug=target;
 else
 target:=coalesce(nullif(s.proposed->>'slug',''),'listing-'||replace(s.id::text,'-',''));
 next_data:=s.proposed||jsonb_build_object('slug',target);
 insert into public.ecosystem_listings(slug,data,published) values(target,next_data,true);
 end if;
 end if;
 update public.ecosystem_submissions set status=p_decision,reviewer_id=auth.uid(),reviewer_notes=p_reviewer_notes,
 proposed=case when p_decision='approved' then next_data else proposed end,
 closed_at=case when p_decision in ('approved','rejected') then now() else null end where id=s.id;
 insert into public.ecosystem_review_history(submission_id,reviewer_id,action,before_data,after_data)
 values(s.id,auth.uid(),p_decision,current_listing.data,case when p_decision='approved' then next_data else null end);
 return target;
end; $$;

create function public.claim_ecosystem_notifications() returns table(submission_id uuid,lease uuid)
language sql security definer set search_path='' as $$
 with ready as (
 select n.submission_id from private.ecosystem_notifications n
 join public.ecosystem_submissions s on s.id=n.submission_id
 where n.state in ('pending','sending') and n.retry_at<=now() and s.status in ('pending','needs_info') and n.attempts<5
 order by n.retry_at limit 10 for update of n skip locked
 ) update private.ecosystem_notifications n set state='sending',attempts=attempts+1,lease=extensions.gen_random_uuid(),retry_at=now()+interval '5 minutes'
 from ready where ready.submission_id=n.submission_id returning n.submission_id,n.lease;
$$;
create function public.finish_ecosystem_notification(p_submission_id uuid,p_lease uuid,p_success boolean) returns void
language sql security definer set search_path='' as $$
 update private.ecosystem_notifications set state=case when p_success then 'sent' when attempts>=5 then 'failed' else 'pending' end,
 sent_at=case when p_success then now() else null end,retry_at=now()+interval '5 minutes',lease=null
 where submission_id=p_submission_id and lease=p_lease and state='sending';
$$;
revoke all on function public.claim_ecosystem_notifications(),public.finish_ecosystem_notification(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.claim_ecosystem_notifications(),public.finish_ecosystem_notification(uuid,uuid,boolean) to service_role;

create function public.rebase_ecosystem_submission(p_submission_id uuid,p_expected_revision integer,p_proposed jsonb,p_expected_proposal_revision integer default null) returns void
language plpgsql security definer set search_path='' as $$
declare s public.ecosystem_submissions; current_listing public.ecosystem_listings;
begin
 perform pg_advisory_xact_lock(92726001);
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Admin required' using errcode='42501'; end if;
 p_proposed:='{"sectors":[],"needs":[],"alsoListedAs":[],"publicPhones":[],"credit":null}'::jsonb||p_proposed;
 perform private.validate_ecosystem_data(p_proposed);
 select * into s from public.ecosystem_submissions where id=p_submission_id for update;
 if not found or s.kind<>'update' or s.status not in ('pending','needs_info') then raise exception 'Only open edits can be rebased' using errcode='22023'; end if;
 if s.proposal_revision is distinct from p_expected_proposal_revision then raise exception 'Proposal changed; reload review' using errcode='40001'; end if;
 select * into current_listing from public.ecosystem_listings where slug=s.target_slug and published for share;
 if not found or current_listing.revision is distinct from p_expected_revision then raise exception 'Listing changed; reload review' using errcode='40001'; end if;
 update public.ecosystem_submissions set proposed=p_proposed,base_data=current_listing.data,base_revision=current_listing.revision,status='pending',proposal_revision=proposal_revision+1 where id=s.id;
 insert into public.ecosystem_review_history(submission_id,reviewer_id,action,before_data,after_data) values(s.id,auth.uid(),'rebased',s.proposed,p_proposed);
end; $$;

revoke all on function private.validate_ecosystem_data(jsonb),private.queue_ecosystem_submission(text,text,text,text,integer,jsonb,text,text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.receive_ecosystem_submission(uuid,text,text,text,integer,jsonb,text,text,text,boolean),public.import_ecosystem_submission(text,text,text,integer,jsonb),public.cleanup_ecosystem_private_data(),public.review_ecosystem_submission(uuid,text,integer,text,integer),public.rebase_ecosystem_submission(uuid,integer,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.receive_ecosystem_submission(uuid,text,text,text,integer,jsonb,text,text,text,boolean),public.import_ecosystem_submission(text,text,text,integer,jsonb),public.cleanup_ecosystem_private_data() to service_role;
grant execute on function public.review_ecosystem_submission(uuid,text,integer,text,integer),public.rebase_ecosystem_submission(uuid,integer,jsonb,integer) to authenticated;

-- Retention also runs during intake; schedule it for quiet periods where pg_cron is available.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
 perform cron.schedule('ecosystem-private-retention','17 * * * *','select public.cleanup_ecosystem_private_data()');
 end if;
end; $$;
