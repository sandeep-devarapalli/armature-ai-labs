-- Durable Refrens billing outbox. Provider idempotency (24h, bound to one token) is only extra
-- protection; this ledger is the source of truth for what was invoiced and paid.
-- Refundable security deposits are never invoiced: rental invoices carry rent_paise only.

create table private.billing_settings (
 id boolean primary key default true check(id),
 invoicing_enabled boolean not null default false,
 gst_enabled boolean not null default false,
 gstin text check(gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
 gst_state_code text check(gst_state_code ~ '^[0-9]{2}$'),
 gst_effective_from date,
 sac_code text check(sac_code ~ '^[0-9]{4,8}$'),
 gst_rate numeric(5,2) check(gst_rate in (0,5,12,18,28)),
 gst_treatment_note text check(length(gst_treatment_note) between 10 and 2000),
 gst_approved_by uuid references auth.users(id),
 gst_approved_at timestamptz,
 -- GST stays off until registration, effective date and accountant-approved treatment are recorded.
 constraint billing_gst_requires_approval check(not gst_enabled or (gstin is not null and gst_state_code=left(gstin,2)
  and gst_effective_from is not null and sac_code is not null and gst_rate is not null
  and gst_treatment_note is not null and gst_approved_by is not null and gst_approved_at is not null))
);
insert into private.billing_settings default values;
alter table private.billing_settings enable row level security;
revoke all on private.billing_settings from public,anon,authenticated;
grant select on private.billing_settings to service_role;

create table private.billing_operations (
 id uuid primary key default extensions.gen_random_uuid(),
 kind text not null check(kind in ('invoice_create','payment_apply','refund_review')),
 source text not null check(source in ('desk_quote','rental_quote')),
 source_id uuid not null,
 event_ref text not null check(length(event_ref) between 3 and 120),
 depends_on uuid references private.billing_operations(id),
 test_fixture boolean not null default false,
 invoice_number text unique,
 amount_paise bigint not null check(amount_paise>0),
 payload jsonb not null,
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','claimed','succeeded','ambiguous','needs_staff','cancelled')),
 attempts integer not null default 0,
 claim_token uuid,
 claimed_at timestamptz,
 provider_invoice_id text,
 provider_payment_id text,
 last_error text check(length(last_error)<=300),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 resolved_by uuid references auth.users(id),
 resolution text check(length(resolution) between 10 and 1000),
 unique(kind,source,source_id,event_ref),
 check(kind<>'payment_apply' or depends_on is not null)
);
create index billing_operations_open on private.billing_operations(created_at) where state in ('pending','claimed','ambiguous');
alter table private.billing_operations enable row level security;
revoke all on private.billing_operations from public,anon,authenticated;
grant select on private.billing_operations to service_role;

-- What was sent, and to which source, can never be rewritten after enqueue.
create function private.billing_operation_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.kind,new.source,new.source_id,new.event_ref,new.invoice_number,new.amount_paise,new.payload,new.payload_sha256,new.depends_on,new.test_fixture)
  is distinct from (old.kind,old.source,old.source_id,old.event_ref,old.invoice_number,old.amount_paise,old.payload,old.payload_sha256,old.depends_on,old.test_fixture) then
  raise exception using errcode='42501',message='Billing operation payload is immutable'; end if;
 if old.state in ('succeeded','cancelled') and new.state is distinct from old.state then
  raise exception using errcode='42501',message='Settled billing operation cannot change'; end if;
 new.updated_at:=now(); return new;
end $$;
create trigger billing_operation_immutable before update on private.billing_operations
 for each row execute function private.billing_operation_immutable();

create function private.billing_digest(p jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(p::text,'UTF8'),'sha256'),'hex');
$$;

-- BOS (bill of supply, no tax) unless GST is approved and in force on the invoice date.
create function private.billing_document(p_invoice_number text,p_invoice_date date,p_name text,p_email text,
 p_item text,p_amount_paise bigint,p_customer_state text) returns jsonb language plpgsql stable set search_path='' as $$
declare s private.billing_settings; gst boolean;
begin
 select * into s from private.billing_settings;
 gst:=s.gst_enabled and p_invoice_date>=s.gst_effective_from;
 return jsonb_strip_nulls(jsonb_build_object('invoiceType',case when gst then 'INVOICE' else 'BOS' end,
  'invoiceNumber',p_invoice_number,'invoiceDate',p_invoice_date,'dueDate',p_invoice_date,'currency','INR',
  'billedTo',jsonb_build_object('name',p_name,'country','IN','email',p_email,'emailShowInInvoice',false,
   'gstState',case when gst then p_customer_state end),
  'billedBy',case when gst then jsonb_build_object('gstin',s.gstin,'gstState',s.gst_state_code) end,
  'items',jsonb_build_array(jsonb_build_object('name',p_item,'rate',round(p_amount_paise/100.0,2),'quantity',1,
   'gstRate',case when gst then s.gst_rate end,'sac',case when gst then s.sac_code end))));
