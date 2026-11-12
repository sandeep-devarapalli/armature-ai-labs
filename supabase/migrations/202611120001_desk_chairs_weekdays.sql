-- Owner 2026-11-12: thirteen GF-10 chairs (S01-S13) are bookable as day, week or month desk passes,
-- Monday to Friday 09:00-17:00 only; weekends belong to the event space. Week and month passes keep their
-- calendar span and price but only book the open weekdays inside it. New chairs copy Desk S01's settings,
-- so databases without S01 are unchanged.
create function private.desk_day_open(p_resource uuid,p_day date) returns boolean language sql stable set search_path='' as $$
 select private.within_resource_hours(p_resource,(p_day+time '09:00') at time zone 'Asia/Kolkata',(p_day+time '17:00') at time zone 'Asia/Kolkata');
$$;
create function private.desk_open_days(p_resource uuid,p_from date,p_to date) returns integer language sql stable set search_path='' as $$
 select count(*)::integer from generate_series(p_from,p_to,interval '1 day') d where private.desk_day_open(p_resource,d::date);
$$;
revoke all on function private.desk_day_open(uuid,date),private.desk_open_days(uuid,date,date) from public,anon,authenticated;

do $$
declare base public.resources; n integer; rid uuid;
begin
 select r.* into base from public.booking_inventory i join public.resources r on r.id=i.resource_id where i.code='S01';
 if base.id is null then return; end if;
 for n in 2..13 loop
  continue when exists(select 1 from public.booking_inventory where code='S'||lpad(n::text,2,'0'));
  insert into public.resources(location_id,slug,name,description,kind,risk,capacity,max_guests,guests_allowed,reservable,active,
   default_duration_minutes,increment_minutes,max_duration_minutes,booking_horizon_days,checkin_early_minutes,checkin_late_minutes,checkout_grace_minutes)
  values(base.location_id,'desk-s'||lpad(n::text,2,'0'),'Desk S'||lpad(n::text,2,'0'),base.description,base.kind,base.risk,1,base.max_guests,base.guests_allowed,
   base.reservable,base.active,base.default_duration_minutes,base.increment_minutes,base.max_duration_minutes,base.booking_horizon_days,
   base.checkin_early_minutes,base.checkin_late_minutes,base.checkout_grace_minutes)
  returning id into rid;
  insert into public.resource_booking_policies(resource_id,kind) values(rid,'workspace');
  insert into public.booking_inventory(resource_id,code,floor,room) values(rid,'S'||lpad(n::text,2,'0'),'GF','GF-10');
 end loop;
 delete from public.resource_hours h using public.booking_inventory i
  where h.resource_id=i.resource_id and i.code ~ '^S(0[1-9]|1[0-3])$';
 insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at)
  select i.resource_id,dow,time '09:00',time '17:00' from public.booking_inventory i cross join generate_series(1,5) dow
  where i.code ~ '^S(0[1-9]|1[0-3])$';
end $$;

