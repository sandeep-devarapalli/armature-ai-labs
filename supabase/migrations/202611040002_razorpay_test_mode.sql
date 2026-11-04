-- Isolated provider test evidence only. This ledger never grants service access.
create table private.razorpay_test_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into private.razorpay_test_settings default values;
create table private.razorpay_test_quotes (
 id uuid primary key default extensions.gen_random_uuid(), actor_id uuid not null references auth.users(id),
 amount_paise bigint not null default 100 check(amount_paise=100), currency text not null default 'INR' check(currency='INR'),
 tax_paise bigint not null default 0 check(tax_paise=0), tax_basis text not null default 'synthetic_test_fixture' check(tax_basis='synthetic_test_fixture'),
 expires_at timestamptz not null default now()+interval '15 minutes', created_at timestamptz not null default now()
);
create table private.razorpay_test_orders (
 id uuid primary key default extensions.gen_random_uuid(), quote_id uuid not null unique references private.razorpay_test_quotes(id),
 actor_id uuid not null references auth.users(id), idempotency_key text not null check(length(idempotency_key) between 8 and 200),
 receipt text not null unique check(length(receipt)<=40), razorpay_order_id text unique check(razorpay_order_id ~ '^order_[A-Za-z0-9]+$'),
 amount_paise bigint not null check(amount_paise=100), currency text not null check(currency='INR'),
 state text not null default 'creating' check(state in ('creating','created','authorized','captured','needs_review','partially_refunded','refunded')),
 payment_id text unique, captured_at timestamptz, refunded_amount_paise bigint not null default 0 check(refunded_amount_paise between 0 and 100),
 policy_version text not null check(policy_version='2026-11-04-razorpay-test-v1'), accepted_policies jsonb not null,
 accepted_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(actor_id,idempotency_key)
);
create table private.razorpay_test_payments (
 payment_id text primary key check(payment_id ~ '^pay_[A-Za-z0-9]+$'), order_id uuid not null references private.razorpay_test_orders(id),
 status text not null check(status in ('created','authorized','captured','failed')), updated_at timestamptz not null default now()
);
create table private.razorpay_test_refunds (
 id uuid primary key default extensions.gen_random_uuid(), order_id uuid not null references private.razorpay_test_orders(id),
 idempotency_key text not null check(length(idempotency_key) between 8 and 200),
 receipt text not null unique check(length(receipt)<=40), razorpay_refund_id text unique check(razorpay_refund_id ~ '^rfnd_[A-Za-z0-9]+$'),
 amount_paise bigint not null check(amount_paise=100),
 state text not null default 'creating' check(state in ('creating','pending','processed','failed','needs_review')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(order_id,idempotency_key)
);
create table private.razorpay_test_webhook_events (
 event_id text primary key check(length(event_id) between 1 and 200), body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'),
 event_name text not null check(length(event_name) between 1 and 100), received_at timestamptz not null default now(),
 order_id uuid references private.razorpay_test_orders(id), applied boolean not null default false
);
alter table private.razorpay_test_settings enable row level security;
alter table private.razorpay_test_quotes enable row level security;
alter table private.razorpay_test_orders enable row level security;
alter table private.razorpay_test_payments enable row level security;
alter table private.razorpay_test_refunds enable row level security;
alter table private.razorpay_test_webhook_events enable row level security;
revoke all on private.razorpay_test_settings,private.razorpay_test_quotes,private.razorpay_test_orders,private.razorpay_test_payments,private.razorpay_test_refunds,private.razorpay_test_webhook_events from public,anon,authenticated,service_role;

create function private.razorpay_test_order_json(o private.razorpay_test_orders) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'quoteId',o.quote_id,'razorpayOrderId',o.razorpay_order_id,
 'amountPaise',o.amount_paise,'currency',o.currency,'state',o.state,'paymentId',o.payment_id,
 'refundedAmountPaise',o.refunded_amount_paise,'receipt',o.receipt,'createdAt',o.created_at,'refunds',coalesce((
 select jsonb_agg(jsonb_build_object('id',r.id,'razorpayRefundId',r.razorpay_refund_id,'amountPaise',r.amount_paise,'state',r.state,'receipt',r.receipt,'updatedAt',r.updated_at) order by r.created_at,r.id)
 from private.razorpay_test_refunds r where r.order_id=o.id),'[]'::jsonb));
$$;

