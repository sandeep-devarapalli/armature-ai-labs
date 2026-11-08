-- New contracts collect only rent through Razorpay. Existing signed quotes retain their payment method and hash.
alter table private.rental_checkout_settings add column bank_deposits_enabled boolean not null default true,
 add column fixture_member uuid references auth.users(id);
alter table private.rental_quotes add column deposit_method text not null default 'razorpay' check(deposit_method in ('razorpay','bank_transfer')),
 add column test_fixture boolean not null default false,
 add column payment_amount_paise bigint generated always as (case when deposit_method='bank_transfer' then rent_paise else rent_paise+deposit_paise end) stored,
 add column deposit_reference text,
 add column deposit_verified_at timestamptz,
 add column deposit_verified_by uuid references auth.users(id),
 add column deposit_verified_reference text,
 add column bank_deposit_refunded_paise bigint not null default 0 check(bank_deposit_refunded_paise>=0 and bank_deposit_refunded_paise<=deposit_paise);
create table private.rental_bank_transfers (
 id uuid primary key default extensions.gen_random_uuid(),quote_id uuid not null references private.rental_quotes(id),
 refund_account_version integer,
 direction text not null check(direction in ('received','refunded')),
 reference text not null check(length(btrim(reference)) between 6 and 80),
 amount_paise bigint not null check(amount_paise>0),reviewer_id uuid not null references auth.users(id),
 evidence text not null check(length(btrim(evidence)) between 10 and 1000),created_at timestamptz not null default now(),
 unique(direction,reference)
);
create unique index rental_bank_deposit_once on private.rental_bank_transfers(quote_id) where direction='received';
alter table private.rental_bank_transfers enable row level security;
revoke all on private.rental_bank_transfers from public,anon,authenticated;
grant select,insert on private.rental_bank_transfers to service_role;
create table private.rental_refund_accounts (
 quote_id uuid not null references private.rental_quotes(id),version integer not null check(version>0),
 account_name text not null check(length(account_name) between 2 and 160),bank_name text not null check(length(bank_name) between 2 and 120),
 account_number text not null check(account_number ~ '^[0-9]{6,24}$'),ifsc text not null check(ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
 ownership_confirmed_at timestamptz not null default now(),submitted_by uuid not null references auth.users(id),
 verified_at timestamptz,verified_by uuid references auth.users(id),verification_evidence text,
 primary key(quote_id,version)
);
alter table private.rental_refund_accounts enable row level security;
revoke all on private.rental_refund_accounts from public,anon,authenticated;
grant select,insert,update on private.rental_refund_accounts to service_role;
alter table private.rental_bank_transfers add foreign key(quote_id,refund_account_version) references private.rental_refund_accounts(quote_id,version);
create or replace function private.rental_quote_hash(q private.rental_quotes) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to((jsonb_build_array(q.id,q.member_id,q.product,q.party_type,q.resource_id,
 q.parent_quote_id,q.unit,q.starts_on,q.ends_on,q.rent_paise,q.deposit_paise,'INR',q.policy_version,q.particulars)
 ||case when q.deposit_method='bank_transfer' then jsonb_build_array('bank_transfer','razorpay_rent_only',q.test_fixture) else '[]'::jsonb end)::text,'UTF8'),'sha256'),'hex');
$$;
create function private.rental_bank_state(q private.rental_quotes) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('deposit_status',case when q.deposit_paise=0 then 'not_required'
 when q.bank_deposit_refunded_paise=q.deposit_paise then 'refunded'
 when q.bank_deposit_refunded_paise>0 then 'partially_refunded'
 when q.deposit_verified_at is not null then 'verified'
 when q.deposit_reference is not null then 'submitted' else 'pending' end,
 'payment_window_at',case when q.approved_at is not null then greatest(q.approved_at,q.deposit_verified_at) end,
 'refund_account',(select jsonb_build_object('version',a.version,'accountName',a.account_name,'bankName',a.bank_name,'ifsc',a.ifsc,
 'last4',right(a.account_number,4),'verifiedAt',a.verified_at,'ownershipConfirmed',true)
 from private.rental_refund_accounts a where a.quote_id=q.id order by a.version desc limit 1));
