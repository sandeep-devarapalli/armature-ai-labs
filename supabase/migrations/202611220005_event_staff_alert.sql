create function private.queue_event_staff_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.booking_notice_outbox(recipient_id,aggregate_id,kind,stage,dedupe_key,payload)
  select staff.id,gen_random_uuid(),'event','approval_required',new.id::text||':event_staff_approval',
    jsonb_build_object('kind','event','stage','approval_required','reference',new.id::text,
      'attendees',new.attendees,'sessions',jsonb_build_array(
        jsonb_build_object('id',new.id,'startsAt',new.starts_at,'endsAt',new.ends_at)))
    from auth.users staff
    where lower(staff.email)='hello@armatureailabs.com' and staff.email_confirmed_at is not null and staff.deleted_at is null
      and exists (select 1 from private.booking_notice_settings settings where settings.singleton
        and (settings.enabled or settings.test_recipient_id=staff.id))
    order by staff.id limit 1
  on conflict(dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function private.queue_event_staff_approval() from public,anon,authenticated,service_role;

create trigger event_staff_approval_notice after insert on private.event_quotes
  for each row when (new.direct_checkout and new.approved_at is null and new.declined_at is null
    and new.cancelled_at is null and new.booking_id is null)
  execute function private.queue_event_staff_approval();