end $$;

create function private.billing_enqueue(p_source text,p_source_id uuid,p_member uuid,p_starts date,p_ends date,
 p_item text,p_amount_paise bigint,p_payment_id text,p_captured_at timestamptz,p_party_name text,p_customer_state text,p_fixture boolean)
returns void language plpgsql security definer set search_path='' as $$
declare inv private.billing_operations; name text; email text; invoice_date date:=(p_captured_at at time zone 'Asia/Kolkata')::date;
 number text:='ARM-'||case p_source when 'desk_quote' then 'D' else 'R' end||'-'||to_char(p_starts,'YYYYMM')||'-'||upper(left(replace(p_source_id::text,'-',''),10));
 doc jsonb; gst boolean;
begin
 if p_amount_paise<=0 then return; end if;
 select nullif(btrim(coalesce(p_party_name,p.display_name)),''),u.email into name,email
  from auth.users u left join public.profiles p on p.id=u.id where u.id=p_member;
 select s.gst_enabled and invoice_date>=s.gst_effective_from into gst from private.billing_settings s;
 doc:=private.billing_document(number,invoice_date,coalesce(name,'Unnamed customer'),email,
  p_item||' ('||to_char(p_starts,'DD Mon YYYY')||' to '||to_char(p_ends,'DD Mon YYYY')||')',p_amount_paise,p_customer_state);
 insert into private.billing_operations(kind,source,source_id,event_ref,invoice_number,amount_paise,payload,payload_sha256,test_fixture,state,last_error)
 values('invoice_create',p_source,p_source_id,'invoice',number,p_amount_paise,doc,private.billing_digest(doc),p_fixture,
  case when name is null or (coalesce(gst,false) and p_customer_state is null) then 'needs_staff' else 'pending' end,
  case when name is null then 'billed_to_name_required' when coalesce(gst,false) and p_customer_state is null then 'place_of_supply_required' end)
 on conflict(kind,source,source_id,event_ref) do nothing returning * into inv;
 if inv.id is null then return; end if;
 doc:=jsonb_build_object('amount',round(p_amount_paise/100.0,2),'paymentDate',p_captured_at,'refId',p_payment_id,
  'notes','Razorpay payment '||p_payment_id);
 insert into private.billing_operations(kind,source,source_id,event_ref,depends_on,amount_paise,payload,payload_sha256,test_fixture)
 values('payment_apply',p_source,p_source_id,p_payment_id,inv.id,p_amount_paise,doc,private.billing_digest(doc),p_fixture)
 on conflict(kind,source,source_id,event_ref) do nothing;
end $$;
revoke all on function private.billing_enqueue(text,uuid,uuid,date,date,text,bigint,text,timestamptz,text,text,boolean) from public,anon,authenticated;

-- Refund endpoints are not documented by Refrens, so refunds wait for staff, never an automatic provider call.
create function private.billing_refund_review(p_source text,p_source_id uuid,p_refunded_paise bigint,p_fixture boolean)
returns void language plpgsql security definer set search_path='' as $$
declare doc jsonb:=jsonb_build_object('rentRefundedPaise',p_refunded_paise);
begin
 insert into private.billing_operations(kind,source,source_id,event_ref,depends_on,amount_paise,payload,payload_sha256,test_fixture,state,last_error)
 select 'refund_review',p_source,p_source_id,'refund:'||p_refunded_paise,o.id,p_refunded_paise,doc,private.billing_digest(doc),p_fixture,'needs_staff','rent_refund_needs_invoice_adjustment'
 from (select null::uuid id) z left join private.billing_operations o on o.kind='invoice_create' and o.source=p_source and o.source_id=p_source_id
 on conflict(kind,source,source_id,event_ref) do nothing;
end $$;
revoke all on function private.billing_refund_review(text,uuid,bigint,boolean) from public,anon,authenticated;

create function private.billing_rental_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.captured_at is null and new.captured_at is not null and new.payment_id is not null then
  perform private.billing_enqueue('rental_quote',new.id,new.member_id,new.starts_on,new.ends_on,
   case new.product when 'cabin101' then 'Cabin 101 workspace licence fee' else 'Hiwonder robotics kit rental' end,
   new.rent_paise,new.payment_id,new.captured_at,new.particulars->>'customerLegalName',new.particulars->>'customerGstState',new.test_fixture);
 end if;
 if new.rent_refunded>coalesce(old.rent_refunded,0) then
  perform private.billing_refund_review('rental_quote',new.id,new.rent_refunded,new.test_fixture);
 end if;
 return null;
