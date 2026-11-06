-- Default off, with a single explicitly allowlisted pilot member.
alter table public.booking_policy_settings
  add column live_desk_checkout_enabled boolean not null default false,
  add column live_desk_checkout_member uuid references auth.users(id) on delete set null,
  add column live_desk_checkout_policy_version text;

alter table public.paid_access_entitlements
  drop constraint paid_access_entitlements_source_check,
  add constraint paid_access_entitlements_source_check check (source in ('local_mock', 'razorpay'));

-- Check each entitlement's source so a paid desk never depends on mock grants.
create or replace function private.has_dated_access(
  p_user uuid,p_org uuid,p_start timestamptz,p_end timestamptz,p_kinds text[],p_resource uuid default null
) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.paid_access_entitlements e join public.booking_products p on p.id=e.product_id
 where e.revoked_at is null and e.starts_at<=p_start and e.ends_at>=p_end and p.kind=any(p_kinds)
 and ((e.source='local_mock' and exists(select 1 from public.booking_policy_settings where mock_grants_enabled)
       and private.has_approved_basic_membership(p_user))
   or (e.source='razorpay' and p.kind='workspace' and p_org is null and private.has_verified_membership(p_user)))
 and (p_org is null or not (p.kind='workspace' or (p.kind='overnight' and exists(select 1 from public.resource_booking_policies rp where rp.resource_id=e.resource_id and rp.kind='workspace'))) or e.seats>=(select seat_allowance from public.organization_memberships where organization_id=p_org))
 and (p_resource is null or e.resource_id=p_resource) and
 ((p_org is null and e.user_id=p_user and e.organization_id is null) or
 (p_org is not null and e.organization_id=p_org and private.has_active_team_membership(p_user,p_org,p_start,p_end))));
$$;

create table private.live_desk_quotes (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references auth.users(id),
  resource_id uuid not null references public.resources(id),
  product_id uuid not null references public.booking_products(id),
  chair text not null,
  unit text not null check (unit in ('day','week','month')),
  starts_on date not null,
  ends_on date not null,
  amount_paise bigint not null check (amount_paise >= 100),
  agreement_hash text not null,
  document_id text unique,
  sealed_revision text,
  policy_version text,
  order_claimed_at timestamptz,
  order_id text unique,
  payment_id text unique,
  captured_at timestamptz,
  refunded_amount bigint not null default 0 check (refunded_amount between 0 and amount_paise),
  booking_ids uuid[],
  entitlement_id uuid references public.paid_access_entitlements(id),
  review_reason text,
  created_at timestamptz not null default now()
);
alter table private.live_desk_quotes enable row level security;
revoke all on private.live_desk_quotes from public, anon, authenticated;
create index live_desk_member_quotes on private.live_desk_quotes (member_id, created_at desc);
create index live_desk_booking_ids on private.live_desk_quotes using gin (booking_ids) where booking_ids is not null;

create function private.close_cancelled_desk_entitlement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare q private.live_desk_quotes;
begin
  select * into q from private.live_desk_quotes where booking_ids @> array[new.id];
  if found then
    perform 1 from public.paid_access_entitlements where id=q.entitlement_id for update;
    if not exists (select 1 from public.bookings where id=any(q.booking_ids) and status='confirmed') then
      update public.paid_access_entitlements set revoked_at=clock_timestamp()
      where id=q.entitlement_id and revoked_at is null;
      update private.membership_paid_terms set revoked_at=clock_timestamp()
      where provider='razorpay' and payment_reference=q.payment_id and revoked_at is null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.close_cancelled_desk_entitlement() from public, anon, authenticated;
create trigger close_cancelled_desk_entitlement after update of status on public.bookings
for each row when (new.status='cancelled' and old.status is distinct from new.status)
execute function private.close_cancelled_desk_entitlement();

