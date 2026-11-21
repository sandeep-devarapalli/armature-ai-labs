-- Only publish dates and times from confirmed event reservations. The hire purpose is private.
create function private.ground_floor_events(p_from date,p_to date)
returns table(event_date date, starts_at timestamptz, ends_at timestamptz, blocks_desk boolean)
language sql stable set search_path='' as $$
  select slot.day,b.starts_at,b.ends_at,extract(isodow from slot.day)<6
    and b.starts_at<(slot.day+time '17:00') at time zone 'Asia/Kolkata'
    and b.ends_at>(slot.day+time '09:00') at time zone 'Asia/Kolkata'
  from private.event_checkout_settings c
  join public.bookings b on b.resource_id=c.event_resource and b.status='confirmed'
  cross join lateral (
    select (b.starts_at at time zone 'Asia/Kolkata')::date+n as day
    from generate_series(
      greatest(p_from-(b.starts_at at time zone 'Asia/Kolkata')::date,0),
      least(p_to,(b.ends_at at time zone 'Asia/Kolkata')::date)-(b.starts_at at time zone 'Asia/Kolkata')::date
    ) n
  ) slot
  where b.starts_at<((p_to+1)::timestamp at time zone 'Asia/Kolkata')
    and b.ends_at>(slot.day::timestamp at time zone 'Asia/Kolkata')
    and b.ends_at>(p_from::timestamp at time zone 'Asia/Kolkata');
$$;

create function public.desk_calendar_events(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_from<today or p_to<p_from or p_to>today+30 then
    raise exception using errcode='22023',message='Select a date within the next 30 days';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'title','Ground floor event',
    'startsAt',starts_at,'endsAt',ends_at,'blocksDesk',blocks_desk) order by event_date,starts_at)
    from private.ground_floor_events(p_from,p_to)),'[]'::jsonb);
end;
$$;

-- Reuse the inventory, closure and hold checks for all legacy callers, including payment order claims.
alter function public.list_bookable_desk_dates(text,text,date,date) set schema private;
revoke all on function private.list_bookable_desk_dates(text,text,date,date) from public,anon,authenticated,service_role;

create function public.list_bookable_desk_dates(p_chair text,p_pass text,p_from date,p_to date)
returns table(booking_date date,available boolean)
language sql stable security definer set search_path='' as $$
  select d.booking_date,d.available and (
    p_chair !~ '^S(0[1-9]|1[0-3])$' or (
      d.booking_date<=(now() at time zone 'Asia/Kolkata')::date+30
      and not exists (
        select 1 from private.ground_floor_events(
          d.booking_date, case p_pass when 'week' then d.booking_date+6
            when 'month' then (d.booking_date+interval '1 month - 1 day')::date
            else d.booking_date end
        ) e where e.blocks_desk
      )
    )
  )
  from private.list_bookable_desk_dates(p_chair,p_pass,p_from,p_to) d
  order by d.booking_date;
$$;

create function public.desk_calendar_chairs(p_day date,p_unit text)
returns text[] language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(i.code order by i.code),'{}'::text[])
  from public.booking_inventory i
  cross join lateral public.list_bookable_desk_dates(i.code,p_unit,p_day,p_day) a
  where i.code ~ '^S(0[1-9]|1[0-3])$' and a.available;
$$;

-- Share the checkout location lock so an event cannot overtake an in-flight availability check.
create function private.lock_ground_floor_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare location uuid; previous_resource uuid;
begin
  if tg_op='UPDATE' then previous_resource := old.resource_id; end if;
  select r.location_id into location from private.event_checkout_settings c
    join public.resources r on r.id=c.event_resource
    where c.event_resource in (new.resource_id,previous_resource);
  if found then perform pg_advisory_xact_lock(hashtextextended(location::text,13)); end if;
  return new;
end;
$$;
create trigger lock_ground_floor_event before insert or update of resource_id,starts_at,ends_at,status on public.bookings
  for each row execute function private.lock_ground_floor_event();

