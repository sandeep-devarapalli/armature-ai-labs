-- Public launch is opt-in; the existing owner pilot remains independently gated.
alter table public.booking_policy_settings
  add column if not exists public_desk_checkout_enabled boolean not null default false;

-- Preserve earlier fingerprints and payment evidence. Unclaimed legacy quotes
-- need a fresh quote before a new agreement or order can be approved.
alter table private.live_desk_quotes
  add column if not exists quoted_policy_version text
    check (quoted_policy_version ~ '^[A-Za-z0-9._-]{4,80}$');

create or replace function public.live_desk_checkout(p_action text,p_member uuid,p_input jsonb)
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
      or p_member is null or (p_member is distinct from settings.live_desk_checkout_member
        and not settings.public_desk_checkout_enabled)
      or not private.membership_levels_enabled() or not private.has_verified_membership(p_member)
      or nullif(btrim(settings.live_desk_checkout_policy_version),'') is null then
      raise exception using errcode='42501', message='Live desk checkout is unavailable';
    end if;
  end if;

  if p_action in ('quote','seal','claim_order') and settings.public_desk_checkout_enabled
    and p_member is distinct from settings.live_desk_checkout_member then
    if p_action='quote' then
      if chair_code is distinct from 'S01' or pass not in ('day','week','month') then
        raise exception using errcode='22023', message='Only released desk passes are available';
      end if;
    elsif not exists (select 1 from private.live_desk_quotes
      where id=(p_input->>'quoteId')::uuid and member_id=p_member and chair='S01' and ((unit='day' and amount_paise=35000) or (unit='week' and amount_paise=175000) or (unit='month' and amount_paise=1300000))) then
      raise exception using errcode='22023', message='Only released desk passes are available';
    end if;
  end if;

  if p_action='availability' then
    return jsonb_build_object(
      'chairs', coalesce((select jsonb_agg(i.code order by i.code)
        from public.booking_inventory i join public.resources r on r.id=i.resource_id
        join public.resource_booking_policies p on p.resource_id=i.resource_id
        where i.code ~ '^S(0[1-9]|1[0-9]|2[0-5])$' and p.kind='workspace'
          and r.active and r.reservable and r.capacity=1
          and (p_member=settings.live_desk_checkout_member or i.code='S01')),'[]'::jsonb),
      'dates', case when chair_code is null then '[]'::jsonb else coalesce((
        select jsonb_agg(d order by d.booking_date)
        from public.list_bookable_desk_dates(chair_code,pass,(p_input->>'from')::date,(p_input->>'to')::date) d
      ), '[]'::jsonb) end);
  end if;

  if p_action='quote' then
    if p_input ? 'policyVersion'
      and p_input->>'policyVersion' is distinct from settings.live_desk_checkout_policy_version then
      raise exception using errcode='22023', message='Checkout policy configuration changed';
    end if;
    starts := (p_input->>'start')::date;
    select * into strict product from public.booking_products
    where kind='workspace' and code='workspace-'||pass and unit=pass and enabled and price_paise>=100;
    if p_member is distinct from settings.live_desk_checkout_member and product.price_paise is distinct from (case pass when 'day' then 35000 when 'week' then 175000 when 'month' then 1300000 end) then
      raise exception using errcode='22023', message='Released desk price required';
    end if;
    if not exists (select 1 from public.list_bookable_desk_dates(chair_code,pass,starts,starts) where available) then
      raise exception using errcode='22023', message='Desk dates are unavailable';
    end if;
    select resource_id into strict resource from public.booking_inventory where code=chair_code;
    days := private.pass_dates(pass,array[starts]);
    perform pg_advisory_xact_lock(hashtextextended(p_member::text,85));
    select * into q from private.live_desk_quotes
    where member_id=p_member and resource_id=resource and product_id=product.id
      and starts_on=starts and amount_paise=product.price_paise and order_claimed_at is null
      and quoted_policy_version=settings.live_desk_checkout_policy_version
      and created_at>clock_timestamp()-interval '1 day'
      and not exists (select 1 from private.manual_desk_agreements a
        where a.quote_id=private.live_desk_quotes.id and a.approved_at<=clock_timestamp()-interval '30 minutes')
    order by created_at desc limit 1;
    if not found then
      q.id := extensions.gen_random_uuid();
      insert into private.live_desk_quotes
        (id,member_id,resource_id,product_id,chair,unit,starts_on,ends_on,amount_paise,quoted_policy_version,agreement_hash)
      values (q.id,p_member,resource,product.id,chair_code,pass,starts,days[cardinality(days)],product.price_paise,
        settings.live_desk_checkout_policy_version,
        encode(extensions.digest(convert_to(jsonb_build_array(q.id,p_member,resource,chair_code,pass,
          starts,days[cardinality(days)],product.price_paise,'INR','live',settings.live_desk_checkout_policy_version)::text,'UTF8'),'sha256'),'hex'))
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

  if p_action in ('seal','claim_order')
    and q.quoted_policy_version is distinct from settings.live_desk_checkout_policy_version then
    raise exception using errcode='22023', message='A fresh quote is required for the current policy';
  end if;

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


