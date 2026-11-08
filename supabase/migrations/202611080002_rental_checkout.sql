insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rental-agreements','rental-agreements',false,20971520,array['application/pdf']) on conflict(id) do nothing;
-- Separate, default-closed release. Never enables the preparation/mock rental path.
create table private.rental_checkout_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 release_ready boolean not null default false, policy_version text not null default 'rental-2026-11-08',
 cabin_resource uuid references public.resources(id), equipment_resource uuid references public.resources(id),
 check(cabin_resource is null or equipment_resource is null or cabin_resource<>equipment_resource)
);
insert into private.rental_checkout_settings default values;
create table private.rental_quotes (
 id uuid primary key default extensions.gen_random_uuid(), member_id uuid not null references auth.users(id),
 parent_quote_id uuid references private.rental_quotes(id),
 product text not null check(product in ('cabin101','hiwonder')), party_type text not null check(party_type in ('individual','company')),
 resource_id uuid not null references public.resources(id), unit text not null check(unit in ('week','month')),
 starts_on date not null, ends_on date not null check(ends_on>=starts_on),
 rent_paise bigint not null check(rent_paise>0), deposit_paise bigint not null check(deposit_paise>=0),
 amount_paise bigint generated always as (rent_paise+deposit_paise) stored,
 policy_version text not null, agreement_hash text not null, particulars jsonb,
 prepared_by uuid references auth.users(id), prepared_at timestamptz, superseded_at timestamptz,
 reviewer_id uuid references auth.users(id), approved_at timestamptz,
 document_id text, evidence_sha256 text, evidence_path text,
 order_claimed_at timestamptz, order_id text unique, payment_id text unique, captured_at timestamptz,
 refunded_amount bigint not null default 0, rent_refunded bigint not null default 0,
 deposit_refunded bigint not null default 0, refund_allocation_pending boolean not null default false,
 booking_id uuid references public.bookings(id), entitlement_id uuid references public.paid_access_entitlements(id),
 workspace_booking_ids uuid[], review_reason text, created_at timestamptz not null default now(),
 check((parent_quote_id is null and deposit_paise>0) or (parent_quote_id is not null and product='cabin101' and deposit_paise=0)),
 check(refunded_amount between 0 and rent_paise+deposit_paise),
 check(rent_refunded between 0 and rent_paise), check(deposit_refunded between 0 and deposit_paise),
 check(rent_refunded+deposit_refunded<=refunded_amount)
);
create table private.rental_fulfillment_writes(transaction_id bigint not null,resource_id uuid not null,quote_id uuid not null references private.rental_quotes(id),primary key(transaction_id,resource_id));
revoke all on private.rental_fulfillment_writes from public,anon,authenticated;
create unique index rental_original_document on private.rental_quotes(document_id) where parent_quote_id is null;
create unique index rental_original_evidence on private.rental_quotes(evidence_sha256) where parent_quote_id is null;
create unique index rental_invoice_period on private.rental_quotes(parent_quote_id,starts_on) where parent_quote_id is not null and superseded_at is null;
create index rental_quotes_member on private.rental_quotes(member_id,created_at desc);
create table private.rental_refund_allocations (
 id uuid primary key default extensions.gen_random_uuid(), quote_id uuid not null references private.rental_quotes(id),
 provider_refund_id text not null unique, rent_paise bigint not null check(rent_paise>=0),
 deposit_paise bigint not null check(deposit_paise>=0), reviewer_id uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 10 and 1000), created_at timestamptz not null default now(),
 check(rent_paise+deposit_paise>0)
);
create table private.rental_operations (
 quote_id uuid primary key references private.rental_quotes(id),
 handed_over_at timestamptz, handover_by uuid references auth.users(id), handover_evidence text,
 returned_at timestamptz, return_by uuid references auth.users(id), return_evidence text
);
alter table private.rental_checkout_settings enable row level security;
alter table private.rental_quotes enable row level security;
alter table private.rental_refund_allocations enable row level security;
alter table private.rental_operations enable row level security;
revoke all on private.rental_checkout_settings,private.rental_quotes,private.rental_refund_allocations,private.rental_operations from public,anon,authenticated;
grant all on private.rental_checkout_settings,private.rental_quotes,private.rental_refund_allocations,private.rental_operations to service_role;

-- Individual and company contracts both grant only the named paying member access.
-- Team-wide entitlement must be separately reviewed, never inferred from a company name.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='private.membership_paid_terms'::regclass
 and contype='c' and pg_get_constraintdef(oid) like '%cabin%' and pg_get_constraintdef(oid) like '%organization_id%' loop
 execute format('alter table private.membership_paid_terms drop constraint %I',c.conname);
 end loop;
end $$;
alter table private.membership_paid_terms add constraint cabin_paid_term_month check(kind<>'cabin' or unit='month');

create function private.rental_quote_hash(q private.rental_quotes) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(jsonb_build_array(q.id,q.member_id,q.product,q.party_type,q.resource_id,
 q.parent_quote_id,q.unit,q.starts_on,q.ends_on,q.rent_paise,q.deposit_paise,'INR',q.policy_version,q.particulars)::text,'UTF8'),'sha256'),'hex');