end $$;
create trigger billing_rental_capture after update of captured_at,rent_refunded on private.rental_quotes
 for each row execute function private.billing_rental_capture();

create function private.billing_desk_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.captured_at is null and new.captured_at is not null and new.payment_id is not null then
  perform private.billing_enqueue('desk_quote',new.id,new.member_id,new.starts_on,new.ends_on,
   'Desk pass ('||new.unit||')',new.amount_paise,new.payment_id,new.captured_at,null,null,false);
 end if;
 if new.refunded_amount>old.refunded_amount then
  perform private.billing_refund_review('desk_quote',new.id,new.refunded_amount,false);
 end if;
 return null;
end $$;
create trigger billing_desk_capture after update of captured_at,refunded_amount on private.live_desk_quotes
 for each row execute function private.billing_desk_capture();

-- Worker API (service_role only). A stale claim means the worker died mid-call: treat as ambiguous.
create function public.billing_dispatch(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op private.billing_operations; s private.billing_settings; result jsonb; outcome text;
begin
 select * into s from private.billing_settings;
 if p_action='settings' then
  return jsonb_build_object('invoicingEnabled',s.invoicing_enabled,'gstEnabled',s.gst_enabled);
 elsif p_action='preview' then
  return jsonb_build_object('operations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'state',o.state,
   'invoiceNumber',o.invoice_number,'amountPaise',o.amount_paise,'payload',o.payload,'testFixture',o.test_fixture) order by o.created_at)
   from (select * from private.billing_operations where state in ('pending','ambiguous','needs_staff') order by created_at limit 50) o),'[]'::jsonb));
 elsif p_action='claim' then
  if not s.invoicing_enabled then raise exception using errcode='42501',message='Invoicing disabled'; end if;
  with picked as (select c.id from private.billing_operations c
   left join private.billing_operations d on d.id=c.depends_on
   where c.kind in ('invoice_create','payment_apply') and c.test_fixture=coalesce((p_input->>'testFixture')::boolean,false)
    and (c.state in ('pending','ambiguous') or (c.state='claimed' and c.claimed_at<now()-interval '10 minutes'))
    and (c.depends_on is null or d.state='succeeded')
   order by c.created_at limit least(greatest(coalesce((p_input->>'limit')::int,10),1),25)
   for update of c skip locked),
  claimed as (update private.billing_operations o set state='claimed',claim_token=extensions.gen_random_uuid(),claimed_at=now(),attempts=o.attempts+1
   from picked where o.id=picked.id returning o.*)
  select jsonb_build_object('operations',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'claimToken',c.claim_token,
   'attempts',c.attempts,'reconcileFirst',c.attempts>1,'invoiceNumber',coalesce(c.invoice_number,d.invoice_number),'createdAt',c.created_at,
   'payload',c.payload,'payloadSha256',c.payload_sha256,'providerInvoiceId',d.provider_invoice_id) order by c.created_at),'[]'::jsonb))
  into result from claimed c left join private.billing_operations d on d.id=c.depends_on;
  return result;
 elsif p_action='complete' then
  outcome:=p_input->>'outcome';
  if outcome not in ('succeeded','ambiguous','needs_staff') then raise exception using errcode='22023',message='Invalid outcome'; end if;
  update private.billing_operations set
   state=case when outcome='ambiguous' and attempts>=5 then 'needs_staff' else outcome end,
   provider_invoice_id=coalesce(provider_invoice_id,nullif(p_input->>'providerInvoiceId','')),
   provider_payment_id=coalesce(provider_payment_id,nullif(p_input->>'providerPaymentId','')),
   last_error=left(nullif(p_input->>'error',''),300),claim_token=null
  where id=(p_input->>'id')::uuid and state='claimed' and claim_token=(p_input->>'claimToken')::uuid
  returning * into op;
  if op.id is null then raise exception using errcode='P0002',message='Claim no longer held'; end if;
  if outcome='succeeded' and op.kind='invoice_create' and op.provider_invoice_id is null then
   raise exception using errcode='22023',message='Provider invoice id required'; end if;
  return jsonb_build_object('id',op.id,'state',op.state);
 end if;
 raise exception using errcode='22023',message='Unknown billing action';
end $$;
revoke all on function public.billing_dispatch(text,jsonb) from public,anon,authenticated;
grant execute on function public.billing_dispatch(text,jsonb) to service_role;
