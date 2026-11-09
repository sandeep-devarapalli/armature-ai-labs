-- Staging only. Use a separate switch so other mock workflows cannot enable this path.
alter table public.booking_policy_settings
  add column test_desk_fulfillment_enabled boolean not null default false
;
create table private.test_desk_checkout_orders (
  quote_id uuid primary key references private.checkout_inventory_holds(quote_id),
  provider_order_id text unique not null check (provider_order_id ~ '^order_[A-Za-z0-9]+$'),
  agreement_hash text not null check (agreement_hash ~ '^[0-9a-f]{64}$'),
  product_id uuid not null references public.booking_products(id),
  amount_paise bigint not null check (amount_paise > 0),
  provider_payment_id text unique check (provider_payment_id ~ '^pay_[A-Za-z0-9]+$'),
  booking_id uuid unique references public.bookings(id),
  review_reason text check (review_reason in ('hold_unavailable', 'booking_rules_changed')),
  check (provider_payment_id is null and booking_id is null and review_reason is null
    or provider_payment_id is not null and ((booking_id is null) <> (review_reason is null)))
)
;
revoke all on private.test_desk_checkout_orders from public, anon, authenticated
;
create function public.bind_test_desk_checkout_order(
  p_quote_id uuid, p_provider_order_id text, p_agreement_hash text, p_amount_paise bigint
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hold private.checkout_inventory_holds;
  v_order private.test_desk_checkout_orders;
  v_product public.booking_products;
  v_day date;
begin
  if not exists (select 1 from public.booking_policy_settings where singleton and mock_grants_enabled and test_desk_fulfillment_enabled) then
    raise exception using errcode = '42501', message = 'Staging desk fulfillment is disabled';
  end if;
  select * into strict v_hold from private.checkout_inventory_holds where quote_id = p_quote_id for update;
  select * into v_order from private.test_desk_checkout_orders where quote_id = p_quote_id;
  if found then
    if (v_order.provider_order_id, v_order.agreement_hash, v_order.amount_paise)
      is distinct from (p_provider_order_id, p_agreement_hash, p_amount_paise) then
      raise exception using errcode = '22023', message = 'Order binding is immutable';
    end if;
    return;
  end if;
  select * into v_product from public.booking_products
  where code = 'workspace-day' and kind = 'workspace' and unit = 'day' and enabled;
  v_day := (lower(v_hold.period) at time zone 'Asia/Kolkata')::date;
  if v_product.price_paise is null or v_product.price_paise is distinct from p_amount_paise
    or v_hold.released_at is not null or v_hold.expires_at <= clock_timestamp()
    or lower(v_hold.period) <= clock_timestamp()
    or v_hold.period <> tstzrange((v_day + time '09:00') at time zone 'Asia/Kolkata',
      (v_day + time '17:00') at time zone 'Asia/Kolkata', '[)')
    or not exists (select 1 from public.resource_booking_policies
      where resource_id = v_hold.resource_id and kind = 'workspace') then
    raise exception using errcode = '22023', message = 'Active day-pass hold and matching configured price required';
  end if;
  insert into private.test_desk_checkout_orders (quote_id, provider_order_id, agreement_hash, product_id, amount_paise)
  values (p_quote_id, p_provider_order_id, p_agreement_hash, v_product.id, p_amount_paise);
end;
$$
;
-- The trusted caller must verify the Razorpay TEST capture before invoking this RPC.
create function public.fulfill_test_desk_capture(
  p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint, p_currency text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order private.test_desk_checkout_orders;
  v_hold private.checkout_inventory_holds;
  v_location uuid;
  v_bookings uuid[];
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if not exists (select 1 from public.booking_policy_settings where singleton and mock_grants_enabled and test_desk_fulfillment_enabled) then
    raise exception using errcode = '42501', message = 'Staging desk fulfillment is disabled';
  end if;
  select * into strict v_order from private.test_desk_checkout_orders
  where provider_order_id = p_provider_order_id for update;
  if p_currency is distinct from 'INR' or p_amount_paise is distinct from v_order.amount_paise
    or p_provider_payment_id is null or p_provider_payment_id !~ '^pay_[A-Za-z0-9]+$'
    or (v_order.provider_payment_id is not null and v_order.provider_payment_id <> p_provider_payment_id) then
    raise exception using errcode = '22023', message = 'Capture does not match the bound test order';
  end if;

  if v_order.provider_payment_id is null then
    select * into strict v_hold from private.checkout_inventory_holds where quote_id = v_order.quote_id;
    select location_id into strict v_location from public.resources where id = v_hold.resource_id for share;
    -- Match reserve_workspace_pass lock order.
    perform pg_advisory_xact_lock(hashtextextended(v_location::text, 13));
    perform pg_advisory_xact_lock(hashtextextended(v_hold.resource_id::text, 14));
    select * into strict v_hold from private.checkout_inventory_holds where quote_id = v_order.quote_id for update;

    if v_hold.released_at is not null or v_hold.expires_at <= clock_timestamp()
      or lower(v_hold.period) <= clock_timestamp() then
      v_order.review_reason := 'hold_unavailable';
    else
      begin
        -- This subtransaction rolls the entitlement and hold release back if booking rules reject the capture.
        update private.checkout_inventory_holds set released_at = clock_timestamp() where quote_id = v_hold.quote_id;
        insert into public.paid_access_entitlements
          (user_id, product_id, resource_id, starts_at, ends_at, seats, price_paise, granted_by)
        values (v_hold.member_id, v_order.product_id, v_hold.resource_id, lower(v_hold.period),
          upper(v_hold.period), 1, v_order.amount_paise, v_hold.member_id);
        perform set_config('request.jwt.claim.sub', v_hold.member_id::text, true);
        v_bookings := public.reserve_workspace_pass(v_hold.resource_id, v_order.product_id,
          array[(lower(v_hold.period) at time zone 'Asia/Kolkata')::date]);
        perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
        v_order.booking_id := v_bookings[1];
      exception when exclusion_violation or insufficient_privilege or invalid_parameter_value then
        v_order.review_reason := 'booking_rules_changed';
      end;
    end if;

    update private.test_desk_checkout_orders set provider_payment_id = p_provider_payment_id,
      booking_id = v_order.booking_id, review_reason = v_order.review_reason
    where quote_id = v_order.quote_id;
  end if;

  return jsonb_build_object('status', case when v_order.booking_id is null then 'needs_review' else 'confirmed' end,
    'bookingId', v_order.booking_id, 'reviewReason', v_order.review_reason);
end;
$$
;
revoke all on function public.bind_test_desk_checkout_order(uuid, text, text, bigint),
  public.fulfill_test_desk_capture(text, text, bigint, text) from public, anon, authenticated
;
grant execute on function public.bind_test_desk_checkout_order(uuid, text, text, bigint),
  public.fulfill_test_desk_capture(text, text, bigint, text) to service_role
;
