alter table public.booking_policy_settings
  add column public_desk_calendar_enabled boolean not null default false;

create function public.list_bookable_desk_dates(
  p_chair text, p_pass text, p_from date, p_to date
)
returns table (booking_date date, available boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_resource public.resources;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_pass is null or p_pass not in ('day', 'week', 'month')
    or p_chair is null or p_chair !~ '^S(0[1-9]|1[0-9]|2[0-5])$'
    or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_from < v_today or p_to < p_from or p_to - p_from > 31
    or p_to > v_today + 366 then
    raise exception using errcode = '22023', message = 'Select a desk, pass and valid calendar window';
  end if;
  if not exists (
    select 1 from public.booking_policy_settings where singleton and public_desk_calendar_enabled
  ) then
    raise exception using errcode = '42501', message = 'The desk calendar is closed';
  end if;

  select r.* into v_resource
  from public.booking_inventory i
  join public.resources r on r.id = i.resource_id
  join public.resource_booking_policies policy on policy.resource_id = r.id
  where i.code = p_chair and policy.kind = 'workspace';

  return query
  with starts as (
    select p_from + n as day
    from generate_series(0, p_to - p_from) n
    where p_pass <> 'month' or extract(day from p_from + n) = 1
  ), passes as (
    select day, private.pass_dates(p_pass, array[day]) as days from starts
  ), periods as (
    select day, days, tstzrange(
      (day + time '09:00') at time zone 'Asia/Kolkata',
      (days[cardinality(days)] + time '17:00') at time zone 'Asia/Kolkata', '[)'
    ) as period
    from passes
  )
  select candidate.day,
    coalesce(v_resource.active and v_resource.reservable and v_resource.capacity = 1
      and exists (
        select 1 from public.booking_products
        where code = 'workspace-' || p_pass and kind = 'workspace' and unit = p_pass
          and enabled and price_paise is not null
      )
      and lower(candidate.period) > now()
      and upper(candidate.period) <= now() + make_interval(days => v_resource.booking_horizon_days)
      and not exists (
        select 1 from unnest(candidate.days) d
        where not private.within_resource_hours(v_resource.id,
          (d + time '09:00') at time zone 'Asia/Kolkata',
          (d + time '17:00') at time zone 'Asia/Kolkata')
        or exists (
          select 1 from public.booking_closures c
          where c.location_id = v_resource.location_id and c.closed_on = d
        )
      )
      and not exists (
        select 1 from public.resource_reservations r
        where r.resource_id = v_resource.id and r.released_at is null and r.period && candidate.period
      )
      and not exists (
        select 1 from public.workspace_pass_allocations a
        where a.resource_id = v_resource.id and a.released_at is null
          and a.period && daterange(candidate.day, candidate.days[cardinality(candidate.days)] + 1, '[)')
      )
      and not exists (
        select 1 from private.checkout_inventory_holds h
        where h.resource_id = v_resource.id and h.released_at is null
          and h.expires_at > now() and h.period && candidate.period
      ), false)
  from periods candidate
  order by candidate.day;
end;
$$;

revoke all on function public.list_bookable_desk_dates(text, text, date, date) from public;
grant execute on function public.list_bookable_desk_dates(text, text, date, date) to anon, authenticated;

comment on function public.list_bookable_desk_dates(text, text, date, date) is
  'Read-only calendar for a numbered desk. Dates are provisional until checkout holds the inventory.';
