-- Trusted checkout services can hold inventory after both signatures are verified.
create table private.checkout_inventory_holds (
  quote_id uuid primary key,
  resource_id uuid not null references public.resources(id),
  member_id uuid not null references auth.users(id),
  period tstzrange not null,
  expires_at timestamptz not null,
  released_at timestamptz
);

create index checkout_inventory_holds_resource_idx
  on private.checkout_inventory_holds (resource_id, expires_at)
  where released_at is null;
revoke all on private.checkout_inventory_holds from public, anon, authenticated;

create function public.hold_signed_booking_inventory(
  p_quote_id uuid, p_resource_id uuid, p_member_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_signed_at timestamptz
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_hold private.checkout_inventory_holds;
  v_period tstzrange;
  v_expires_at timestamptz := p_signed_at + interval '30 minutes';
  v_kind text;
begin
  if p_quote_id is null or p_resource_id is null or p_member_id is null
    or p_starts_at is null or p_ends_at is null or p_signed_at is null
    or not isfinite(p_starts_at) or not isfinite(p_ends_at) or not isfinite(p_signed_at)
    or p_ends_at <= p_starts_at or p_signed_at > clock_timestamp() then
    raise exception using errcode = '22023', message = 'Valid signed quote and booking dates required';
  end if;
  if private.has_approved_basic_membership(p_member_id) is not true then
    raise exception using errcode = '42501', message = 'Verified membership required';
  end if;

  -- Use the same resource lock as workspace reservations.
  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 14));
  if v_expires_at <= clock_timestamp() or p_starts_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'Checkout window expired; issue a new quote';
  end if;
  v_period := tstzrange(p_starts_at, p_ends_at, '[)');

  select * into v_hold from private.checkout_inventory_holds where quote_id = p_quote_id;
  if found then
    if v_hold.resource_id = p_resource_id and v_hold.member_id = p_member_id
      and v_hold.period = v_period and v_hold.expires_at = v_expires_at
      and v_hold.released_at is null then
      return v_hold.expires_at;
    end if;
    raise exception using errcode = '22023', message = 'Checkout hold requires a new quote';
  end if;

  select policy.kind into v_kind
  from public.resources as resource
  join public.resource_booking_policies as policy on policy.resource_id = resource.id
  where resource.id = p_resource_id and resource.active and resource.reservable
    and policy.kind in ('workspace', 'cabin', 'equipment');
  if v_kind is null or (v_kind = 'equipment' and not exists (
    select 1 from public.equipment_rental_units as unit
    join public.asset_units as asset on asset.id = unit.asset_unit_id
    where unit.resource_id = p_resource_id and unit.commissioned and asset.status = 'available'
  )) or (v_kind in ('workspace', 'cabin') and not exists (
    select 1 from public.booking_inventory where resource_id = p_resource_id
  )) then
    raise exception using errcode = '22023', message = 'Bookable inventory required';
  end if;

  if exists (
    select 1 from private.checkout_inventory_holds
    where resource_id = p_resource_id and released_at is null
      and expires_at > clock_timestamp() and period && v_period
  ) or exists (
    select 1 from public.resource_reservations
    where resource_id = p_resource_id and released_at is null and period && v_period
  ) or exists (
    select 1 from public.workspace_pass_allocations
    where resource_id = p_resource_id and released_at is null
      and period && daterange(
        (p_starts_at at time zone 'Asia/Kolkata')::date,
        ((p_ends_at - interval '1 microsecond') at time zone 'Asia/Kolkata')::date + 1,
        '[)'
      )
  ) then
    raise exception using errcode = '23P01', message = 'Inventory is no longer available';
  end if;

  insert into private.checkout_inventory_holds (quote_id, resource_id, member_id, period, expires_at)
  values (p_quote_id, p_resource_id, p_member_id, v_period, v_expires_at);
  return v_expires_at;
end;
$$;

create function public.release_signed_booking_inventory(p_quote_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_resource_id uuid;
begin
  select resource_id into v_resource_id from private.checkout_inventory_holds where quote_id = p_quote_id;
  if found then
    perform pg_advisory_xact_lock(hashtextextended(v_resource_id::text, 14));
    update private.checkout_inventory_holds set released_at = clock_timestamp()
    where quote_id = p_quote_id and released_at is null;
  end if;
end;
$$;

create function private.guard_checkout_inventory_hold() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.released_at is null then
    perform pg_advisory_xact_lock(hashtextextended(new.resource_id::text, 14));
    if exists (
      select 1 from private.checkout_inventory_holds
      where resource_id = new.resource_id and released_at is null
        and expires_at > clock_timestamp() and period && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception using errcode = '23P01', message = 'Inventory is held for checkout';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_checkout_inventory_hold before insert or update of resource_id, starts_at, ends_at, released_at
on public.resource_reservations for each row execute function private.guard_checkout_inventory_hold();

revoke all on function private.guard_checkout_inventory_hold() from public, anon, authenticated;
revoke all on function public.hold_signed_booking_inventory(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz),
  public.release_signed_booking_inventory(uuid) from public, anon, authenticated;
grant execute on function public.hold_signed_booking_inventory(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz),
  public.release_signed_booking_inventory(uuid) to service_role;