$$;
create function private.rental_workspace_coverage(p_member uuid,p_start date,p_end date,p_resource uuid) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare d date; b uuid; result uuid[]:='{}'; begin
 for d in select x::date from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') x loop
 select booking.id into b from public.bookings booking join public.resource_booking_policies p on p.resource_id=booking.resource_id
 where booking.member_id=p_member and booking.status='confirmed' and p.kind in ('workspace','cabin')
 and (select location_id from public.resources where id=booking.resource_id)=(select location_id from public.resources where id=p_resource)
 and booking.starts_at<=(d+time '09:00') at time zone 'Asia/Kolkata'
 and booking.ends_at>=(d+time '17:00') at time zone 'Asia/Kolkata'
 and not exists(select 1 from private.rental_quotes cq where cq.booking_id=booking.id and cq.product='cabin101'
 and ((cq.particulars->>'accessStart')::time>time '09:00' or (cq.particulars->>'accessEnd')::time<time '17:00'))
 and exists(select 1 from public.paid_access_entitlements e join public.booking_products bp on bp.id=e.product_id
   where e.user_id=p_member and e.organization_id is null and e.resource_id=booking.resource_id
   and e.source='razorpay' and e.revoked_at is null and bp.kind in ('workspace','cabin')
   and e.starts_at<=(d+time '09:00') at time zone 'Asia/Kolkata' and e.ends_at>=(d+time '17:00') at time zone 'Asia/Kolkata')
 order by booking.created_at limit 1;
 if b is null then raise exception using errcode='22023',message='Confirmed paid workspace required for every rental day'; end if;
 if not b=any(result) then result:=array_append(result,b); end if;
 end loop; return result;
end $$;
create function private.rental_staff(p_member uuid,p_input jsonb) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare reviewer uuid:=(p_input->>'reviewerId')::uuid; begin
 if reviewer is null or reviewer=p_member or p_input->>'reviewerAal' is distinct from 'aal2'
 or not private.has_basic_membership(reviewer)
 or not exists(select 1 from public.staff_roles where user_id=reviewer and role in ('admin','super_admin')) then
 raise exception using errcode='42501',message='Independent MFA Admin required'; end if;
 return reviewer;
end $$;

create function private.rental_range_available(p_resource uuid,p_period tstzrange) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.resources where id=p_resource and active and reservable)
 and not exists(select 1 from public.resource_reservations where resource_id=p_resource and released_at is null and period&&p_period)
 and not exists(select 1 from private.checkout_inventory_holds where resource_id=p_resource and released_at is null and expires_at>clock_timestamp() and period&&p_period)
 and not exists(select 1 from public.workspace_pass_allocations where resource_id=p_resource and released_at is null
 and period&&daterange((lower(p_period) at time zone 'Asia/Kolkata')::date,((upper(p_period)-interval '1 microsecond') at time zone 'Asia/Kolkata')::date+1,'[)'));