create or replace function public.list_bookable_desk_dates(
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
      and (p_pass = 'month' or private.desk_day_open(v_resource.id, candidate.day))
      and exists (select 1 from unnest(candidate.days) d where private.desk_day_open(v_resource.id, d))
      and not exists (
        select 1 from unnest(candidate.days) d
        join public.booking_closures c on c.location_id = v_resource.location_id and c.closed_on = d
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


create or replace function public.reserve_workspace_pass(p_resource_id uuid,p_product_id uuid,p_dates date[],p_organization_id uuid default null) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare p public.booking_products; r public.resources; ds date[]; d date; ids uuid[]:='{}'; bid uuid; s timestamptz; e timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into p from public.booking_products where id=p_product_id and enabled and kind in ('workspace','cabin') and unit in ('day','week','month');
 select rr.* into r from public.resources rr join public.booking_inventory i on i.resource_id=rr.id join public.resource_booking_policies bp on bp.resource_id=rr.id where rr.id=p_resource_id and bp.kind=p.kind for share of rr;
 if p.id is null or r.id is null or (p.kind='cabin' and (p.unit<>'month' or r.capacity<>6)) or (p.kind='workspace' and r.capacity<>1) then raise exception 'Configured workspace inventory required' using errcode='22023'; end if;
 ds:=private.pass_dates(p.unit,p_dates);
 perform 1 from public.organization_memberships where organization_id=p_organization_id for share;
 if p.kind='cabin' and (p_organization_id is null or not private.is_team_admin(p_organization_id)) then raise exception 'Team admin required for whole cabin' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.location_id::text,13));
 perform pg_advisory_xact_lock(hashtextextended(r.id::text,14));
 if exists(select 1 from public.workspace_pass_allocations a where a.resource_id=r.id and a.released_at is null and exists(select 1 from unnest(ds) day where a.period @> day)) then raise exception 'Resource is reserved by a workspace pass' using errcode='23P01'; end if;
 if exists(select 1 from public.resource_reservations rr cross join unnest(ds) day where rr.resource_id=r.id and rr.released_at is null and rr.period && tstzrange((day+time '09:00') at time zone 'Asia/Kolkata',(day+time '17:00') at time zone 'Asia/Kolkata','[)')) then raise exception 'Resource is no longer available for selected dates' using errcode='23P01'; end if;
 insert into private.workspace_booking_requests values(txid_current(),r.id);
 foreach d in array ds loop
  if exists(select 1 from public.booking_closures where location_id=r.location_id and closed_on=d) then
   if p.unit='day' then raise exception 'Lab is closed on a selected date' using errcode='22023'; end if;
   continue;
  end if;
  s:=(d+time '09:00') at time zone 'Asia/Kolkata'; e:=(d+time '17:00') at time zone 'Asia/Kolkata';
  if p.unit<>'day' and not private.within_resource_hours(r.id,s,e) then continue; end if;
  if not exists(select 1 from public.paid_access_entitlements x where x.product_id=p.id and x.resource_id=r.id and x.revoked_at is null and x.starts_at<=s and x.ends_at>=e and ((p_organization_id is null and x.user_id=auth.uid()) or x.organization_id=p_organization_id)) then raise exception 'Matching pass entitlement required' using errcode='42501'; end if;
  bid:=public.create_booking_with_access(r.id,s,e,'{}',null,null,case when p_organization_id is null then 'personal' else 'team' end,p_organization_id);
  ids:=array_append(ids,bid);
 end loop;
 delete from private.workspace_booking_requests where transaction_id=txid_current() and resource_id=r.id;
 if cardinality(ids)=0 then raise exception 'No open dates in selected pass' using errcode='22023'; end if;
 if p.unit in ('week','month') then
  insert into public.workspace_pass_allocations(resource_id,member_id,product_id,period,booking_ids) values(r.id,auth.uid(),p.id,daterange(ds[1],ds[cardinality(ds)]+1,'[)'),ids);
 end if;
 return ids;
end; $$;


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
      if chair_code is null or chair_code !~ '^S(0[1-9]|1[0-3])$' or pass not in ('day','week','month') then
        raise exception using errcode='22023', message='Only released desk passes are available';
      end if;
    elsif not exists (select 1 from private.live_desk_quotes
      where id=(p_input->>'quoteId')::uuid and member_id=p_member and chair ~ '^S(0[1-9]|1[0-3])$' and ((unit='day' and amount_paise=35000) or (unit='week' and amount_paise=175000) or (unit='month' and amount_paise=1300000))) then
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
          and (p_member=settings.live_desk_checkout_member or i.code ~ '^S(0[1-9]|1[0-3])$')),'[]'::jsonb),
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
          if cardinality(bookings) is distinct from private.desk_open_days(q.resource_id,q.starts_on,q.ends_on) then
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
  if coalesce(q->>'chair','') !~ '^S(0[1-9]|1[0-3])$' or not (
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