$$;
revoke all on function private.rental_bank_state(private.rental_quotes) from public,anon,authenticated;
create or replace function public.rental_checkout(p_action text,p_member uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 q private.rental_quotes; parent private.rental_quotes; cfg private.rental_checkout_settings; resource public.resources;
 reviewer uuid; account private.rental_refund_accounts; account_version integer; ws uuid[]; product_id uuid; start_at timestamptz; end_at timestamptz; paid_until timestamptz;
 period tstzrange; hold private.checkout_inventory_holds; refund bigint; booking uuid; entitlement uuid;
 starts date; ends date; next_month date; details jsonb; old_claim text:=current_setting('request.jwt.claim.sub',true);
begin
 if p_action is null or p_action not in ('availability','quote','status','list_own','staff_queue','prepare','manual_review',
 'approve_manual','renewal_quote','claim_order','bind_order','lookup_order','capture','refund','allocate_refund','handover','return','submit_deposit_reference','verify_bank_deposit','record_bank_deposit_refund','save_refund_account','get_refund_account','verify_refund_account') then
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
 return jsonb_build_object('quotes',coalesce((select jsonb_agg(to_jsonb(x)||private.rental_bank_state(x::private.rental_quotes)) from (
 select * from private.rental_quotes where p_action='staff_queue' or member_id=p_member
 order by created_at desc limit 50 offset least(greatest(coalesce((p_input->>'offset')::int,0),0),10000)) x),'[]'::jsonb));
 end if;
 if p_action='renewal_quote' then
 reviewer:=private.rental_staff(p_member,p_input);
 select * into parent from private.rental_quotes where id=(p_input->>'parentQuoteId')::uuid and member_id=p_member for update;
 starts:=(p_input->>'start')::date;
 if parent.id is null or parent.parent_quote_id is not null or parent.product<>'cabin101'
 or parent.booking_id is null or parent.policy_version<>cfg.policy_version or parent.refunded_amount=parent.payment_amount_paise
 or starts is null or starts<>(date_trunc('month',starts))::date or starts<=parent.starts_on
 or starts>parent.ends_on or starts<date_trunc('month',now() at time zone 'Asia/Kolkata')::date
 or not exists(select 1 from public.bookings b join public.resource_reservations r on r.booking_id=b.id where b.id=parent.booking_id and b.status='confirmed' and r.released_at is null) then
 raise exception using errcode='22023',message='Active cabin contract and future calendar rent period required'; end if;
 select * into q from private.rental_quotes where parent_quote_id=parent.id and starts_on=starts and superseded_at is null;
 if found then
 if q.payment_id is null and q.order_claimed_at is null and greatest(q.approved_at,q.deposit_verified_at)+interval '30 minutes'<=clock_timestamp() then
 update private.rental_quotes set superseded_at=clock_timestamp() where id=q.id;
 else return to_jsonb(q)||jsonb_build_object('status',case when q.superseded_at is not null then 'superseded' when q.refunded_amount=q.payment_amount_paise then 'refunded'
 when q.review_reason is not null then 'needs_review'
 when exists(select 1 from private.rental_operations o where o.quote_id=coalesce(q.parent_quote_id,q.id) and o.returned_at is not null) then 'returned'
 when exists(select 1 from public.bookings b where b.id=q.booking_id and b.status='cancelled') then 'cancelled'
 when q.booking_id is not null then 'confirmed'
 when q.order_id is not null then 'awaiting_payment' else 'approved' end); end if;
 end if;
 next_month:=(parent.starts_on+interval '1 month')::date;
 while exists(select 1 from private.rental_quotes child join public.paid_access_entitlements e on e.id=child.entitlement_id
 where child.parent_quote_id=parent.id and child.starts_on=next_month and child.payment_id is not null
 and child.refunded_amount<child.payment_amount_paise and e.revoked_at is null) loop
 next_month:=(next_month+interval '1 month')::date;
 end loop;
 if starts is distinct from next_month then
 raise exception using errcode='22023',message='Invoice only the next unpaid calendar month'; end if;
 insert into private.rental_quotes(member_id,parent_quote_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,
 policy_version,agreement_hash,particulars,prepared_by,prepared_at,reviewer_id,approved_at,document_id,evidence_sha256,evidence_path)
 values(p_member,parent.id,'cabin101',parent.party_type,parent.resource_id,'month',starts,(starts+interval '1 month')::date-1,4000000,0,
 parent.policy_version,'pending',parent.particulars,reviewer,clock_timestamp(),reviewer,clock_timestamp(),parent.document_id,parent.evidence_sha256,parent.evidence_path)
 returning * into q;
 update private.rental_quotes set deposit_method=parent.deposit_method,test_fixture=parent.test_fixture,rent_paise=case when parent.test_fixture then 5000 else rent_paise end where id=q.id returning * into q;
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
 q.deposit_method:=case when cfg.bank_deposits_enabled then 'bank_transfer' else 'razorpay' end;
 q.test_fixture:=coalesce((p_input->>'testFixture')::boolean,false);
 if q.test_fixture then
 if cfg.fixture_member is distinct from p_member or q.deposit_method<>'bank_transfer' then
 raise exception using errcode='42501',message='Staging fixture member required'; end if;
 q.rent_paise:=5000; q.deposit_paise:=10000;
 end if;
 q.starts_on:=starts; q.ends_on:=ends; q.policy_version:=cfg.policy_version;
 q.agreement_hash:=private.rental_quote_hash(q);
 insert into private.rental_quotes(id,member_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,
 policy_version,agreement_hash,workspace_booking_ids,deposit_method,test_fixture) values(q.id,p_member,q.product,q.party_type,q.resource_id,q.unit,
 starts,ends,q.rent_paise,q.deposit_paise,q.policy_version,q.agreement_hash,ws,q.deposit_method,q.test_fixture) returning * into q;
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
 if p_action='save_refund_account' then
 if p_member is distinct from q.member_id or q.deposit_method<>'bank_transfer' or q.superseded_at is not null
 or p_input->>'ownershipConfirmed' is distinct from 'true'
 or length(btrim(coalesce(p_input->>'accountName',''))) not between 2 and 160
 or length(btrim(coalesce(p_input->>'bankName',''))) not between 2 and 120
 or coalesce(p_input->>'accountNumber','') !~ '^[0-9]{6,24}$'
 or coalesce(p_input->>'ifsc','') !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
 raise exception using errcode='22023',message='Customer-owned refund bank account required'; end if;
 select coalesce(max(version),0)+1 into account_version from private.rental_refund_accounts where quote_id=q.id;
 insert into private.rental_refund_accounts(quote_id,version,account_name,bank_name,account_number,ifsc,submitted_by)
 values(q.id,account_version,btrim(p_input->>'accountName'),btrim(p_input->>'bankName'),p_input->>'accountNumber',p_input->>'ifsc',q.member_id);
 elsif p_action in ('get_refund_account','verify_refund_account') then
 reviewer:=private.rental_staff(q.member_id,p_input);
 select * into account from private.rental_refund_accounts where quote_id=q.id order by version desc limit 1;
 if account.quote_id is null then raise exception using errcode='22023',message='Refund account submission required'; end if;
 if p_action='get_refund_account' then
 return to_jsonb(q)||private.rental_bank_state(q)||jsonb_build_object('refund_account',jsonb_build_object('version',account.version,
 'accountName',account.account_name,'bankName',account.bank_name,'accountNumber',account.account_number,'last4',right(account.account_number,4),
 'ifsc',account.ifsc,'verifiedAt',account.verified_at,'ownershipConfirmed',true));
 end if;
 if (p_input->>'version')::integer is distinct from account.version or p_input->>'confirmed' is distinct from 'true'
 or length(btrim(coalesce(p_input->>'evidence',''))) not between 10 and 1000 then
 raise exception using errcode='22023',message='Current refund account review required'; end if;
 if account.verified_at is null then
 update private.rental_refund_accounts set verified_at=clock_timestamp(),verified_by=reviewer,verification_evidence=btrim(p_input->>'evidence')
 where quote_id=q.id and version=account.version;
 end if;
 elsif p_action='submit_deposit_reference' then
 if not exists(select 1 from private.rental_refund_accounts where quote_id=q.id)
 or q.deposit_method<>'bank_transfer' or q.deposit_paise<=0 or q.approved_at is null or q.deposit_verified_at is not null
 or q.superseded_at is not null or coalesce(p_input->>'reference','') !~ '^[A-Za-z0-9._/-]{6,80}$' then
 raise exception using errcode='22023',message='Approved bank deposit and transfer reference required'; end if;
 update private.rental_quotes set deposit_reference=upper(btrim(p_input->>'reference')) where id=q.id returning * into q;
 elsif p_action='verify_bank_deposit' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if q.deposit_method<>'bank_transfer' or q.deposit_paise<=0 or q.approved_at is null or q.superseded_at is not null
 or p_input->>'confirmed' is distinct from 'true' or coalesce(p_input->>'reference','') !~ '^[A-Za-z0-9._/-]{6,80}$'
 or length(btrim(coalesce(p_input->>'evidence',''))) not between 10 and 1000 then
 raise exception using errcode='22023',message='Bank credit verification evidence required'; end if;
 if q.deposit_verified_at is not null then
 if q.deposit_verified_reference is distinct from upper(btrim(p_input->>'reference')) then
 raise exception using errcode='22023',message='Verified bank deposit is immutable'; end if;
 else
 insert into private.rental_bank_transfers(quote_id,direction,reference,amount_paise,reviewer_id,evidence)
 values(q.id,'received',upper(btrim(p_input->>'reference')),q.deposit_paise,reviewer,btrim(p_input->>'evidence'));
 update private.rental_quotes set deposit_verified_at=clock_timestamp(),deposit_verified_by=reviewer,
 deposit_verified_reference=upper(btrim(p_input->>'reference')) where id=q.id returning * into q;
 end if;
 elsif p_action='record_bank_deposit_refund' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 select * into account from private.rental_refund_accounts where quote_id=q.id order by version desc limit 1;
 if account.verified_at is null or (p_input->>'refundAccountVersion')::integer is distinct from account.version then
 raise exception using errcode='22023',message='Current verified refund account required'; end if;
 if q.deposit_method<>'bank_transfer' or q.deposit_verified_at is null or p_input->>'confirmed' is distinct from 'true'
 or exists(select 1 from public.bookings where id=q.booking_id and status='confirmed')
 or coalesce((p_input->>'amountPaise')::bigint,0)<=0 or coalesce(p_input->>'reference','') !~ '^[A-Za-z0-9._/-]{6,80}$'
 or length(btrim(coalesce(p_input->>'evidence',''))) not between 10 and 1000 then
 raise exception using errcode='22023',message='Completed bank refund evidence required'; end if;
 if exists(select 1 from private.rental_bank_transfers where direction='refunded' and reference=upper(btrim(p_input->>'reference'))) then
 if not exists(select 1 from private.rental_bank_transfers where quote_id=q.id and direction='refunded' and reference=upper(btrim(p_input->>'reference')) and amount_paise=(p_input->>'amountPaise')::bigint and refund_account_version=account.version) then
 raise exception using errcode='22023',message='Bank refund reference already used'; end if;
 else
 if q.bank_deposit_refunded_paise+(p_input->>'amountPaise')::bigint>q.deposit_paise then
 raise exception using errcode='22023',message='Bank refund exceeds held deposit'; end if;
 insert into private.rental_bank_transfers(quote_id,direction,reference,amount_paise,reviewer_id,evidence,refund_account_version)
 values(q.id,'refunded',upper(btrim(p_input->>'reference')),(p_input->>'amountPaise')::bigint,reviewer,btrim(p_input->>'evidence'),account.version);
 update private.rental_quotes set bank_deposit_refunded_paise=bank_deposit_refunded_paise+(p_input->>'amountPaise')::bigint where id=q.id returning * into q;
 end if;
 elsif p_action='prepare' then
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
 if q.superseded_at is not null or q.approved_at is null or greatest(q.approved_at,q.deposit_verified_at)+interval '30 minutes'<=clock_timestamp() or q.policy_version<>cfg.policy_version
 or (q.deposit_method='bank_transfer' and q.deposit_paise>0 and (q.deposit_verified_at is null or q.bank_deposit_refunded_paise>0))
 or q.refunded_amount>0 or q.payment_id is not null then raise exception using errcode='22023',message='Fresh approved agreement required'; end if;
 if q.product='hiwonder' then ws:=private.rental_workspace_coverage(q.member_id,q.starts_on,q.ends_on,q.resource_id); end if;
 if q.parent_quote_id is null then
 perform public.hold_signed_booking_inventory(q.id,q.resource_id,q.member_id,start_at,end_at,greatest(q.approved_at,q.deposit_verified_at));
 elsif not exists(select 1 from private.rental_quotes p join public.bookings b on b.id=p.booking_id
 where p.id=q.parent_quote_id and b.status='confirmed' and exists(select 1 from public.resource_reservations where booking_id=b.id and released_at is null) and p.refunded_amount<p.payment_amount_paise and p.ends_on>=q.ends_on) then
 raise exception using errcode='22023',message='Parent cabin reservation unavailable'; end if;
 if q.order_claimed_at is not null then return to_jsonb(q)||jsonb_build_object('claimed',false); end if;
 update private.rental_quotes set order_claimed_at=clock_timestamp() where id=q.id returning * into q;
 return to_jsonb(q)||jsonb_build_object('claimed',true);
 elsif p_action='bind_order' then
 if q.order_claimed_at is null or coalesce(p_input->>'orderId','') !~ '^order_[A-Za-z0-9]+$'
 or (q.order_id is not null and q.order_id<>p_input->>'orderId') then raise exception using errcode='22023',message='Claimed matching order required'; end if;
 update private.rental_quotes set order_id=p_input->>'orderId' where id=q.id returning * into q;
 elsif p_action in ('capture','refund') then
 if q.order_id is null or q.order_id is distinct from p_input->>'orderId' or (p_input->>'amount')::bigint is distinct from q.payment_amount_paise
 or p_input->>'currency' is distinct from 'INR' or coalesce(p_input->>'paymentId','') !~ '^pay_[A-Za-z0-9]+$'
 or (q.payment_id is not null and q.payment_id<>p_input->>'paymentId') then
 raise exception using errcode='22023',message='Captured payment must match the rental order'; end if;
 refund:=coalesce((p_input->>'refundedAmount')::bigint,0);
 if refund<0 or refund>q.payment_amount_paise then raise exception using errcode='22023',message='Invalid refund amount'; end if;
 refund:=greatest(refund,q.refunded_amount);
 if q.payment_id is null and refund>0 and refund<q.payment_amount_paise then q.review_reason:='captured_with_partial_refund_requires_review'; end if;
 if q.deposit_method='bank_transfer' and q.deposit_paise>0 and (q.deposit_verified_at is null or q.bank_deposit_refunded_paise>0) then
 q.review_reason:='bank_deposit_not_verified';
 elsif q.payment_id is null and refund=0 and q.parent_quote_id is not null then
 select * into parent from private.rental_quotes where id=q.parent_quote_id for update;
 if greatest(q.approved_at,q.deposit_verified_at)+interval '30 minutes'<=clock_timestamp() or end_at<=clock_timestamp()
 or not private.has_verified_membership(q.member_id) or not exists(select 1 from public.bookings b join public.resource_reservations r on r.booking_id=b.id where b.id=parent.booking_id and b.status='confirmed' and r.released_at is null)
 or parent.refunded_amount=parent.payment_amount_paise then q.review_reason:='renewal_requires_review';
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
 if refund=q.payment_amount_paise then
 if q.parent_quote_id is null and q.booking_id is not null and start_at>clock_timestamp()
 and not exists(select 1 from private.rental_quotes child where child.parent_quote_id=q.id and child.payment_id is not null and child.refunded_amount<child.payment_amount_paise) then
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
 rent_refunded=case when refund=q.payment_amount_paise then rent_paise else rent_refunded end,
 deposit_refunded=case when refund=q.payment_amount_paise and deposit_method='razorpay' then deposit_paise else deposit_refunded end,
 refund_allocation_pending=refund>0 and refund<q.payment_amount_paise and refund>rent_refunded+deposit_refunded,
 workspace_booking_ids=coalesce(ws,workspace_booking_ids) where id=q.id returning * into q;
 elsif p_action='allocate_refund' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if (q.deposit_method='bank_transfer' and coalesce((p_input->>'depositPaise')::bigint,0)<>0)
 or q.payment_id is null or coalesce(p_input->>'refundId','') !~ '^rfnd_[A-Za-z0-9]+$'
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
 if (p_action='handover' and q.bank_deposit_refunded_paise>0) or q.booking_id is null or q.refunded_amount=q.payment_amount_paise or (p_action='handover' and q.refund_allocation_pending) or length(coalesce(p_input->>'evidence',''))<10 then
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
 return to_jsonb(q)||jsonb_build_object('status',case when q.superseded_at is not null then 'superseded' when q.refunded_amount=q.payment_amount_paise then 'refunded'
 when q.review_reason is not null then 'needs_review'
 when exists(select 1 from private.rental_operations o where o.quote_id=coalesce(q.parent_quote_id,q.id) and o.returned_at is not null) then 'returned'
 when exists(select 1 from public.bookings b where b.id=q.booking_id and b.status='cancelled') then 'cancelled'
 when q.booking_id is not null then 'confirmed'
 when q.order_id is not null then 'awaiting_payment'
 when q.approved_at is not null and q.deposit_method='bank_transfer' and q.deposit_paise>0 and (q.deposit_verified_at is null or q.bank_deposit_refunded_paise>0) then 'awaiting_deposit'
 when q.approved_at is not null then 'approved'
 when q.prepared_at is not null then 'awaiting_signatures' else 'awaiting_staff' end,
 'operations',(select to_jsonb(o) from private.rental_operations o where quote_id=q.id),'bookingId',q.booking_id,'membership',private.membership_level_at(q.member_id,clock_timestamp()))||private.rental_bank_state(q);
end $$;