create or replace function public.list_desk_requests(p_member uuid,p_staff boolean default false,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  row record;
  items jsonb := '[]'::jsonb;
  q jsonb;
  count_rows integer := 0;
begin
  if p_member is null or p_offset is null or p_offset<0 or p_offset>10000 then
    raise exception using errcode='22023', message='Invalid request page';
  end if;
  if p_staff and not exists(select 1 from public.staff_roles where user_id=p_member and role in ('admin','super_admin')) then
    raise exception using errcode='42501', message='Admin role required';
  end if;
  for row in select d.id,d.member_id,u.email,a.approved_at
    from private.live_desk_quotes d
    join auth.users u on u.id=d.member_id
    left join private.manual_desk_agreements a on a.quote_id=d.id
    where p_staff or d.member_id=p_member
    order by d.created_at desc,d.id desc limit 50 offset p_offset
  loop
    q := public.live_desk_checkout('status',row.member_id,jsonb_build_object('quoteId',row.id));
    items := items || jsonb_build_array(q || jsonb_build_object('approvedAt',row.approved_at)
      || case when p_staff then jsonb_build_object('memberId',row.member_id,'customerEmail',row.email) else '{}'::jsonb end);
    count_rows := count_rows+1;
  end loop;
  return jsonb_build_object('quotes',items,'nextOffset',case when count_rows=50 then p_offset+50 end);
end;
$$;
revoke all on function public.list_desk_requests(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.list_desk_requests(uuid,boolean,integer) to service_role;

create or replace function public.manual_desk_agreement(
  p_member uuid, p_quote uuid, p_review jsonb default null
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  q jsonb;
  reviewed private.manual_desk_agreements;
  document_id text := p_review->>'documentId';
  reviewer uuid := (p_review->>'reviewerId')::uuid;
  payload jsonb := jsonb_build_object('quoteId',p_quote);
begin
  if p_review is null then
    return (select approved_at from private.manual_desk_agreements
      where quote_id=p_quote and member_id=p_member);
  end if;
  if reviewer is null or reviewer=p_member
    or not exists (select 1 from public.staff_roles where user_id=reviewer and role in ('admin','super_admin'))
    or coalesce(document_id,'') !~ '^[A-Za-z0-9_-]{8,80}$'
    or coalesce(p_review->>'evidenceSha256','') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='42501', message='Authorized independent reviewer and evidence required';
  end if;

  q := public.live_desk_checkout('status',p_member,payload);
  if not exists (select 1 from public.booking_policy_settings where singleton
    and live_desk_checkout_policy_version=q->>'quoted_policy_version') then
    raise exception using errcode='22023', message='A fresh quote is required for the current policy';
  end if;
  if q->>'chair' is distinct from 'S01' or not (
      (q->>'unit'='day' and q->>'amount_paise'='35000')
      or (exists(select 1 from public.booking_policy_settings where singleton and public_desk_checkout_enabled)
        and ((q->>'unit'='week' and q->>'amount_paise'='175000') or (q->>'unit'='month' and q->>'amount_paise'='1300000')))
    )
    or q->>'agreement_hash' is distinct from p_review->>'agreementHash'
    or q->>'order_claimed_at' is not null then
    raise exception using errcode='22023', message='Agreement does not match the owner pilot quote';
  end if;

  select * into reviewed from private.manual_desk_agreements where quote_id=p_quote;
  if found then
    if reviewed.document_id=document_id and reviewed.evidence_sha256=p_review->>'evidenceSha256' then
      return reviewed.approved_at;
    end if;
    raise exception using errcode='22023', message='Existing approval cannot be replaced';
  end if;

  payload := payload || jsonb_build_object('documentId',document_id,'revision','manual-pilot-v1');
  perform public.live_desk_checkout('seal',p_member,payload);
  insert into private.manual_desk_agreements
    (quote_id,member_id,reviewer_id,document_id,agreement_hash,evidence_sha256)
  values (p_quote,p_member,reviewer,document_id,q->>'agreement_hash',p_review->>'evidenceSha256')
  returning * into reviewed;
  return reviewed.approved_at;
exception when unique_violation then
  raise exception using errcode='22023', message='Agreement evidence has already been used';
end;
$$;
revoke all on function public.manual_desk_agreement(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.manual_desk_agreement(uuid,uuid,jsonb) to service_role;
