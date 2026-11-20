-- Golden Pass is a purchase entitlement separate from the platform membership tier.
create table private.golden_pass_payments (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references auth.users(id),
 amount_paise bigint not null default 10000000 check (amount_paise=10000000),
 terms_version text not null default 'golden-pass-2026-11-20',
 terms_accepted_at timestamptz not null default now(),
 order_id text unique check (order_id ~ '^order_[A-Za-z0-9]{1,80}$'),
 payment_id text unique check (payment_id ~ '^pay_[A-Za-z0-9]{1,80}$'),
 captured_at timestamptz,
 starts_at timestamptz,
 ends_at timestamptz,
 refund_requested_at timestamptz,
 refunded_amount bigint not null default 0 check (refunded_amount between 0 and amount_paise),
 check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at>starts_at))
);
create index golden_pass_payment_member on private.golden_pass_payments(member_id,terms_accepted_at desc);
alter table private.golden_pass_payments enable row level security;
revoke all on private.golden_pass_payments from public,anon,authenticated,service_role;

create function private.golden_pass_eligible(p_member uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_basic_membership(p_member) and exists(
  select 1 from public.basic_onboarding_applications where user_id=p_member and status='approved'
 );
$$;

create function private.golden_pass_result(q private.golden_pass_payments) returns jsonb
language sql stable set search_path='' as $$
 select to_jsonb(q)||jsonb_build_object(
  'eligible',private.golden_pass_eligible(q.member_id),
  'active',q.starts_at is not null and q.starts_at<=now() and q.ends_at>now()
    and q.refunded_amount<q.amount_paise and private.golden_pass_eligible(q.member_id),
  'status',case
   when q.refunded_amount=q.amount_paise then 'refunded'
   when q.payment_id is not null and q.starts_at is null then 'needs_review'
   when q.ends_at<=now() then 'expired'
   when q.starts_at is not null and not private.golden_pass_eligible(q.member_id) then 'needs_review'
   when q.starts_at is not null then 'active'
   when q.order_id is not null then 'awaiting_payment'
   else 'order_pending' end
 );
$$;

create function public.golden_pass_checkout(p_action text,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 q private.golden_pass_payments;
 quote_id uuid;
 eligible boolean;
 confirmed_at timestamptz;
 refunded bigint;
begin
 if p_action='lookup_order' and p_member is null then
  select * into q from private.golden_pass_payments where order_id=p_input->>'orderId';
  if not found then return '{"status":"ignored"}'::jsonb; end if;
  return private.golden_pass_result(q);
 end if;

 if p_action in ('status','claim_order') and nullif(p_input->>'quoteId','') is null then
  if p_member is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_action='claim_order' then
   perform pg_advisory_xact_lock(hashtextextended(p_member::text,202611200003));
  end if;
  eligible:=private.golden_pass_eligible(p_member);
  select * into q from private.golden_pass_payments where member_id=p_member
  order by (refunded_amount<amount_paise and (ends_at is null or ends_at>now())) desc,terms_accepted_at desc,id desc limit 1 for update;
  if p_action='status' then
   if found then return private.golden_pass_result(q); end if;
   return jsonb_build_object('eligible',eligible,'amount_paise',10000000,'status',case when eligible then 'eligible' else 'ineligible' end);
  end if;
  if not eligible then raise exception 'Approved identity on an unrestricted account is required' using errcode='42501'; end if;
  if p_input->'acceptedTerms' is distinct from 'true'::jsonb then
   raise exception 'Accept the Golden Pass payment terms to continue' using errcode='22023';
  end if;
  if q.id is not null and q.refunded_amount<q.amount_paise and (q.ends_at is null or q.ends_at>now()) then
   return private.golden_pass_result(q)||jsonb_build_object('claimed',false);
  end if;
  insert into private.golden_pass_payments(member_id) values(p_member) returning * into q;
  return private.golden_pass_result(q)||jsonb_build_object('claimed',true);
 end if;

 quote_id:=nullif(p_input->>'quoteId','')::uuid;
 select * into q from private.golden_pass_payments where id=quote_id
  and (member_id=p_member or (p_member is null and p_action in ('capture','refund','payment_failed'))) for update;
 if not found then raise exception 'Golden Pass purchase not found' using errcode='P0002'; end if;

 if p_action='status' then
  return private.golden_pass_result(q);
 elsif p_action='bind_order' then
  if q.payment_id is not null or coalesce(p_input->>'orderId','') !~ '^order_[A-Za-z0-9]{1,80}$'
    or (q.order_id is not null and q.order_id<>p_input->>'orderId') then
   raise exception 'Order does not match this purchase' using errcode='22023';
  end if;
  update private.golden_pass_payments set order_id=p_input->>'orderId' where id=q.id returning * into q;
 elsif p_action='request_refund' then
  if q.refund_requested_at is not null then return private.golden_pass_result(q); end if;
  if q.captured_at is null or q.captured_at>now() or now()>q.captured_at+interval '30 days' or q.refunded_amount=q.amount_paise then
   raise exception 'A refund can be requested within 30 days of verified payment' using errcode='22023';
  end if;
  update private.golden_pass_payments set refund_requested_at=now() where id=q.id returning * into q;
 elsif p_action in ('capture','refund','payment_failed') then
  if q.order_id is null or q.order_id is distinct from p_input->>'orderId' then
   raise exception 'Payment does not match this purchase' using errcode='22023';
  end if;
  if p_action='payment_failed' then return private.golden_pass_result(q); end if;
  if coalesce(p_input->>'paymentId','') !~ '^pay_[A-Za-z0-9]{1,80}$'
    or (q.payment_id is not null and q.payment_id<>p_input->>'paymentId')
    or p_input->>'amount' is distinct from q.amount_paise::text or p_input->>'currency' is distinct from 'INR'
    or coalesce(p_input->>'refundedAmount','') !~ '^[0-9]{1,8}$' then
   raise exception 'Payment does not match this purchase' using errcode='22023';
  end if;
  refunded:=(p_input->>'refundedAmount')::bigint;
  if refunded>q.amount_paise or (p_action='capture' and refunded<>0) or (p_action='refund' and refunded=0) then
   raise exception 'Invalid provider refund total' using errcode='22023';
  end if;
  if q.payment_id is not null and refunded<=q.refunded_amount then return private.golden_pass_result(q); end if;
  if q.payment_id is null and refunded<q.amount_paise then
   confirmed_at:=nullif(p_input->>'confirmedAt','')::timestamptz;
   if confirmed_at is null or confirmed_at>now() or confirmed_at<q.terms_accepted_at-interval '60 seconds' then
    raise exception 'A verified payment confirmation time is required' using errcode='22023';
   end if;
  end if;
  eligible:=private.golden_pass_eligible(q.member_id);
  update private.golden_pass_payments set payment_id=p_input->>'paymentId',refunded_amount=refunded,
   captured_at=coalesce(captured_at,confirmed_at),
   starts_at=coalesce(starts_at,case when eligible then confirmed_at end),
   ends_at=coalesce(ends_at,case when eligible then ((confirmed_at at time zone 'Asia/Kolkata') + interval '12 months') at time zone 'Asia/Kolkata' end)
   where id=q.id returning * into q;
 else
  raise exception 'Unsupported Golden Pass action' using errcode='22023';
 end if;
 return private.golden_pass_result(q);
end;
$$;

create function public.staff_list_golden_pass_refund_requests() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.visit_pass_staff();
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',q.id,'applicant_email',u.email,'payment_id',q.payment_id,'starts_at',q.starts_at,'ends_at',q.ends_at,
  'refund_requested_at',q.refund_requested_at,'refunded_amount',q.refunded_amount,
  'status',private.golden_pass_result(q)->>'status'
 ) order by q.refund_requested_at,q.id)
 from private.golden_pass_payments q join auth.users u on u.id=q.member_id
 where q.refund_requested_at is not null and q.refunded_amount<q.amount_paise),'[]'::jsonb);
end;
$$;

revoke all on function private.golden_pass_eligible(uuid),private.golden_pass_result(private.golden_pass_payments) from public,anon,authenticated,service_role;
revoke all on function public.golden_pass_checkout(text,uuid,jsonb),public.staff_list_golden_pass_refund_requests() from public,anon,authenticated,service_role;
grant execute on function public.golden_pass_checkout(text,uuid,jsonb) to service_role;
grant execute on function public.staff_list_golden_pass_refund_requests() to authenticated;
