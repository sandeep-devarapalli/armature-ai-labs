alter table public.booking_policy_settings
  add column connected_desk_checkout_enabled boolean not null default false
;
create table private.connected_desk_quotes (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references auth.users(id),
  resource_id uuid not null references public.resources(id),
  chair text not null,
  unit text not null check (unit in ('day','week','month')),
  starts_on date not null,
  ends_on date not null,
  amount_paise integer not null check (amount_paise >= 100),
  agreement_hash text not null,
  document_id text unique,
  sealed_revision text,
  order_claimed_at timestamptz,
  order_id text unique,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  check ((document_id is null) = (sealed_revision is null)),
  check (order_id is null or order_claimed_at is not null)
)
;
revoke all on private.connected_desk_quotes from public, anon, authenticated
;
create function public.connected_desk_checkout(p_action text, p_member uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  q private.connected_desk_quotes;
  v_product public.booking_products;
  v_resource uuid;
  v_days date[];
  v_start date;
  v_chair text;
  v_signed timestamptz;
  v_result jsonb;
begin
  if not exists (select 1 from public.booking_policy_settings
    where singleton and connected_desk_checkout_enabled and mock_grants_enabled and test_desk_fulfillment_enabled) then
    raise exception using errcode = '42501', message = 'Connected Test checkout is disabled';
  end if;
  if not private.has_verified_membership(p_member) then
    raise exception using errcode = '42501', message = 'Verified membership required';
  end if;

  if p_action = 'quote' then
    v_chair := p_input->>'chair';
    v_start := (p_input->>'start')::date;
    select * into strict v_product from public.booking_products
    where kind = 'workspace' and code = 'workspace-' || (p_input->>'unit')
      and enabled and price_paise >= 100;
    if not exists (select 1 from public.list_bookable_desk_dates(v_chair, v_product.unit, v_start, v_start) where available) then
      raise exception using errcode = '22023', message = 'Desk dates are unavailable';
    end if;
    select resource_id into strict v_resource from public.booking_inventory where code = v_chair;
    v_days := private.pass_dates(v_product.unit, array[v_start]);
    perform pg_advisory_xact_lock(hashtextextended(p_member::text, 84));
    select * into q from private.connected_desk_quotes
    where member_id=p_member and resource_id=v_resource and unit=v_product.unit
      and starts_on=v_start and amount_paise=v_product.price_paise
      and created_at>now()-interval '1 day' and captured_at is null
    order by created_at desc limit 1;
    if not found then
      q.id := extensions.gen_random_uuid();
      insert into private.connected_desk_quotes
        (id, member_id, resource_id, chair, unit, starts_on, ends_on, amount_paise, agreement_hash)
      values (q.id, p_member, v_resource, v_chair, v_product.unit, v_start, v_days[cardinality(v_days)], v_product.price_paise,
        encode(extensions.digest(convert_to(jsonb_build_array(q.id,p_member,v_resource,v_chair,v_product.unit,
          v_start,v_days[cardinality(v_days)],v_product.price_paise,'INR')::text,'UTF8'),'sha256'),'hex'))
      returning * into q;
    end if;
  else
    select * into strict q from private.connected_desk_quotes
    where id=(p_input->>'quoteId')::uuid and member_id=p_member for update;

    if p_action = 'seal' then
      if q.document_id is not null or p_input->>'documentId' is null
        or p_input->>'documentId' !~ '^[A-Za-z0-9_-]{8,80}$'
        or coalesce(length(p_input->>'revision'),0) not between 10 and 80 then
        raise exception using errcode = '22023', message = 'Document must be sealed once';
      end if;
      update private.connected_desk_quotes set document_id=p_input->>'documentId', sealed_revision=p_input->>'revision'
      where id=q.id returning * into q;
    elsif p_action = 'claim_order' then
      if q.document_id is null or q.order_claimed_at is not null then
        raise exception using errcode = '22023', message = 'Signed document or order reconciliation required';
      end if;
      v_signed := (p_input->>'signedAt')::timestamptz;
      if not exists (select 1 from public.list_bookable_desk_dates(q.chair, q.unit, q.starts_on, q.starts_on) where available) then
        raise exception using errcode = '22023', message = 'Desk dates are no longer available';
      end if;
      perform public.hold_signed_booking_inventory(q.id, q.resource_id, q.member_id,
        (q.starts_on+time '09:00') at time zone 'Asia/Kolkata',
        (q.ends_on+time '17:00') at time zone 'Asia/Kolkata', v_signed);
      update private.connected_desk_quotes set order_claimed_at=clock_timestamp() where id=q.id returning * into q;
    elsif p_action = 'bind_order' then
      if q.order_claimed_at is null then raise exception 'Order claim required' using errcode='22023'; end if;
      perform public.bind_test_desk_checkout_order(q.id,p_input->>'orderId',q.agreement_hash,q.amount_paise,q.unit);
      update private.connected_desk_quotes set order_id=p_input->>'orderId' where id=q.id returning * into q;
    elsif p_action = 'capture' then
      if q.order_id is null or q.order_id is distinct from p_input->>'orderId' then
        raise exception using errcode = '22023', message = 'Capture must match the bound order';
      end if;
      v_result := public.fulfill_test_desk_capture(q.order_id,p_input->>'paymentId',(p_input->>'amount')::bigint,p_input->>'currency');
      if v_result->>'status' = 'confirmed' and q.captured_at is null then
        update private.connected_desk_quotes set captured_at=clock_timestamp() where id=q.id returning * into q;
      end if;
      return v_result || jsonb_build_object('membership',private.membership_level_at(q.member_id,clock_timestamp()));
    elsif p_action <> 'status' then
      raise exception using errcode = '22023', message = 'Unknown checkout action';
    end if;
  end if;
  return to_jsonb(q);
end;
$$
;
revoke all on function public.connected_desk_checkout(text, uuid, jsonb) from public, anon, authenticated
;
grant execute on function public.connected_desk_checkout(text, uuid, jsonb) to service_role
;
create or replace function private.member_premium_periods(p_user_id uuid)
returns table(starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path='' as $$
 select t.starts_at,t.ends_at from private.membership_paid_terms t
 where t.user_id=p_user_id and t.revoked_at is null and t.captured_at<=now()
 union all
 select greatest(t.starts_at,m.starts_at,o.joined_at),least(t.ends_at,m.ends_at)
 from private.membership_paid_terms t
 join public.organization_members o on o.organization_id=t.organization_id and o.user_id=p_user_id and o.removed_at is null
 join public.organization_memberships m on m.organization_id=o.organization_id and m.status='active'
 where t.revoked_at is null and t.captured_at<=now()
 and greatest(t.starts_at,m.starts_at,o.joined_at)<least(t.ends_at,m.ends_at)
 union all
 select q.captured_at,(q.ends_on+time '17:00') at time zone 'Asia/Kolkata'
 from private.connected_desk_quotes q
 join private.test_desk_checkout_orders o on o.quote_id=q.id
 where q.member_id=p_user_id and q.captured_at is not null and o.booking_id is not null
   and exists(select 1 from public.booking_policy_settings
     where singleton and connected_desk_checkout_enabled and test_desk_fulfillment_enabled and mock_grants_enabled)
   and exists(select 1 from public.bookings b where b.id=any(o.booking_ids) and b.status='confirmed');
$$
;
