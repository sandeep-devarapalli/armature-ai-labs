alter table private.live_desk_quotes
  add column direct_policy_version text,
  add column direct_accepted_at timestamptz,
  add constraint live_desk_direct_acceptance_pair
    check ((direct_policy_version is null) = (direct_accepted_at is null));

-- The live edge function calls this only after explicit policy acceptance and,
-- for a bound order, checking the provider's order and payment records.
create function public.claim_direct_desk_order(p_member uuid, p_quote uuid, p_policy_version text, p_order text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  q private.live_desk_quotes;
  settings public.booking_policy_settings;
  location uuid;
  accepted_at timestamptz;
begin
  select * into settings from public.booking_policy_settings where singleton for share;
  if settings.live_desk_checkout_enabled is not true or settings.mock_grants_enabled is not false
    or p_member is null or (p_member is distinct from settings.live_desk_checkout_member
      and not settings.public_desk_checkout_enabled)
    or not private.membership_levels_enabled() or not private.has_verified_membership(p_member) then
    raise exception using errcode='42501', message='Live desk checkout is unavailable';
  end if;
  if coalesce(p_policy_version,'') !~ '^[A-Za-z0-9._-]{4,80}$'
    or p_policy_version is distinct from settings.live_desk_checkout_policy_version then
    raise exception using errcode='22023', message='Current policy acceptance is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_member::text,85));
  select * into strict q from private.live_desk_quotes where id=p_quote and member_id=p_member for update;
  if q.payment_id is not null or (p_member is distinct from settings.live_desk_checkout_member
    and (q.chair !~ '^S(0[1-9]|1[0-3])$' or q.amount_paise is distinct from
      (case q.unit when 'day' then 35000 when 'week' then 175000 when 'month' then 1300000 end)::bigint)) then
    raise exception using errcode='22023', message='Open released desk pass required';
  end if;

  select location_id into strict location from public.resources where id=q.resource_id for share;
  perform pg_advisory_xact_lock(hashtextextended(location::text,13));
  perform pg_advisory_xact_lock(hashtextextended(q.resource_id::text,14));
  if p_order is not null then
    -- Resume only the same order and keep its original hold and payment policy.
    if q.order_id is distinct from p_order or not exists (
      select 1 from private.checkout_inventory_holds h where h.quote_id=q.id and h.released_at is null
        and h.expires_at>clock_timestamp() and lower(h.period)>clock_timestamp()
    ) then
      raise exception using errcode='22024', message='Existing order requires reconciliation';
    end if;
    update private.live_desk_quotes
    set direct_accepted_at=case when direct_policy_version=p_policy_version then direct_accepted_at else clock_timestamp() end,
      direct_policy_version=p_policy_version
    where id=q.id returning * into q;
    return to_jsonb(q);
  end if;
  if q.order_claimed_at is not null or q.order_id is not null or exists (
    select 1 from private.live_desk_quotes prior
    where prior.member_id=p_member and prior.id<>q.id and prior.order_claimed_at is not null
      and prior.payment_id is null and prior.starts_on<=q.ends_on and prior.ends_on>=q.starts_on
  ) then
    raise exception using errcode='22024', message='Existing order requires reconciliation';
  end if;
  if not exists (select 1 from public.booking_products p where p.id=q.product_id and p.enabled and p.price_paise=q.amount_paise)
    or not exists (select 1 from public.list_bookable_desk_dates(q.chair,q.unit,q.starts_on,q.starts_on) where available) then
    raise exception using errcode='22023', message='Desk price or availability changed';
  end if;

  accepted_at := clock_timestamp();
  perform public.hold_signed_booking_inventory(q.id,q.resource_id,q.member_id,
    (q.starts_on+time '09:00') at time zone 'Asia/Kolkata',
    (q.ends_on+time '17:00') at time zone 'Asia/Kolkata',accepted_at);
  update private.live_desk_quotes set order_claimed_at=accepted_at,policy_version=p_policy_version,
    direct_accepted_at=accepted_at,direct_policy_version=p_policy_version
  where id=q.id returning * into q;
  return to_jsonb(q);
end;
$$;
revoke all on function public.claim_direct_desk_order(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_direct_desk_order(uuid,uuid,text,text) to service_role;

create function public.active_desk_order_hold(p_member uuid, p_quote uuid, p_order text)
returns boolean language sql security definer set search_path='' as $$
  select exists (
    select 1 from private.live_desk_quotes q
    join private.checkout_inventory_holds h on h.quote_id=q.id
    where q.id=p_quote and q.member_id=p_member and q.order_id=p_order and q.payment_id is null
      and h.released_at is null and h.expires_at>clock_timestamp() and lower(h.period)>clock_timestamp()
  );
$$;
revoke all on function public.active_desk_order_hold(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.active_desk_order_hold(uuid,uuid,text) to service_role;