$$;
create function public.rental_checkout(p_action text,p_member uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 q private.rental_quotes; parent private.rental_quotes; cfg private.rental_checkout_settings; resource public.resources;
 reviewer uuid; ws uuid[]; product_id uuid; start_at timestamptz; end_at timestamptz; paid_until timestamptz;
 period tstzrange; hold private.checkout_inventory_holds; refund bigint; booking uuid; entitlement uuid;
 starts date; ends date; next_month date; details jsonb; old_claim text:=current_setting('request.jwt.claim.sub',true);
begin
 if p_action is null or p_action not in ('availability','quote','status','list_own','staff_queue','prepare','manual_review',
 'approve_manual','renewal_quote','claim_order','bind_order','lookup_order','capture','refund','allocate_refund','handover','return') then
 raise exception using errcode='22023',message='Unknown rental checkout action'; end if;
 select * into strict cfg from private.rental_checkout_settings where singleton for share;
 if p_action in ('availability','quote','prepare','approve_manual','renewal_quote','claim_order') then
 if not cfg.enabled or not cfg.release_ready or not private.has_verified_membership(p_member)
 or exists(select 1 from public.booking_policy_settings where mock_grants_enabled)
 or length(cfg.policy_version)<4 then raise exception using errcode='42501',message='Rental checkout unavailable'; end if;
 end if;
 if p_action='availability' then
 if p_input ? 'start' then
 starts:=(p_input->>'start')::date;
 if starts is null or not isfinite(starts) or starts<=(now() at time zone 'Asia/Kolkata')::date then
 raise exception using errcode='22023',message='Future start date required'; end if;
 if p_input->>'product'='cabin101' then
 ends:=(p_input->>'end')::date;
 if starts<date '2027-02-01' or extract(day from starts)<>1 or ends is null or not isfinite(ends)
 or ends<(starts+interval '1 month')::date-1 or ends<>(date_trunc('month',ends)+interval '1 month')::date-1 or ends>starts+366 then
 raise exception using errcode='22023',message='Cabin 101 requires whole calendar months starting on the first'; end if;
 period:=tstzrange(starts::timestamp at time zone 'Asia/Kolkata',(ends+1)::timestamp at time zone 'Asia/Kolkata','[)');
 resource.id:=cfg.cabin_resource;
 elsif p_input->>'product'='hiwonder' and p_input->>'unit' in ('week','month') then
 ends:=starts+case p_input->>'unit' when 'week' then 6 else 29 end;
 resource.id:=cfg.equipment_resource;
 period:=tstzrange((starts+time '09:00') at time zone 'Asia/Kolkata',(ends+time '17:00') at time zone 'Asia/Kolkata','[)');
 begin perform private.rental_workspace_coverage(p_member,starts,ends,resource.id);
 exception when invalid_parameter_value then return jsonb_build_object('available',false,'reason','paid_workspace_required','staffConfirmationRequired',true); end;
 else raise exception using errcode='22023',message='Released rental product required'; end if;
 return jsonb_build_object('available',private.rental_range_available(resource.id,period),'staffConfirmationRequired',true,
 'reason',case when private.rental_range_available(resource.id,period) then 'staff_confirmation_required' else 'inventory_unavailable' end);
 end if;
 return jsonb_build_object('products',jsonb_build_array(
 jsonb_build_object('product','cabin101','availableFrom','2027-02-01','staffConfirmationRequired',true,'configured',cfg.cabin_resource is not null),
 jsonb_build_object('product','hiwonder','quantity',1,'workspaceRequired',true,'configured',cfg.equipment_resource is not null)));
 end if;
 if p_action in ('list_own','staff_queue') then
 if p_action='staff_queue' then reviewer:=private.rental_staff(null,p_input); end if;
 return jsonb_build_object('quotes',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select * from private.rental_quotes where p_action='staff_queue' or member_id=p_member
 order by created_at desc limit 50 offset least(greatest(coalesce((p_input->>'offset')::int,0),0),10000)) x),'[]'::jsonb));
 end if;
 if p_action='renewal_quote' then
 reviewer:=private.rental_staff(p_member,p_input);
 select * into parent from private.rental_quotes where id=(p_input->>'parentQuoteId')::uuid and member_id=p_member for update;
 starts:=(p_input->>'start')::date;
 if parent.id is null or parent.parent_quote_id is not null or parent.product<>'cabin101'
 or parent.booking_id is null or parent.policy_version<>cfg.policy_version or parent.refunded_amount=parent.amount_paise
 or starts is null or starts<>(date_trunc('month',starts))::date or starts<=parent.starts_on
 or starts>parent.ends_on or starts<date_trunc('month',now() at time zone 'Asia/Kolkata')::date
 or not exists(select 1 from public.bookings b join public.resource_reservations r on r.booking_id=b.id where b.id=parent.booking_id and b.status='confirmed' and r.released_at is null) then
 raise exception using errcode='22023',message='Active cabin contract and future calendar rent period required'; end if;
 select * into q from private.rental_quotes where parent_quote_id=parent.id and starts_on=starts and superseded_at is null;
 if found then
 if q.payment_id is null and q.order_claimed_at is null and q.approved_at+interval '30 minutes'<=clock_timestamp() then
 update private.rental_quotes set superseded_at=clock_timestamp() where id=q.id;
 else return to_jsonb(q)||jsonb_build_object('status',case when q.superseded_at is not null then 'superseded' when q.refunded_amount=q.amount_paise then 'refunded'
 when q.review_reason is not null then 'needs_review'
 when exists(select 1 from private.rental_operations o where o.quote_id=coalesce(q.parent_quote_id,q.id) and o.returned_at is not null) then 'returned'
 when exists(select 1 from public.bookings b where b.id=q.booking_id and b.status='cancelled') then 'cancelled'
 when q.booking_id is not null then 'confirmed'
 when q.order_id is not null then 'awaiting_payment' else 'approved' end); end if;
 end if;
 next_month:=(parent.starts_on+interval '1 month')::date;
 while exists(select 1 from private.rental_quotes child join public.paid_access_entitlements e on e.id=child.entitlement_id
 where child.parent_quote_id=parent.id and child.starts_on=next_month and child.payment_id is not null
 and child.refunded_amount<child.amount_paise and e.revoked_at is null) loop
 next_month:=(next_month+interval '1 month')::date;
 end loop;
 if starts is distinct from next_month then
 raise exception using errcode='22023',message='Invoice only the next unpaid calendar month'; end if;
 insert into private.rental_quotes(member_id,parent_quote_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,
 policy_version,agreement_hash,particulars,prepared_by,prepared_at,reviewer_id,approved_at,document_id,evidence_sha256,evidence_path)
 values(p_member,parent.id,'cabin101',parent.party_type,parent.resource_id,'month',starts,(starts+interval '1 month')::date-1,4000000,0,
 parent.policy_version,'pending',parent.particulars,reviewer,clock_timestamp(),reviewer,clock_timestamp(),parent.document_id,parent.evidence_sha256,parent.evidence_path)
 returning * into q;
 update private.rental_quotes set agreement_hash=private.rental_quote_hash(q) where id=q.id returning * into q;
 elsif p_action='quote' then
 starts:=(p_input->>'start')::date;
 if starts is null or not isfinite(starts) or starts<=(now() at time zone 'Asia/Kolkata')::date then
 raise exception using errcode='22023',message='Future start date required'; end if;
 q.id:=extensions.gen_random_uuid(); q.member_id:=p_member; q.product:=p_input->>'product';
 q.party_type:=coalesce(p_input->>'partyType','individual'); q.unit:=p_input->>'unit';
 if q.party_type not in ('individual','company') then raise exception using errcode='22023',message='Contracting party type required'; end if;
 if q.product='cabin101' then
 ends:=(p_input->>'end')::date; q.unit:='month'; q.resource_id:=cfg.cabin_resource;
 if starts<date '2027-02-01' or extract(day from starts)<>1 or ends is null or not isfinite(ends)
 or ends<(starts+interval '1 month')::date-1 or ends<>(date_trunc('month',ends)+interval '1 month')::date-1
 or ends>starts+366 then raise exception using errcode='22023',message='Cabin 101 requires whole calendar months starting on the first'; end if;
 q.rent_paise:=4000000;
 q.deposit_paise:=8000000;
 elsif q.product='hiwonder' and q.unit in ('week','month') then
 ends:=starts+case q.unit when 'week' then 6 else 29 end; q.resource_id:=cfg.equipment_resource;
 q.rent_paise:=case q.unit when 'week' then 105000 else 390000 end; q.deposit_paise:=2500000;
 ws:=private.rental_workspace_coverage(p_member,starts,ends,q.resource_id);
 else raise exception using errcode='22023',message='Released rental product required'; end if;
 select * into resource from public.resources where id=q.resource_id and active and reservable;
 if not found or not exists(select 1 from public.resource_booking_policies where resource_id=resource.id
 and kind=case q.product when 'cabin101' then 'cabin' else 'equipment' end) then
 raise exception using errcode='22023',message='Rental inventory is not configured'; end if;
 if q.product='hiwonder' and not exists(select 1 from public.equipment_rental_units u join public.asset_units a on a.id=u.asset_unit_id
 where u.resource_id=q.resource_id and u.commissioned and a.status='available') then
 raise exception using errcode='22023',message='Commissioned kit required'; end if;
 period:=case q.product when 'cabin101' then tstzrange(starts::timestamp at time zone 'Asia/Kolkata',(ends+1)::timestamp at time zone 'Asia/Kolkata','[)')
 else tstzrange((starts+time '09:00') at time zone 'Asia/Kolkata',(ends+time '17:00') at time zone 'Asia/Kolkata','[)') end;
 if not private.rental_range_available(q.resource_id,period) then raise exception using errcode='23P01',message='Inventory is no longer available'; end if;
 q.starts_on:=starts; q.ends_on:=ends; q.policy_version:=cfg.policy_version;
 q.agreement_hash:=private.rental_quote_hash(q);
 insert into private.rental_quotes(id,member_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,
 policy_version,agreement_hash,workspace_booking_ids) values(q.id,p_member,q.product,q.party_type,q.resource_id,q.unit,
 starts,ends,q.rent_paise,q.deposit_paise,q.policy_version,q.agreement_hash,ws) returning * into q;
 else
 if p_action='lookup_order' then
 select * into q from private.rental_quotes where order_id=p_input->>'orderId' for update;
 if not found then return jsonb_build_object('status','ignored'); end if;
 else select * into q from private.rental_quotes where id=(p_input->>'quoteId')::uuid for update; end if;
 if not found or (p_member is not null and q.member_id<>p_member) then
 raise exception using errcode='42501',message='Rental quote unavailable'; end if;
 end if;
 start_at:=(q.starts_on+case when q.product='cabin101' then time '00:00' else time '09:00' end) at time zone 'Asia/Kolkata';
 end_at:=case when q.product='cabin101' then (q.ends_on+1)::timestamp at time zone 'Asia/Kolkata'
 else (q.ends_on+time '17:00') at time zone 'Asia/Kolkata' end;
 period:=tstzrange(start_at,end_at,'[)');
 if p_action='prepare' then
 reviewer:=private.rental_staff(q.member_id,p_input); details:=p_input->'particulars';
 if not private.rental_range_available(q.resource_id,period) then raise exception using errcode='23P01',message='Inventory is no longer available'; end if;
 if q.approved_at is not null or q.order_claimed_at is not null or q.policy_version<>cfg.policy_version then
 raise exception using errcode='22023',message='Issue a new unsigned quote'; end if;
 if details->>'availabilityConfirmed' is distinct from 'true' or details->>'termsVersion' is distinct from cfg.policy_version
 or length(coalesce(details->>'stampDecisionReason',''))<10
 or length(coalesce(details->>'recordsPolicyReference','')) not between 10 and 1000
 or (q.product='hiwonder' and length(coalesce(details->>'unusedDepositTerms','')) not between 10 and 1000) then
 raise exception using errcode='22023',message='Final terms and availability review required'; end if;
 if q.product='cabin101' and (coalesce((details->>'capacity')::int,0)<1
 or coalesce(details->>'accessStart','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or coalesce(details->>'accessEnd','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or (details->>'accessEnd')::time<=(details->>'accessStart')::time or length(coalesce(details->>'includedFacilities',''))<3
 or jsonb_typeof(details->'permittedUsers') is distinct from 'array' or jsonb_array_length(details->'permittedUsers')<1
 or jsonb_typeof(details->'stampRequired') is distinct from 'boolean'
 or (details->>'stampRequired'='true' and length(coalesce(details->>'stampReference',''))<3)) then
 raise exception using errcode='22023',message='Cabin particulars and stamping evidence required'; end if;
 if q.product='hiwonder' and details->>'stampRequired' is distinct from 'false' then
 raise exception using errcode='22023',message='Current kit uses the approved no-stamping exception'; end if;
 q.particulars:=details; q.agreement_hash:=private.rental_quote_hash(q);
 update private.rental_quotes set particulars=details,prepared_by=reviewer,prepared_at=clock_timestamp(),agreement_hash=q.agreement_hash
 where id=q.id returning * into q;
 elsif p_action='approve_manual' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if q.prepared_at is null or q.approved_at is not null or q.order_claimed_at is not null or q.policy_version<>cfg.policy_version
 or q.agreement_hash is distinct from p_input->>'agreementHash' or p_input->>'confirmedBothSigners' is distinct from 'true'
 or coalesce(p_input->>'documentId','') !~ '^[A-Za-z0-9_-]{8,80}$' or coalesce(p_input->>'evidenceSha256','') !~ '^[0-9a-f]{64}$'
 or p_input->>'evidencePath' is distinct from q.id::text||'/'||(p_input->>'evidenceSha256')||'.pdf'
 or not exists(select 1 from storage.objects where bucket_id='rental-agreements' and name=p_input->>'evidencePath') then
 raise exception using errcode='22023',message='Exact completed agreement and both signatures required'; end if;
 update private.rental_quotes set approved_at=clock_timestamp(),reviewer_id=reviewer,document_id=p_input->>'documentId',
 evidence_sha256=p_input->>'evidenceSha256',evidence_path=p_input->>'evidencePath' where id=q.id returning * into q;
 elsif p_action='claim_order' then
 if q.superseded_at is not null or q.approved_at is null or q.approved_at+interval '30 minutes'<=clock_timestamp() or q.policy_version<>cfg.policy_version
 or q.refunded_amount>0 or q.payment_id is not null then raise exception using errcode='22023',message='Fresh approved agreement required'; end if;
 if q.product='hiwonder' then ws:=private.rental_workspace_coverage(q.member_id,q.starts_on,q.ends_on,q.resource_id); end if;
 if q.parent_quote_id is null then
 perform public.hold_signed_booking_inventory(q.id,q.resource_id,q.member_id,start_at,end_at,q.approved_at);
 elsif not exists(select 1 from private.rental_quotes p join public.bookings b on b.id=p.booking_id
 where p.id=q.parent_quote_id and b.status='confirmed' and exists(select 1 from public.resource_reservations where booking_id=b.id and released_at is null) and p.refunded_amount<p.amount_paise and p.ends_on>=q.ends_on) then
 raise exception using errcode='22023',message='Parent cabin reservation unavailable'; end if;
 if q.order_claimed_at is not null then return to_jsonb(q)||jsonb_build_object('claimed',false); end if;
 update private.rental_quotes set order_claimed_at=clock_timestamp() where id=q.id returning * into q;
 return to_jsonb(q)||jsonb_build_object('claimed',true);
 elsif p_action='bind_order' then
 if q.order_claimed_at is null or coalesce(p_input->>'orderId','') !~ '^order_[A-Za-z0-9]+$'
 or (q.order_id is not null and q.order_id<>p_input->>'orderId') then raise exception using errcode='22023',message='Claimed matching order required'; end if;
 update private.rental_quotes set order_id=p_input->>'orderId' where id=q.id returning * into q;
 elsif p_action in ('capture','refund') then
 if q.order_id is null or q.order_id is distinct from p_input->>'orderId' or (p_input->>'amount')::bigint is distinct from q.amount_paise
 or p_input->>'currency' is distinct from 'INR' or coalesce(p_input->>'paymentId','') !~ '^pay_[A-Za-z0-9]+$'
 or (q.payment_id is not null and q.payment_id<>p_input->>'paymentId') then
 raise exception using errcode='22023',message='Captured payment must match the rental order'; end if;
 refund:=coalesce((p_input->>'refundedAmount')::bigint,0);
 if refund<0 or refund>q.amount_paise then raise exception using errcode='22023',message='Invalid refund amount'; end if;
 refund:=greatest(refund,q.refunded_amount);
 if q.payment_id is null and refund>0 and refund<q.amount_paise then q.review_reason:='captured_with_partial_refund_requires_review'; end if;
 if q.payment_id is null and refund=0 and q.parent_quote_id is not null then
 select * into parent from private.rental_quotes where id=q.parent_quote_id for update;
 if q.approved_at+interval '30 minutes'<=clock_timestamp() or end_at<=clock_timestamp()
 or not private.has_verified_membership(q.member_id) or not exists(select 1 from public.bookings b join public.resource_reservations r on r.booking_id=b.id where b.id=parent.booking_id and b.status='confirmed' and r.released_at is null)
 or parent.refunded_amount=parent.amount_paise then q.review_reason:='renewal_requires_review';
 else
 select id into strict product_id from public.booking_products where code='cabin-month';
 insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
 values(q.member_id,product_id,q.resource_id,greatest(start_at,clock_timestamp()),end_at,1,q.rent_paise,'razorpay',q.member_id) returning id into entitlement;
 insert into private.membership_paid_terms(user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
 values(q.member_id,'cabin','month',greatest(start_at,clock_timestamp()),end_at,'razorpay',p_input->>'paymentId',clock_timestamp());
 q.booking_id:=parent.booking_id; q.entitlement_id:=entitlement;
 end if;
 elsif q.payment_id is null and refund=0 then
 perform pg_advisory_xact_lock(hashtextextended(q.resource_id::text,14));
 select * into hold from private.checkout_inventory_holds where quote_id=q.id for update;
 if hold.quote_id is null or hold.released_at is not null or hold.expires_at<=clock_timestamp() or start_at<=clock_timestamp()
 or not private.has_verified_membership(q.member_id)
 or not exists(select 1 from public.resources where id=q.resource_id and active and reservable)
 or (q.product='hiwonder' and not exists(select 1 from public.equipment_rental_units u join public.asset_units a on a.id=u.asset_unit_id
 where u.resource_id=q.resource_id and u.commissioned and a.status='available'))
 then q.review_reason:='hold_or_membership_unavailable';
 else
 begin
 if q.product='hiwonder' then ws:=private.rental_workspace_coverage(q.member_id,q.starts_on,q.ends_on,q.resource_id); end if;
 perform public.release_signed_booking_inventory(q.id);
 insert into private.equipment_rental_writes(transaction_id,resource_id) values(txid_current(),q.resource_id) on conflict do nothing;
 insert into private.rental_fulfillment_writes values(txid_current(),q.resource_id,q.id);
 insert into public.bookings(resource_id,member_id,starts_at,ends_at,idempotency_key,notes)
 values(q.resource_id,q.member_id,start_at,end_at,'rental:'||q.id,'Paid rental; access limited to signed hours and paid entitlement') returning id into booking;
 insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at) values(q.resource_id,'booking',booking,start_at,end_at);
 delete from private.equipment_rental_writes where transaction_id=txid_current() and resource_id=q.resource_id;
 delete from private.rental_fulfillment_writes where transaction_id=txid_current() and resource_id=q.resource_id;
 select id into strict product_id from public.booking_products where code=case q.product when 'cabin101' then 'cabin-month' else 'equipment-day' end;
 paid_until:=case q.product when 'cabin101' then ((date_trunc('month',q.starts_on)+interval '1 month')::date+time '00:00') at time zone 'Asia/Kolkata' else end_at end;
 insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
 values(q.member_id,product_id,q.resource_id,start_at,paid_until,1,q.rent_paise,'razorpay',q.member_id) returning id into entitlement;
 if q.product='cabin101' then
 insert into private.membership_paid_terms(user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
 values(q.member_id,'cabin','month',start_at,paid_until,'razorpay',p_input->>'paymentId',clock_timestamp());
 end if;
 q.booking_id:=booking; q.entitlement_id:=entitlement;
 exception when exclusion_violation or insufficient_privilege or invalid_parameter_value then q.review_reason:='fulfillment_requires_review';
 end;
 end if;
 end if;
 if refund=q.amount_paise then
 if q.parent_quote_id is null and q.booking_id is not null and start_at>clock_timestamp()
 and not exists(select 1 from private.rental_quotes child where child.parent_quote_id=q.id and child.payment_id is not null and child.refunded_amount<child.amount_paise) then
 update public.bookings set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=q.member_id,cancellation_reason='Full rental payment refund'
 where id=q.booking_id and status='confirmed';
 update public.resource_reservations set released_at=clock_timestamp() where booking_id=q.booking_id and released_at is null;
 elsif q.parent_quote_id is null and q.booking_id is not null then q.review_reason:='full_refund_contract_requires_review'; end if;
 update public.paid_access_entitlements set revoked_at=clock_timestamp() where id=q.entitlement_id and revoked_at is null;
 update private.membership_paid_terms set revoked_at=clock_timestamp() where provider='razorpay' and payment_reference=p_input->>'paymentId' and revoked_at is null;
 perform public.release_signed_booking_inventory(q.id);
 end if;
 update private.rental_quotes set payment_id=p_input->>'paymentId',captured_at=coalesce(captured_at,clock_timestamp()),
 refunded_amount=refund,booking_id=q.booking_id,entitlement_id=q.entitlement_id,review_reason=q.review_reason,
 rent_refunded=case when refund=q.amount_paise then rent_paise else rent_refunded end,
 deposit_refunded=case when refund=q.amount_paise then deposit_paise else deposit_refunded end,
 refund_allocation_pending=refund>0 and refund<q.amount_paise and refund>rent_refunded+deposit_refunded,
 workspace_booking_ids=coalesce(ws,workspace_booking_ids) where id=q.id returning * into q;
 elsif p_action='allocate_refund' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if q.payment_id is null or coalesce(p_input->>'refundId','') !~ '^rfnd_[A-Za-z0-9]+$'
 or coalesce((p_input->>'rentPaise')::bigint,-1)<0 or coalesce((p_input->>'depositPaise')::bigint,-1)<0
 or q.rent_refunded+(p_input->>'rentPaise')::bigint>q.rent_paise
 or q.deposit_refunded+(p_input->>'depositPaise')::bigint>q.deposit_paise
 or q.rent_refunded+q.deposit_refunded+(p_input->>'rentPaise')::bigint+(p_input->>'depositPaise')::bigint>q.refunded_amount then
 raise exception using errcode='22023',message='Allocation must match verified provider refunds'; end if;
 insert into private.rental_refund_allocations(quote_id,provider_refund_id,rent_paise,deposit_paise,reviewer_id,reason)
 values(q.id,p_input->>'refundId',(p_input->>'rentPaise')::bigint,(p_input->>'depositPaise')::bigint,reviewer,p_input->>'reason');
 update private.rental_quotes set rent_refunded=rent_refunded+(p_input->>'rentPaise')::bigint,
 deposit_refunded=deposit_refunded+(p_input->>'depositPaise')::bigint,
 refund_allocation_pending=refunded_amount>rent_refunded+deposit_refunded+(p_input->>'rentPaise')::bigint+(p_input->>'depositPaise')::bigint
 where id=q.id returning * into q;
 elsif p_action in ('handover','return') then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if q.booking_id is null or q.refunded_amount=q.amount_paise or (p_action='handover' and q.refund_allocation_pending) or length(coalesce(p_input->>'evidence',''))<10 then
 raise exception using errcode='22023',message='Confirmed rental and condition evidence required'; end if;
 if p_action='handover' then
 if q.product='hiwonder' then perform private.rental_workspace_coverage(q.member_id,q.starts_on,q.ends_on,q.resource_id); end if;
 insert into private.rental_operations(quote_id,handed_over_at,handover_by,handover_evidence)
 values(q.id,clock_timestamp(),reviewer,p_input->>'evidence');
 else
 update private.rental_operations set returned_at=clock_timestamp(),return_by=reviewer,return_evidence=p_input->>'evidence'
 where quote_id=q.id and handed_over_at is not null and returned_at is null;
 if not found then raise exception using errcode='22023',message='Unreturned handover required'; end if;
 update public.bookings set status='completed' where id=q.booking_id and status='confirmed';
 update public.resource_reservations set released_at=clock_timestamp() where booking_id=q.booking_id and released_at is null;
 update public.paid_access_entitlements set revoked_at=clock_timestamp() where id in(select entitlement_id from private.rental_quotes where booking_id=q.booking_id) and revoked_at is null;
 update private.membership_paid_terms set revoked_at=clock_timestamp() where provider='razorpay' and payment_reference in(select payment_id from private.rental_quotes where booking_id=q.booking_id) and revoked_at is null;
 end if;
 end if;
 return to_jsonb(q)||jsonb_build_object('status',case when q.superseded_at is not null then 'superseded' when q.refunded_amount=q.amount_paise then 'refunded'
 when q.review_reason is not null then 'needs_review'
 when exists(select 1 from private.rental_operations o where o.quote_id=coalesce(q.parent_quote_id,q.id) and o.returned_at is not null) then 'returned'
 when exists(select 1 from public.bookings b where b.id=q.booking_id and b.status='cancelled') then 'cancelled'
 when q.booking_id is not null then 'confirmed'
 when q.order_id is not null then 'awaiting_payment' when q.approved_at is not null then 'approved'
 when q.prepared_at is not null then 'awaiting_signatures' else 'awaiting_staff' end,
 'operations',(select to_jsonb(o) from private.rental_operations o where quote_id=q.id),'bookingId',q.booking_id,'membership',private.membership_level_at(q.member_id,clock_timestamp()));
end $$;
revoke all on function private.rental_quote_hash(private.rental_quotes),private.rental_workspace_coverage(uuid,date,date,uuid),private.rental_staff(uuid,jsonb),private.rental_range_available(uuid,tstzrange) from public,anon,authenticated;
revoke all on function public.rental_checkout(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rental_checkout(text,uuid,jsonb) to service_role;

-- Keep signed daily access separate from the exclusive whole-cabin reservation.
alter function private.require_booking_policy_access(uuid,uuid,timestamptz,timestamptz,text,uuid,integer)
 rename to require_booking_policy_access_before_rentals;
create function private.require_booking_policy_access(p_user uuid,p_resource uuid,p_start timestamptz,p_end timestamptz,p_source text,p_org uuid,p_guests integer)
returns void language plpgsql security definer set search_path='' as $$
declare q private.rental_quotes; local_now timestamp:=clock_timestamp() at time zone 'Asia/Kolkata'; begin
 select x.* into q from private.rental_quotes x join public.bookings b on b.id=x.booking_id
 where x.member_id=p_user and x.resource_id=p_resource and b.starts_at=p_start and b.ends_at=p_end and b.status='confirmed'
 order by exists(select 1 from public.paid_access_entitlements e where e.id=x.entitlement_id and e.revoked_at is null and e.starts_at<=clock_timestamp() and e.ends_at>clock_timestamp()) desc,x.created_at desc limit 1;
 if not found then
 perform private.require_booking_policy_access_before_rentals(p_user,p_resource,p_start,p_end,p_source,p_org,p_guests); return;
 end if;
 if p_source<>'personal' or p_org is not null or p_guests<>0 or not private.has_verified_membership(p_user)
 or not exists(select 1 from public.resources where id=p_resource and active)
 or not exists(select 1 from public.paid_access_entitlements where id=q.entitlement_id and revoked_at is null
 and starts_at<=clock_timestamp() and ends_at>clock_timestamp()) then
 raise exception using errcode='42501',message='Current paid rental access required'; end if;
 if q.product='cabin101' then
 if local_now::time<(q.particulars->>'accessStart')::time or local_now::time>=(q.particulars->>'accessEnd')::time then
 raise exception using errcode='42501',message='Outside signed cabin access hours'; end if;
 else
 if local_now::time<time '09:00' or local_now::time>=time '17:00' then raise exception using errcode='42501',message='Outside rental workspace hours'; end if;
 perform private.rental_workspace_coverage(p_user,local_now::date,local_now::date,q.resource_id);
 end if;
end $$;
revoke all on function private.require_booking_policy_access(uuid,uuid,timestamptz,timestamptz,text,uuid,integer),
private.require_booking_policy_access_before_rentals(uuid,uuid,timestamptz,timestamptz,text,uuid,integer) from public,anon,authenticated;

create function private.guard_live_rental_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.resource_id,new.member_id,new.starts_at,new.ends_at,new.organization_id,new.access_source) is distinct from
 (old.resource_id,old.member_id,old.starts_at,old.ends_at,old.organization_id,old.access_source)
 and exists(select 1 from private.rental_quotes where booking_id=old.id) then
 raise exception using errcode='42501',message='Signed rental requires a new approved agreement'; end if;
 if (new.status<>'confirmed' or (new.starts_at,new.ends_at,new.resource_id,new.member_id) is distinct from (old.starts_at,old.ends_at,old.resource_id,old.member_id))
 and exists(select 1 from private.rental_quotes q join public.bookings b on b.id=q.booking_id
 left join private.rental_operations o on o.quote_id=q.id
 where old.id=any(q.workspace_booking_ids) and b.status='confirmed' and o.returned_at is null) then
 raise exception using errcode='42501',message='Resolve dependent paid kit rental before changing workspace'; end if;
 return new;
end $$;
revoke all on function private.guard_live_rental_booking() from public,anon,authenticated;
create trigger guard_live_rental_booking before update on public.bookings for each row execute function private.guard_live_rental_booking();

create or replace function private.guard_workspace_allocation() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings; k text;
begin
 if tg_op='UPDATE' and old.booking_id is not null and (new.resource_id,new.starts_at,new.ends_at) is distinct from (old.resource_id,old.starts_at,old.ends_at) and exists(select 1 from public.booking_inventory where resource_id=old.resource_id) then raise exception 'Cancel and reserve a new workspace pass to change dates' using errcode='42501'; end if;
 if new.released_at is not null or not exists(select 1 from public.booking_inventory where resource_id=new.resource_id) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.resource_id::text,14));
 if tg_op='INSERT' and new.booking_id is not null and (new.starts_at at time zone 'Asia/Kolkata')::time>=time '09:00' and (new.starts_at at time zone 'Asia/Kolkata')::time<time '17:00' and not exists(select 1 from private.workspace_booking_requests where transaction_id=txid_current() and resource_id=new.resource_id) then raise exception 'Use workspace pass reservation for mapped inventory' using errcode='42501'; end if;
 if exists(select 1 from public.workspace_pass_allocations a where a.resource_id=new.resource_id and a.released_at is null
 and exists(select 1 from generate_series((new.starts_at at time zone 'Asia/Kolkata')::date::timestamp,((new.ends_at-interval '1 microsecond') at time zone 'Asia/Kolkata')::date::timestamp,interval '1 day') d where tstzrange(new.starts_at,new.ends_at,'[)') && tstzrange((d::date+time '09:00') at time zone 'Asia/Kolkata',(d::date+time '17:00') at time zone 'Asia/Kolkata','[)'))
 and a.period && daterange((new.starts_at at time zone 'Asia/Kolkata')::date,((new.ends_at-interval '1 microsecond') at time zone 'Asia/Kolkata')::date+1,'[)')
 and not coalesce(new.booking_id=any(a.booking_ids),false)) then raise exception 'Resource is reserved by a workspace pass' using errcode='23P01'; end if;
 if new.booking_id is not null then
  select * into b from public.bookings where id=new.booking_id;
  select kind into k from public.resource_booking_policies where resource_id=new.resource_id;
  if k='cabin' and not exists(select 1 from private.rental_fulfillment_writes w join private.rental_quotes q on q.id=w.quote_id
 where w.transaction_id=txid_current() and w.resource_id=new.resource_id and q.member_id=b.member_id and q.approved_at is not null
 and b.idempotency_key='rental:'||q.id) and (b.organization_id is null or not exists(select 1 from public.paid_access_entitlements e join public.booking_products p on p.id=e.product_id
    where e.organization_id=b.organization_id and e.resource_id=new.resource_id and p.kind='cabin' and p.unit='month' and e.revoked_at is null and e.starts_at<=b.starts_at and e.ends_at>=b.ends_at)) then
   raise exception 'Cabins require whole-cabin monthly team access' using errcode='42501';
  end if;
 end if;
 return new;
end; $$;