create function private.razorpay_test_payment(p_order uuid,p_payment jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o private.razorpay_test_orders; existing private.razorpay_test_payments; payment text:=p_payment->>'paymentId'; status text:=p_payment->>'status';
begin
 select * into o from private.razorpay_test_orders where id=p_order for update;
 if o.id is null or o.razorpay_order_id is null or p_payment->>'razorpayOrderId' is distinct from o.razorpay_order_id
 or (p_payment->>'amountPaise')::bigint is distinct from o.amount_paise or p_payment->>'currency' is distinct from o.currency
 or payment is null or payment !~ '^pay_[A-Za-z0-9]+$' or status is null or status not in ('created','authorized','captured','failed') then
  raise exception 'Provider payment does not match the test order' using errcode='22023';
 end if;
 select * into existing from private.razorpay_test_payments where payment_id=payment;
 if existing.payment_id is not null and existing.order_id<>o.id then raise exception 'Provider payment already belongs to another order' using errcode='22023'; end if;
 if status='captured' and o.payment_id is not null and o.payment_id<>payment then raise exception 'Test order already has another captured payment' using errcode='22023'; end if;
 insert into private.razorpay_test_payments(payment_id,order_id,status) values(payment,o.id,status)
 on conflict(payment_id) do update set status=case when private.razorpay_test_payments.status='captured' then 'captured' else excluded.status end,updated_at=now()
 where private.razorpay_test_payments.order_id=excluded.order_id;
 if not found then raise exception 'Provider payment already belongs to another order' using errcode='22023'; end if;
 if status='captured' then
  update private.razorpay_test_orders set payment_id=payment,captured_at=coalesce(captured_at,now()),
  state=case when o.state='needs_review' and o.captured_at is not null then 'needs_review'
  when refunded_amount_paise=amount_paise then 'refunded' when refunded_amount_paise>0 then 'partially_refunded'
  when o.captured_at is null and exists(select 1 from private.razorpay_test_quotes where id=o.quote_id and expires_at<=clock_timestamp()) then 'needs_review'
  else 'captured' end,updated_at=now() where id=o.id;
 elsif status='authorized' and o.captured_at is null and o.state in ('created','creating') then
  update private.razorpay_test_orders set state='authorized',updated_at=now() where id=o.id;
 end if;
end; $$;

create function private.razorpay_test_refund(p_order uuid,p_refund uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o private.razorpay_test_orders; r private.razorpay_test_refunds; provider_id text:=p_data->>'razorpayRefundId'; status text:=p_data->>'status'; total bigint;
begin
 select * into o from private.razorpay_test_orders where id=p_order for update;
 select * into r from private.razorpay_test_refunds where id=p_refund and order_id=p_order for update;
 if o.id is null or r.id is null or o.captured_at is null or p_data->>'paymentId' is distinct from o.payment_id
 or (p_data->>'amountPaise')::bigint is distinct from r.amount_paise or p_data->>'currency' is distinct from o.currency
 or provider_id is null or provider_id !~ '^rfnd_[A-Za-z0-9]+$' or status is null or status not in ('pending','processed','failed')
 or (p_data ? 'receipt' and p_data->>'receipt' is distinct from r.receipt)
 or (r.razorpay_refund_id is not null and r.razorpay_refund_id<>provider_id) then
  raise exception 'Provider refund does not match the test operation' using errcode='22023';
 end if;
 update private.razorpay_test_refunds set razorpay_refund_id=provider_id,
 state=case when state='processed' then 'processed' else status end,updated_at=now() where id=r.id;
 select coalesce(sum(amount_paise),0) into total from private.razorpay_test_refunds where order_id=o.id and state='processed';
 if total>o.amount_paise then raise exception 'Provider refunds exceed the test capture' using errcode='22023'; end if;
 update private.razorpay_test_orders set refunded_amount_paise=total,
 state=case when total=amount_paise then 'refunded' when total>0 then 'partially_refunded' when o.state='needs_review' then 'needs_review' else 'captured' end,updated_at=now() where id=o.id;
end; $$;

create function public.razorpay_test_operation(p_actor uuid,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.razorpay_test_quotes; o private.razorpay_test_orders; r private.razorpay_test_refunds;
 key text:=p_input->>'idempotencyKey'; operation_id uuid; total bigint; should_create boolean:=false; should_refund boolean:=false;
begin
 if p_actor is null or not private.has_basic_membership(p_actor) or not exists(select 1 from public.staff_roles where user_id=p_actor and role in ('admin','super_admin')) then
  raise exception 'Active website Admin required' using errcode='42501';
 end if;
 if p_action='configure' then
  if not exists(select 1 from public.staff_roles where user_id=p_actor and role='super_admin') then raise exception 'Super admin required' using errcode='42501'; end if;
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception 'Explicit test-mode setting required' using errcode='22023'; end if;
  update private.razorpay_test_settings set enabled=(p_input->>'enabled')::boolean where singleton;
  return jsonb_build_object('enabled',(p_input->>'enabled')::boolean);
 end if;
 if not exists(select 1 from private.razorpay_test_settings where enabled) then raise exception 'Razorpay test mode is disabled' using errcode='42501'; end if;
 if p_action='create_fixture_quote' then
  if p_input<>'{}'::jsonb then raise exception 'The synthetic quote accepts no price input' using errcode='22023'; end if;
  insert into private.razorpay_test_quotes(actor_id) values(p_actor) returning * into q;
  return jsonb_build_object('quote',jsonb_build_object('id',q.id,'amountPaise',q.amount_paise,'currency',q.currency,'taxBasis',q.tax_basis,'expiresAt',q.expires_at,'policyVersion','2026-11-04-razorpay-test-v1'));
 elsif p_action='reserve_order' then
  if key is null or length(key) not between 8 and 200 or p_input->>'policyVersion' is distinct from '2026-11-04-razorpay-test-v1'
  or p_input->'acceptedPolicies' is distinct from '{"terms":true,"privacy":true,"refund":true,"shipping":true,"paymentDataSharing":true}'::jsonb then
   raise exception 'Current policies, data-sharing consent and idempotency key required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||key,44002));
  select * into o from private.razorpay_test_orders where actor_id=p_actor and idempotency_key=key for update;
  if o.id is not null then
   if o.quote_id is distinct from (p_input->>'quoteId')::uuid then raise exception 'Idempotency key conflicts with another quote' using errcode='22023'; end if;
  else
   select * into q from private.razorpay_test_quotes where id=(p_input->>'quoteId')::uuid and actor_id=p_actor for update;
   if q.id is null or q.expires_at<=clock_timestamp() or q.amount_paise<>100 or q.currency<>'INR' or q.tax_basis<>'synthetic_test_fixture' or q.tax_paise<>0 then raise exception 'Owned unexpired synthetic fixture quote required' using errcode='22023'; end if;
   if exists(select 1 from private.razorpay_test_orders where quote_id=q.id) then raise exception 'Quote already has an order; reconcile the existing operation' using errcode='22023'; end if;
   operation_id:=extensions.gen_random_uuid();
   insert into private.razorpay_test_orders(id,quote_id,actor_id,idempotency_key,receipt,amount_paise,currency,policy_version,accepted_policies)
   values(operation_id,q.id,p_actor,key,'rt_'||replace(operation_id::text,'-',''),q.amount_paise,q.currency,p_input->>'policyVersion',p_input->'acceptedPolicies') returning * into o;
   should_create:=true;
  end if;
 else
  select * into o from private.razorpay_test_orders where id=(p_input->>'orderId')::uuid and actor_id=p_actor for update;
  if o.id is null then raise exception 'Owned test order required' using errcode='42501'; end if;
  if p_action='attach_order' then
   if p_input->>'razorpayOrderId' is null or p_input->>'razorpayOrderId' !~ '^order_[A-Za-z0-9]+$'
   or (p_input->>'amountPaise')::bigint is distinct from o.amount_paise or p_input->>'currency' is distinct from o.currency
   or (o.razorpay_order_id is not null and o.razorpay_order_id<>p_input->>'razorpayOrderId') then raise exception 'Provider order does not match the test quote' using errcode='22023'; end if;
   update private.razorpay_test_orders set razorpay_order_id=p_input->>'razorpayOrderId',
   state=case when captured_at is not null then state when state in ('creating','needs_review') then 'created' else state end,updated_at=now() where id=o.id;
  elsif p_action='record_payment' then perform private.razorpay_test_payment(o.id,p_input);
  elsif p_action='reserve_refund' then
   if key is null or length(key) not between 8 and 200 or (p_input->>'amountPaise')::bigint is null or (p_input->>'amountPaise')::bigint not between 100 and o.amount_paise then raise exception 'Refund of at least INR 1 within captured amount and idempotency key required' using errcode='22023'; end if;
   select * into r from private.razorpay_test_refunds where order_id=o.id and idempotency_key=key for update;
   if r.id is not null then
    if r.amount_paise is distinct from (p_input->>'amountPaise')::bigint then raise exception 'Refund idempotency key conflicts with another amount' using errcode='22023'; end if;
   else
    if o.captured_at is null or o.payment_id is null then raise exception 'Captured test payment required' using errcode='22023'; end if;
    select coalesce(sum(amount_paise),0) into total from private.razorpay_test_refunds where order_id=o.id and state<>'failed';
    if total+(p_input->>'amountPaise')::bigint>o.amount_paise then raise exception 'Refund exceeds unreserved captured amount' using errcode='22023'; end if;
    operation_id:=extensions.gen_random_uuid();
    insert into private.razorpay_test_refunds(id,order_id,idempotency_key,receipt,amount_paise)
    values(operation_id,o.id,key,'rr_'||replace(operation_id::text,'-',''),(p_input->>'amountPaise')::bigint) returning * into r;
    should_refund:=true;
   end if;
  elsif p_action='reserve_refund_retry' then
   select * into r from private.razorpay_test_refunds where id=(p_input->>'refundId')::uuid and order_id=o.id for update;
   if r.id is null then raise exception 'Owned test refund required' using errcode='42501'; end if;
   if o.captured_at is null or o.payment_id is null or o.currency<>'INR' or r.amount_paise<>100 or r.amount_paise>o.amount_paise then raise exception 'Captured INR test payment and valid refund required' using errcode='22023'; end if;
   if r.state='needs_review' and (p_input->>'expectedUpdatedAt')::timestamptz=r.updated_at then
    update private.razorpay_test_refunds set state='creating',updated_at=clock_timestamp() where id=r.id returning * into r;
    should_refund:=true;
   end if;
  elsif p_action='attach_refund' then
   perform private.razorpay_test_refund(o.id,(p_input->>'refundId')::uuid,p_input);
  elsif p_action='needs_review' then
   if p_input->>'refundId' is not null then
    update private.razorpay_test_refunds set state='needs_review',updated_at=clock_timestamp() where id=(p_input->>'refundId')::uuid and order_id=o.id and state not in ('processed','failed');
   end if;
   update private.razorpay_test_orders set state='needs_review',updated_at=now() where id=o.id;
  elsif p_action<>'status' then raise exception 'Unknown test operation' using errcode='22023';
  end if;
 end if;
 select * into o from private.razorpay_test_orders where id=o.id;
 return jsonb_build_object('order',private.razorpay_test_order_json(o),'shouldCreate',should_create,'shouldRefund',should_refund,
 'refund',case when r.id is null then null else jsonb_build_object('id',r.id,'receipt',r.receipt,'amountPaise',r.amount_paise,'state',r.state,'razorpayRefundId',r.razorpay_refund_id,'updatedAt',r.updated_at) end);
end; $$;

create function public.razorpay_test_webhook(p_eventid text,p_hash text,p_event text,p_payment jsonb default null,p_refund jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous private.razorpay_test_webhook_events; o private.razorpay_test_orders; r private.razorpay_test_refunds; v_applied boolean:=false;
begin
 if not exists(select 1 from private.razorpay_test_settings where enabled) then raise exception 'Razorpay test mode is disabled' using errcode='42501'; end if;
 insert into private.razorpay_test_webhook_events(event_id,body_hash,event_name) values(p_eventid,p_hash,p_event) on conflict(event_id) do nothing;
 if not found then
  select * into previous from private.razorpay_test_webhook_events where event_id=p_eventid for update;
  if previous.body_hash is distinct from p_hash or previous.event_name is distinct from p_event then raise exception 'Webhook event ID conflicts with durable receipt' using errcode='22023'; end if;
  if previous.applied then return jsonb_build_object('duplicate',true,'applied',true); end if;
 end if;
 if p_payment is not null then
  select * into o from private.razorpay_test_orders where razorpay_order_id=p_payment->>'razorpayOrderId' for update;
  if o.id is not null and p_event in ('payment.authorized','payment.captured','payment.failed','order.paid') then
   if (p_event in ('payment.captured','order.paid') and p_payment->>'status' is distinct from 'captured')
   or (p_event='payment.authorized' and p_payment->>'status' not in ('authorized','captured'))
   or (p_event='payment.failed' and p_payment->>'status' is distinct from 'failed') then raise exception 'Payment event status mismatch' using errcode='22023'; end if;
   perform private.razorpay_test_payment(o.id,p_payment); v_applied:=true;
  end if;
 end if;
 if p_refund is not null and p_event in ('refund.created','refund.processed','refund.failed') then
  select * into o from private.razorpay_test_orders where payment_id=p_refund->>'paymentId' for update;
  if o.id is not null then
   select * into r from private.razorpay_test_refunds where order_id=o.id and
   (receipt=p_refund->>'receipt' or razorpay_refund_id=p_refund->>'razorpayRefundId') for update;
   if r.id is not null then
    if (p_event='refund.processed' and p_refund->>'status' is distinct from 'processed')
    or (p_event='refund.failed' and p_refund->>'status' is distinct from 'failed') then raise exception 'Refund event status mismatch' using errcode='22023'; end if;
    perform private.razorpay_test_refund(o.id,r.id,p_refund); v_applied:=true;
   end if;
  end if;
 end if;
 update private.razorpay_test_webhook_events set order_id=o.id,applied=v_applied where event_id=p_eventid;
 return jsonb_build_object('duplicate',false,'applied',v_applied);
end; $$;

revoke all on function private.razorpay_test_order_json(private.razorpay_test_orders),private.razorpay_test_payment(uuid,jsonb),private.razorpay_test_refund(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.razorpay_test_operation(uuid,text,jsonb),public.razorpay_test_webhook(text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.razorpay_test_operation(uuid,text,jsonb),public.razorpay_test_webhook(text,text,text,jsonb,jsonb) to service_role;