create function public.live_desk_checkout(p_action text,p_member uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  q private.live_desk_quotes;
  settings public.booking_policy_settings;
  product public.booking_products;
  resource uuid;
  location uuid;
  days date[];
  starts date;
  chair_code text := p_input->>'chair';
  pass text := p_input->>'unit';
  period tstzrange;
  hold private.checkout_inventory_holds;
  bookings uuid[];
  booking uuid;
  payment text := p_input->>'paymentId';
  provider_order text := p_input->>'orderId';
  refund bigint;
  previous_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if p_action is null or p_action not in ('availability','quote','status','seal','claim_order','bind_order','lookup_order','capture','refund') then
    raise exception using errcode='22023', message='Unknown desk checkout action';
  end if;

  if p_action in ('availability','quote','seal','claim_order') then
    select * into settings from public.booking_policy_settings where singleton for share;
    if settings.live_desk_checkout_enabled is not true or settings.mock_grants_enabled is not false
      or p_member is null or p_member is distinct from settings.live_desk_checkout_member
      or not private.membership_levels_enabled() or not private.has_verified_membership(p_member)
      or nullif(btrim(settings.live_desk_checkout_policy_version),'') is null then
      raise exception using errcode='42501', message='Live desk checkout is unavailable';
    end if;
  end if;

  if p_action='availability' then
    return jsonb_build_object(
      'chairs', coalesce((select jsonb_agg(i.code order by i.code)
        from public.booking_inventory i join public.resources r on r.id=i.resource_id
        join public.resource_booking_policies p on p.resource_id=i.resource_id
        where i.code ~ '^S(0[1-9]|1[0-9]|2[0-5])$' and p.kind='workspace'
          and r.active and r.reservable and r.capacity=1),'[]'::jsonb),
      'dates', case when chair_code is null then '[]'::jsonb else coalesce((
        select jsonb_agg(d order by d.booking_date)
        from public.list_bookable_desk_dates(chair_code,pass,(p_input->>'from')::date,(p_input->>'to')::date) d
      ), '[]'::jsonb) end);
  end if;

  if p_action='quote' then
    starts := (p_input->>'start')::date;
    select * into strict product from public.booking_products
    where kind='workspace' and code='workspace-'||pass and unit=pass and enabled and price_paise>=100;
    if not exists (select 1 from public.list_bookable_desk_dates(chair_code,pass,starts,starts) where available) then
      raise exception using errcode='22023', message='Desk dates are unavailable';
    end if;
    select resource_id into strict resource from public.booking_inventory where code=chair_code;
    days := private.pass_dates(pass,array[starts]);
    perform pg_advisory_xact_lock(hashtextextended(p_member::text,85));
    select * into q from private.live_desk_quotes
    where member_id=p_member and resource_id=resource and product_id=product.id
      and starts_on=starts and amount_paise=product.price_paise and order_claimed_at is null
      and created_at>clock_timestamp()-interval '1 day'
    order by created_at desc limit 1;
    if not found then
      q.id := extensions.gen_random_uuid();
      insert into private.live_desk_quotes
        (id,member_id,resource_id,product_id,chair,unit,starts_on,ends_on,amount_paise,agreement_hash)
      values (q.id,p_member,resource,product.id,chair_code,pass,starts,days[cardinality(days)],product.price_paise,
        encode(extensions.digest(convert_to(jsonb_build_array(q.id,p_member,resource,chair_code,pass,
          starts,days[cardinality(days)],product.price_paise,'INR','live')::text,'UTF8'),'sha256'),'hex'))
      returning * into q;
    end if;
    return to_jsonb(q);
  end if;

  if p_member is null and p_action in ('lookup_order','capture','refund') then
    select * into q from private.live_desk_quotes where order_id=provider_order for update;
    if not found then return jsonb_build_object('status','ignored'); end if;
  else
    select * into strict q from private.live_desk_quotes
    where id=(p_input->>'quoteId')::uuid and member_id=p_member for update;
  end if;

  if p_action='lookup_order' then return to_jsonb(q); end if;

  if p_action='seal' then
    if q.document_id is not null or coalesce(p_input->>'documentId','') !~ '^[A-Za-z0-9_-]{8,80}$'
      or coalesce(length(p_input->>'revision'),0) not between 10 and 80 then
      raise exception using errcode='22023', message='Seal the agreement once';
    end if;
    update private.live_desk_quotes set document_id=p_input->>'documentId',sealed_revision=p_input->>'revision'
    where id=q.id returning * into q;
  elsif p_action='claim_order' then
    if q.document_id is null or q.order_claimed_at is not null
      or p_input->>'policyVersion' is distinct from settings.live_desk_checkout_policy_version then
      raise exception using errcode='22023', message='Signed agreement and current policy acceptance required';
    end if;
    select location_id into strict location from public.resources where id=q.resource_id for share;
    perform pg_advisory_xact_lock(hashtextextended(location::text,13));
    perform pg_advisory_xact_lock(hashtextextended(q.resource_id::text,14));
    if not exists (select 1 from public.booking_products p where p.id=q.product_id and p.enabled and p.price_paise=q.amount_paise)
      or not exists (select 1 from public.list_bookable_desk_dates(q.chair,q.unit,q.starts_on,q.starts_on) where available) then
      raise exception using errcode='22023', message='Desk price or availability changed';
    end if;
    perform public.hold_signed_booking_inventory(q.id,q.resource_id,q.member_id,
      (q.starts_on+time '09:00') at time zone 'Asia/Kolkata',
      (q.ends_on+time '17:00') at time zone 'Asia/Kolkata',(p_input->>'signedAt')::timestamptz);
    update private.live_desk_quotes set order_claimed_at=clock_timestamp(),policy_version=p_input->>'policyVersion'
    where id=q.id returning * into q;
  elsif p_action='bind_order' then
    if q.order_claimed_at is null or coalesce(provider_order,'') !~ '^order_[A-Za-z0-9]+$'
      or (q.order_id is not null and q.order_id<>provider_order) then
      raise exception using errcode='22023', message='Order binding must be immutable';
    end if;
    update private.live_desk_quotes set order_id=provider_order where id=q.id returning * into q;
  elsif p_action in ('capture','refund') then
    refund := (p_input->>'refundedAmount')::bigint;
    if q.order_id is null or q.order_id is distinct from provider_order
      or (p_input->>'amount')::bigint is distinct from q.amount_paise or p_input->>'currency' is distinct from 'INR'
      or coalesce(payment,'') !~ '^pay_[A-Za-z0-9]+$' or (q.payment_id is not null and q.payment_id<>payment)
      or refund is null or refund not between 0 and q.amount_paise then
      raise exception using errcode='22023', message='Payment does not match the bound live order';
    end if;
    q.refunded_amount := greatest(q.refunded_amount,refund);
    if q.refunded_amount=q.amount_paise then
      -- Lock the full pass before cancellation triggers lock the shared entitlement.
      perform 1 from public.bookings where id=any(q.booking_ids) order by id for update;
      foreach booking in array coalesce(q.booking_ids,'{}'::uuid[]) loop
        if exists (select 1 from public.bookings where id=booking and starts_at>clock_timestamp()
          and status in ('tentative','confirmed')) then
          perform set_config('request.jwt.claim.sub',q.member_id::text,true);
          perform public.cancel_booking(booking,'Razorpay payment fully refunded');
        end if;
      end loop;
      perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
      update public.paid_access_entitlements set revoked_at=clock_timestamp()
      where id=q.entitlement_id and revoked_at is null;
      update private.membership_paid_terms set revoked_at=clock_timestamp()
      where provider='razorpay' and payment_reference=payment and revoked_at is null;
      perform public.release_signed_booking_inventory(q.id);
    elsif q.payment_id is null then
      select location_id into strict location from public.resources where id=q.resource_id for share;
      perform pg_advisory_xact_lock(hashtextextended(location::text,13));
      perform pg_advisory_xact_lock(hashtextextended(q.resource_id::text,14));
      select * into strict hold from private.checkout_inventory_holds where quote_id=q.id for update;
      period := hold.period;
      if hold.released_at is not null or hold.expires_at<=clock_timestamp() or lower(period)<=clock_timestamp() then
        q.review_reason := 'hold_unavailable';
      elsif not private.has_verified_membership(q.member_id) then
        q.review_reason := 'membership_changed';
      else
        begin
          perform public.release_signed_booking_inventory(q.id);
          insert into public.paid_access_entitlements
            (user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,granted_by,source)
          values (q.member_id,q.product_id,q.resource_id,lower(period),upper(period),1,q.amount_paise,q.member_id,'razorpay')
          returning id into q.entitlement_id;
          perform set_config('request.jwt.claim.sub',q.member_id::text,true);
          bookings := public.reserve_workspace_pass(q.resource_id,q.product_id,array[q.starts_on]);
          if cardinality(bookings) is distinct from (q.ends_on-q.starts_on+1) then
            raise exception using errcode='22023', message='Full signed period no longer available';
          end if;
          perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
          insert into private.membership_paid_terms
            (user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
          values (q.member_id,'workspace',q.unit,lower(period),upper(period),'razorpay',payment,now());
          q.booking_ids := bookings;
        exception when exclusion_violation or insufficient_privilege or invalid_parameter_value then
          q.entitlement_id := null;
          q.review_reason := 'booking_rules_changed';
        end;
      end if;
    end if;
    update private.live_desk_quotes set payment_id=payment,captured_at=coalesce(q.captured_at,now()),
      refunded_amount=q.refunded_amount,booking_ids=q.booking_ids,entitlement_id=q.entitlement_id,
      review_reason=q.review_reason
    where id=q.id returning * into q;
  end if;

  if p_action in ('status','capture','refund') and q.payment_id is not null then
    return to_jsonb(q)||jsonb_build_object(
      'status',case when q.refunded_amount=q.amount_paise then 'refunded'
        when q.booking_ids is null then 'needs_review'
        when not exists (select 1 from public.bookings where id=any(q.booking_ids) and status='confirmed') then 'cancelled'
        else 'confirmed' end,
      'bookingId',q.booking_ids[1],'bookingIds',coalesce(q.booking_ids,'{}'::uuid[]),
      'reviewReason',coalesce(q.review_reason,case when q.refunded_amount between 1 and q.amount_paise-1 then 'partial_refund' end),
      'membership',private.membership_level_at(q.member_id,clock_timestamp()));
  end if;
  return to_jsonb(q);
end;
$$;
revoke all on function public.live_desk_checkout(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.live_desk_checkout(text,uuid,jsonb) to service_role;

-- Keep the paid term on the agreed desk dates, but show Premium from capture.
create or replace function private.member_premium_periods(p_user_id uuid)
returns table(starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path='' as $$
 select case when q.id is null then t.starts_at else least(t.starts_at,t.captured_at) end,t.ends_at
 from private.membership_paid_terms t
 left join private.live_desk_quotes q on t.provider='razorpay' and q.payment_id=t.payment_reference
 where t.user_id=p_user_id and t.revoked_at is null and t.captured_at<=now()
 union all
 select greatest(t.starts_at,m.starts_at,o.joined_at),least(t.ends_at,m.ends_at)
 from private.membership_paid_terms t
 join public.organization_members o on o.organization_id=t.organization_id and o.user_id=p_user_id and o.removed_at is null
 join public.organization_memberships m on m.organization_id=o.organization_id and m.status='active'
 where t.revoked_at is null and t.captured_at<=now()
 and greatest(t.starts_at,m.starts_at,o.joined_at)<least(t.ends_at,m.ends_at);
$$;
