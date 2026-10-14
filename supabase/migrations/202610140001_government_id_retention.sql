-- A separate, explicit ID-retention choice preserves earlier notice promises.
create table private.government_id_retention_consents (
  document_id uuid primary key references public.onboarding_documents(id),
  user_id uuid not null references auth.users(id),
  notice_version text not null check (notice_version='2026-10-14-equipment-id-v1'),
  accepted_at timestamptz not null default now()
);
revoke all on private.government_id_retention_consents from public,anon,authenticated,service_role;

create function public.accept_government_id_retention(p_document_id uuid,p_notice_version text)
returns void language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents;
begin
  perform private.require_onboarding_enabled();
  if auth.uid() is null or p_notice_version is distinct from '2026-10-14-equipment-id-v1' then
    raise exception 'Explicit current ID retention consent required' using errcode='42501';
  end if;
  select * into d from public.onboarding_documents where id=p_document_id and user_id=auth.uid() for update;
  if not found or d.kind <> 'government_id' or d.deleted_at is not null or d.expires_at<=now() then
    raise exception 'Current own government ID required' using errcode='42501';
  end if;
  insert into private.government_id_retention_consents(document_id,user_id,notice_version)
    values(d.id,auth.uid(),p_notice_version) on conflict(document_id) do nothing;
  if d.uploaded_at is not null then
    update public.onboarding_documents set expires_at='infinity'::timestamptz where id=d.id;
  end if;
end;
$$;
revoke all on function public.accept_government_id_retention(uuid,text) from public,anon,authenticated;
grant execute on function public.accept_government_id_retention(uuid,text) to authenticated;

create function public.has_government_id_retention_consent(p_document_id uuid)
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from private.government_id_retention_consents where document_id=p_document_id);
$$;
revoke all on function public.has_government_id_retention_consent(uuid) from public,anon,authenticated;
grant execute on function public.has_government_id_retention_consent(uuid) to service_role;

create or replace function public.finalize_onboarding_document(p_document_id uuid)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents;
begin
  perform private.require_onboarding_enabled();
  perform private.require_onboarding_notice((select user_id from public.onboarding_documents where id=p_document_id));
  d := private.finalize_onboarding_document(p_document_id);
  if d.kind='government_id' and exists(select 1 from private.government_id_retention_consents where document_id=d.id and user_id=d.user_id) then
    update public.onboarding_documents set expires_at='infinity'::timestamptz where id=d.id returning * into d;
  end if;
  return d;
end;
$$;
-- Existing correction, deletion and cleanup operations can still expire infinity.
-- Expired/deleted documents are never restored or silently extended by this migration.