-- Assign the paired first-floor seat without changing the paid ground-floor pass or calendar UID.
create table private.desk_relocations (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  fallback text not null check (fallback ~ '^F([1-9]|1[0-3])$'),
  period tstzrange not null,
  moved_by uuid not null references auth.users(id),
  moved_at timestamptz not null default clock_timestamp(),
  exclude using gist (fallback with =,period with &&)
);
alter table private.desk_relocations enable row level security;
revoke all on private.desk_relocations from public,anon,authenticated,service_role;

create function public.desk_relocations(p_admin uuid,p_booking uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  booked public.bookings;
  quote private.live_desk_quotes;
  paired text;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not exists(select 1 from public.staff_roles where user_id=p_admin and role in ('admin','super_admin')) then
    raise exception using errcode='42501',message='Admin role required';
  end if;
  if p_booking is not null then
    select b.* into strict booked from public.bookings b where b.id=p_booking
      and b.status='confirmed' and b.ends_at>clock_timestamp() for update;
    select q.* into strict quote from private.live_desk_quotes q where q.booking_ids @> array[booked.id]
      and q.resource_id=booked.resource_id and q.member_id=booked.member_id
      and q.payment_id is not null and q.chair ~ '^S(0[1-9]|1[0-3])$';
    paired := 'F'||substring(quote.chair from 2)::integer;
    insert into private.desk_relocations(booking_id,fallback,period,moved_by)
    values(booked.id,paired,tstzrange(booked.starts_at,booked.ends_at,'[)'),p_admin)
    on conflict (booking_id) do nothing;
    if found and (select enabled from private.booking_notice_settings where singleton) then
      perform private.queue_booking_notice(booked.member_id,quote.id,quote.unit,'updated','relocate:'||booked.id,
        jsonb_build_object('resource','First floor seat '||paired||' (moved from '||quote.chair||')',
          'sessions',jsonb_build_array(jsonb_build_object('id',booked.id,'startsAt',booked.starts_at,'endsAt',booked.ends_at))));
    end if;
    return jsonb_build_object('bookingId',booked.id,'fallback',paired);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('bookingId',b.id,'chair',q.chair,
      'fallback','F'||substring(q.chair from 2)::integer,
      'startsAt',b.starts_at,'endsAt',b.ends_at,'movedAt',r.moved_at,
      'eventTitle',case when e.blocked then 'Ground floor event' end) order by b.starts_at,q.chair)
    from public.bookings b
    join private.live_desk_quotes q on q.booking_ids @> array[b.id]
      and q.resource_id=b.resource_id and q.member_id=b.member_id
    left join private.desk_relocations r on r.booking_id=b.id
    cross join lateral (
      select exists(select from private.ground_floor_events(
        (b.starts_at at time zone 'Asia/Kolkata')::date,(b.starts_at at time zone 'Asia/Kolkata')::date
      ) where blocks_desk) as blocked
    ) e
    where b.status='confirmed' and b.ends_at>now()
      and b.starts_at<((today+31)::timestamp at time zone 'Asia/Kolkata')
      and q.payment_id is not null and q.chair ~ '^S(0[1-9]|1[0-3])$'
  ),'[]'::jsonb);
end;
$$;

-- A cancelled booking no longer occupies its fallback. Keep the move audit record.
create function private.release_desk_relocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    update private.desk_relocations set period='empty'::tstzrange where booking_id=new.id;
  end if;
  return new;
end;
$$;
create trigger release_desk_relocation after update of status on public.bookings
  for each row execute function private.release_desk_relocation();

revoke all on function private.ground_floor_events(date,date),private.lock_ground_floor_event(),private.release_desk_relocation() from public,anon,authenticated;
revoke all on function public.list_bookable_desk_dates(text,text,date,date),public.desk_calendar_events(date,date),
  public.desk_calendar_chairs(date,text),public.desk_relocations(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_bookable_desk_dates(text,text,date,date) to anon,authenticated;
grant execute on function public.desk_calendar_events(date,date),public.desk_calendar_chairs(date,text),public.desk_relocations(uuid,uuid) to service_role;
