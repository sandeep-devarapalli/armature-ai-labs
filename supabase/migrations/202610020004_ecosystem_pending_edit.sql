begin;
lock table public.ecosystem_submissions in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.ecosystem_submissions where kind='update' and status in ('pending','needs_info') group by target_slug having count(*)>1) then
 raise exception 'Multiple open ecosystem updates exist. An admin must approve or reject duplicate proposals before retrying this migration. No proposals have been discarded.' using errcode='23505';
 end if;
end; $$;

create unique index ecosystem_one_open_update on public.ecosystem_submissions(target_slug)
 where kind='update' and status in ('pending','needs_info');

create function public.ecosystem_edit_pending(p_slug text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ecosystem_listings l
 join public.ecosystem_submissions s on s.target_slug=l.slug
 where l.slug=p_slug and l.published and s.kind='update' and s.status in ('pending','needs_info'));
$$;
revoke all on function public.ecosystem_edit_pending(text) from public,anon,authenticated,service_role;
grant execute on function public.ecosystem_edit_pending(text) to anon,authenticated;

create or replace function private.queue_ecosystem_submission(p_key text,p_hash text,p_kind text,p_target text,p_revision integer,p_data jsonb,p_name text,p_email text,p_source text,p_permission boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.ecosystem_submissions; current_listing public.ecosystem_listings; receipt uuid; conflict_name text;
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
 if not found then raise exception 'Listing changed; reload before submitting' using errcode='40001'; end if;
 if exists(select 1 from public.ecosystem_submissions where target_slug=p_target and kind='update' and status in ('pending','needs_info')) then
 raise exception 'An update is awaiting admin review. You can suggest another edit after it is approved or rejected.' using errcode='P0409'; end if;
 if current_listing.revision is distinct from p_revision then raise exception 'Listing changed; reload before submitting' using errcode='40001'; end if;
 elsif p_kind<>'new' or p_target is not null or p_revision is not null then raise exception 'Invalid submission target' using errcode='22023';
 elsif exists(select 1 from public.ecosystem_listings where slug=p_data->>'slug') then raise exception 'Listing already exists; suggest an edit' using errcode='22023'; end if;
 begin
 insert into public.ecosystem_submissions(idempotency_key,payload_hash,kind,target_slug,base_revision,base_data,proposed,submitter_name,submitter_email,source,contacts_permission)
 values(p_key,p_hash,p_kind,p_target,p_revision,current_listing.data,p_data,p_name,p_email,p_source,p_permission) returning id into receipt;
 exception when unique_violation then
 get stacked diagnostics conflict_name=CONSTRAINT_NAME;
 if conflict_name='ecosystem_one_open_update' then
 raise exception 'An update is awaiting admin review. You can suggest another edit after it is approved or rejected.' using errcode='P0409'; end if;
 raise;
 end;
 insert into private.ecosystem_notifications(submission_id) values(receipt);
 return receipt;
end; $$;
commit;
