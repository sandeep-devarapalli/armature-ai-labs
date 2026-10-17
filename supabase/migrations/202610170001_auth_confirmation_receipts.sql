-- Keep signup confirmations attributable without suppressing unknown or failed email.
alter table private.auth_notification_sources
 drop constraint auth_notification_sources_subject_check,
 add constraint auth_notification_sources_subject_check
 check(subject in ('Your sign-in link','Confirm your email address'));

create or replace function public.record_classified_notification_event(p_event_id text,p_provider_id text,p_event_type text,p_occurred_at timestamptz,p_sender text,p_subject text) returns boolean
language plpgsql security definer set search_path='' as $$
declare inserted boolean;
begin
 -- The existing function serializes both callback orders and rejects conflicting event IDs.
 inserted:=public.record_member_notification_event(p_event_id,p_provider_id,p_event_type,p_occurred_at);
 if p_subject in ('Your sign-in link','Confirm your email address') and p_sender in ('no-reply@mail.armatureailabs.com','Armature AI Labs <no-reply@mail.armatureailabs.com>','"Armature AI Labs" <no-reply@mail.armatureailabs.com>')
 and p_provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and exists(select 1 from public.member_notification_events where event_id=p_event_id and provider_id=p_provider_id and event_type=p_event_type and occurred_at=p_occurred_at)
 and not exists(select 1 from public.member_notifications where provider_id=p_provider_id)
 and not exists(select 1 from private.ecosystem_notifications where provider_id=p_provider_id)
 and not exists(select 1 from public.member_notification_tombstones where provider_id=p_provider_id) then
  insert into private.auth_notification_sources(provider_id,sender,subject,source,source_event_id,source_occurred_at,evidence)
  values(p_provider_id,'no-reply@mail.armatureailabs.com',p_subject,'signed_webhook',p_event_id,p_occurred_at,'Verified Resend signature and shared Supabase project header; exact configured Auth sender and approved authentication subject.') on conflict(provider_id) do nothing;
 end if;
 return inserted;
end; $$;
revoke all on function public.record_classified_notification_event(text,text,text,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_classified_notification_event(text,text,text,timestamptz,text,text) to service_role;

