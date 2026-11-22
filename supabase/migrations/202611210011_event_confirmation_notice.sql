create function private.queue_event_booking_confirmation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select enabled from private.booking_notice_settings where singleton) is not true then return new; end if;
  perform private.queue_booking_notice(new.member_id,new.id,'event','confirmed','initial',
    jsonb_build_object('resource',r.name,'sessions',jsonb_build_array(
      jsonb_build_object('id',b.id,'startsAt',b.starts_at,'endsAt',b.ends_at))))
    from public.bookings b
    join public.resources r on r.id=b.resource_id
    where b.id=new.booking_id and b.member_id=new.member_id
      and b.resource_id=new.resource_id and b.status='confirmed';
  return new;
end;
$$;
revoke all on function private.queue_event_booking_confirmation() from public,anon,authenticated,service_role;

create trigger event_booking_confirmation after update of booking_id on private.event_quotes
  for each row when (old.booking_id is null and new.booking_id is not null and new.payment_id is not null)
  execute function private.queue_event_booking_confirmation();

create or replace function private.queue_booking_schedule_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  q private.booking_notice_outbox;
  event_stage text := case when new.status='cancelled' then 'cancelled' else 'updated' end;
begin
  if (select enabled from private.booking_notice_settings where singleton) is not true then return new; end if;
  if not ((new.status='cancelled' and old.status<>'cancelled')
          or (new.status='confirmed' and (new.starts_at,new.ends_at) is distinct from (old.starts_at,old.ends_at))) then
    return new;
  end if;
  select * into q from private.booking_notice_outbox n
    where n.stage='confirmed' and n.recipient_id=new.member_id and n.aggregate_id=coalesce(
      (select d.id from private.live_desk_quotes d where d.booking_ids @> array[new.id] limit 1),
      (select r.id from private.rental_quotes r where r.booking_id=new.id and r.parent_quote_id is null limit 1),
      (select e.id from private.event_quotes e where e.booking_id=new.id limit 1))
    order by n.sequence limit 1;
  if found then
    perform private.queue_booking_notice(new.member_id,q.aggregate_id,q.kind,event_stage,new.id::text||':'||txid_current(),
      q.payload||jsonb_build_object('stage',event_stage,'sessions',case when q.kind in ('day','week','month','event') then
        jsonb_build_array(jsonb_build_object('id',new.id,'startsAt',new.starts_at,'endsAt',new.ends_at)) else '[]'::jsonb end));
  end if;
  return new;
end;
$$;
