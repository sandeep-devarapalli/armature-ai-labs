create function private.queue_venture_pass_notice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into private.booking_notice_outbox(recipient_id,aggregate_id,kind,stage,dedupe_key,payload)
    select staff.id,gen_random_uuid(),'venture_application','received',new.id::text||':venture_staff_review',
      jsonb_build_object('kind','venture_application','stage','received','reference',new.id)
    from auth.users staff
    where lower(staff.email)='hello@armatureailabs.com' and staff.email_confirmed_at is not null and staff.deleted_at is null
      and exists (select 1 from private.booking_notice_settings where singleton and (enabled or test_recipient_id=staff.id))
    order by staff.id limit 1
    on conflict (dedupe_key) do nothing;
  elsif new.status is distinct from old.status then
    if new.status in ('confirmed','expired') then
      update private.booking_notice_outbox set status='rejected',settled_at=clock_timestamp()
      where dedupe_key=new.id::text||':approved:venture' and status='queued';
    end if;
    if exists (select 1 from private.booking_notice_settings where singleton and (enabled or test_recipient_id=new.user_id)) then
      if new.status='approved' then
        perform private.queue_booking_notice(new.user_id,new.id,'venture','approved','venture',
          jsonb_build_object('paymentExpiresAt',new.payment_expires_at));
      elsif new.status='confirmed' then
        perform private.queue_booking_notice(new.user_id,new.id,'venture','confirmed','venture',
          jsonb_build_object('endsAt',new.ends_at));
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_venture_pass_notice() from public,anon,authenticated,service_role;

create trigger venture_pass_notice after insert or update of status on private.venture_pass_applications
for each row execute function private.queue_venture_pass_notice();
