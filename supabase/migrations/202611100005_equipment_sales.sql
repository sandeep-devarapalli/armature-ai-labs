-- In-lab equipment sales. Default closed.
-- Owner terms 2026-11-09: the buyer checks the item in the lab, staff mark the check done, which opens Razorpay
-- payment for that buyer only; the buyer collects from the lab. No contract. Full refund until collection, none after. No GST.
-- Checked units are kept out of rentals with an open-ended inventory hold per sale line; capture retires them.
create table private.equipment_sale_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 release_ready boolean not null default false
);
insert into private.equipment_sale_settings default values;

create table private.equipment_sales (
 id uuid primary key default extensions.gen_random_uuid(), member_id uuid not null references auth.users(id),
 amount_paise bigint not null check(amount_paise>0), created_at timestamptz not null default now(),
 checked_by uuid references auth.users(id), checked_at timestamptz, payment_window_at timestamptz,
 order_claimed_at timestamptz, order_id text unique, payment_id text unique, captured_at timestamptz,
 refunded_amount bigint not null default 0 check(refunded_amount between 0 and amount_paise),
 refund_approved_by uuid references auth.users(id), refund_approved_at timestamptz,
 collected_by uuid references auth.users(id), collected_at timestamptz,
 declined_by uuid references auth.users(id), declined_at timestamptz, decline_reason text check(length(decline_reason) between 10 and 1000),
 cancelled_at timestamptz, cancellation_reason text check(length(cancellation_reason) between 10 and 1000),
 review_reason text
);
create index equipment_sales_member on private.equipment_sales(member_id,created_at desc);

-- A line's id doubles as its inventory hold id.
create table private.equipment_sale_lines (
 id uuid primary key default extensions.gen_random_uuid(), sale_id uuid not null references private.equipment_sales(id),
 code text not null references private.rental_catalogue(code), price_paise bigint not null check(price_paise>0),
 resource_id uuid references public.resources(id), unit_sort_order integer, retired_at timestamptz,
 unique(sale_id,code)
);
alter table private.equipment_sale_settings enable row level security;
alter table private.equipment_sales enable row level security;
alter table private.equipment_sale_lines enable row level security;
revoke all on private.equipment_sale_settings,private.equipment_sales,private.equipment_sale_lines from public,anon,authenticated;
grant all on private.equipment_sale_settings,private.equipment_sales,private.equipment_sale_lines to service_role;

create function private.equipment_sale_status(s private.equipment_sales) returns text language sql stable security definer set search_path='' as $$
 select case when s.declined_at is not null then 'declined'
  when s.cancelled_at is not null then 'cancelled'
  when s.payment_id is not null and s.refunded_amount=s.amount_paise then 'refunded'
  when s.review_reason is not null then 'needs_review'
  when s.refund_approved_at is not null then 'refund_pending'
  when s.collected_at is not null then 'collected'
  when s.captured_at is not null then 'paid'
  when s.order_id is not null then 'awaiting_payment'
  when s.checked_at is not null then case when s.payment_window_at+interval '30 minutes'>clock_timestamp() then 'ready_to_pay' else 'payment_expired' end
  else 'awaiting_check' end;
$$;

create function private.equipment_sale_json(s private.equipment_sales) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('status',private.equipment_sale_status(s),
  'paymentExpiresAt',s.payment_window_at+interval '30 minutes',
  'lines',coalesce((select jsonb_agg(jsonb_build_object('code',l.code,'name',c.name,'maker',c.maker,'pricePaise',l.price_paise) order by c.sort_order,l.code)
   from private.equipment_sale_lines l join private.rental_catalogue c on c.code=l.code where l.sale_id=s.id),'[]'::jsonb));
$$;

-- Units go back to the rental pool: holds end and retired units are relinked.
create function private.equipment_sale_restore(p_sale uuid) returns void language plpgsql security definer set search_path='' as $$
declare l private.equipment_sale_lines;
begin
 for l in select * from private.equipment_sale_lines where sale_id=p_sale and resource_id is not null for update loop
  if l.retired_at is not null then
   insert into private.rental_catalogue_resources(code,resource_id,sort_order) values(l.code,l.resource_id,coalesce(l.unit_sort_order,100));
   update public.asset_units set status='available' where id in(select asset_unit_id from public.equipment_rental_units where resource_id=l.resource_id) and status='retired';
   update private.equipment_sale_lines set retired_at=null where id=l.id;
  end if;
  perform public.release_signed_booking_inventory(l.id);
 end loop;
end $$;

create function public.equipment_sale(p_action text,p_member uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s private.equipment_sales; cfg private.equipment_sale_settings; l private.equipment_sale_lines; reviewer uuid;
 codes text[]; total bigint; unit uuid; unit_order integer; refund bigint; ok boolean;
begin
 if p_action is null or p_action not in ('request','status','list_own','cancel','staff_queue','mark_checked','reopen_payment','decline',
 'mark_collected','approve_refund','claim_order','bind_order','lookup_order','capture','refund') then
 raise exception using errcode='22023',message='Unknown equipment sale action'; end if;
 select * into strict cfg from private.equipment_sale_settings where singleton for share;
 if p_action in ('request','mark_checked','reopen_payment','claim_order') then
 if not cfg.enabled or not cfg.release_ready or not private.has_verified_membership(coalesce(p_member,(select member_id from private.equipment_sales where id=(p_input->>'saleId')::uuid)))
 or exists(select 1 from public.booking_policy_settings where mock_grants_enabled) then
 raise exception using errcode='42501',message='Equipment sales unavailable'; end if;
 end if;

 if p_action in ('list_own','staff_queue') then
 if p_action='staff_queue' then reviewer:=private.rental_staff(null,p_input); end if;
 return jsonb_build_object('sales',coalesce((select jsonb_agg(private.equipment_sale_json(x) order by x.created_at desc) from (
 select * from private.equipment_sales where p_action='staff_queue' or member_id=p_member
 order by created_at desc limit 50 offset least(greatest(coalesce((p_input->>'offset')::int,0),0),10000)) x),'[]'::jsonb));
 end if;

 if p_action='request' then
 select array_agg(distinct v) into codes from jsonb_array_elements_text(case when jsonb_typeof(p_input->'items')='array' then p_input->'items' else '[]' end) v;
 if coalesce(cardinality(codes),0) not between 1 and 2 or jsonb_array_length(p_input->'items')<>cardinality(codes)
 or exists(select 1 from unnest(codes) c where not exists(select 1 from private.rental_catalogue r
   where r.code=c and r.kind='equipment' and r.released and r.sale_paise is not null)) then
 raise exception using errcode='22023',message='Choose one or two items that are for sale'; end if;
 if exists(select 1 from unnest(codes) c where private.rental_free_units(c)=0) then
 raise exception using errcode='23P01',message='Item is out of stock'; end if;
 if exists(select 1 from private.equipment_sales x join private.equipment_sale_lines y on y.sale_id=x.id
   where x.member_id=p_member and y.code=any(codes) and private.equipment_sale_status(x) in ('awaiting_check','ready_to_pay','payment_expired','awaiting_payment')) then
 raise exception using errcode='23505',message='You already have an open request for this item'; end if;
 select sum(sale_paise) into total from private.rental_catalogue where code=any(codes);
 insert into private.equipment_sales(member_id,amount_paise) values(p_member,total) returning * into s;
 insert into private.equipment_sale_lines(sale_id,code,price_paise) select s.id,code,sale_paise from private.rental_catalogue where code=any(codes);
 return private.equipment_sale_json(s);
 end if;

 if p_action='lookup_order' then
 select * into s from private.equipment_sales where order_id=p_input->>'orderId' for update;
 if not found then return jsonb_build_object('status','ignored'); end if;
 else select * into s from private.equipment_sales where id=(p_input->>'saleId')::uuid for update; end if;
 if not found or (p_member is not null and s.member_id<>p_member) then
 raise exception using errcode='42501',message='Equipment sale unavailable'; end if;

 if p_action='mark_checked' then
 reviewer:=private.rental_staff(s.member_id,p_input);
 if s.checked_at is not null or s.declined_at is not null or s.cancelled_at is not null or p_input->>'itemChecked' is distinct from 'true' then
 raise exception using errcode='22023',message='Only an open request can be marked checked, after the buyer has seen the item'; end if;
 for l in select * from private.equipment_sale_lines where sale_id=s.id order by code for update loop
  unit:=null;
  for unit,unit_order in select r.resource_id,r.sort_order from private.rental_catalogue_resources r where r.code=l.code order by r.sort_order,r.resource_id loop
   perform pg_advisory_xact_lock(hashtextextended(unit::text,14));
   if exists(select 1 from public.equipment_rental_units u join public.asset_units a on a.id=u.asset_unit_id
     where u.resource_id=unit and u.commissioned and a.status='available')
   and private.rental_range_available(unit,tstzrange(clock_timestamp(),null)) then exit; end if;
   unit:=null;
  end loop;
  if unit is null then raise exception using errcode='23P01',message='Item is out of stock'; end if;
  insert into private.checkout_inventory_holds(quote_id,resource_id,member_id,period,expires_at)
  values(l.id,unit,s.member_id,tstzrange(clock_timestamp(),null),'infinity');
  update private.equipment_sale_lines set resource_id=unit,unit_sort_order=unit_order where id=l.id;
 end loop;
 update private.equipment_sales set checked_by=reviewer,checked_at=clock_timestamp(),payment_window_at=clock_timestamp() where id=s.id returning * into s;
 elsif p_action='reopen_payment' then
 reviewer:=private.rental_staff(s.member_id,p_input);
 if s.checked_at is null or s.order_claimed_at is not null or s.declined_at is not null or s.cancelled_at is not null
 or s.payment_window_at+interval '30 minutes'>clock_timestamp() then
 raise exception using errcode='22023',message='Only an expired, unordered payment window can reopen'; end if;
 update private.equipment_sales set payment_window_at=clock_timestamp() where id=s.id returning * into s;
 elsif p_action in ('decline','cancel') then
 if p_action='decline' then reviewer:=private.rental_staff(s.member_id,p_input);
 elsif p_input->>'confirmed' is distinct from 'true' then raise exception using errcode='22023',message='Confirm the cancellation'; end if;
 if s.order_claimed_at is not null or s.declined_at is not null or s.cancelled_at is not null
 or length(btrim(coalesce(p_input->>'reason',''))) not between 10 and 1000 then
 raise exception using errcode='22023',message='Only an unpaid open request can be closed with a reason'; end if;
 perform private.equipment_sale_restore(s.id);
 if p_action='decline' then
 update private.equipment_sales set declined_by=reviewer,declined_at=clock_timestamp(),decline_reason=btrim(p_input->>'reason') where id=s.id returning * into s;
 else
 update private.equipment_sales set cancelled_at=clock_timestamp(),cancellation_reason=btrim(p_input->>'reason') where id=s.id returning * into s;
 end if;
 elsif p_action='mark_collected' then
 reviewer:=private.rental_staff(s.member_id,p_input);
 if s.captured_at is null or s.collected_at is not null or s.refund_approved_at is not null or s.refunded_amount>0 or s.review_reason is not null then
 raise exception using errcode='22023',message='Only a paid sale can be marked collected'; end if;
 update private.equipment_sales set collected_by=reviewer,collected_at=clock_timestamp() where id=s.id returning * into s;
 elsif p_action='approve_refund' then
 -- Full refund until collection, none after. Staff then issue the refund in Razorpay; its webhook records it.
 reviewer:=private.rental_staff(s.member_id,p_input);
 if s.captured_at is null or s.collected_at is not null or s.refund_approved_at is not null
 or length(btrim(coalesce(p_input->>'reason',''))) not between 10 and 1000 then
 raise exception using errcode='22023',message='Only a paid sale that has not been collected can be refunded'; end if;
 perform private.equipment_sale_restore(s.id);
 update private.equipment_sales set refund_approved_by=reviewer,refund_approved_at=clock_timestamp(),
 cancellation_reason=btrim(p_input->>'reason') where id=s.id returning * into s;
 elsif p_action='claim_order' then
 if s.checked_at is null or s.payment_window_at+interval '30 minutes'<=clock_timestamp()
 or s.declined_at is not null or s.cancelled_at is not null or s.payment_id is not null then
 raise exception using errcode='22023',message='Fresh in-lab check required'; end if;
 if s.order_claimed_at is not null then return private.equipment_sale_json(s)||jsonb_build_object('claimed',false); end if;
 update private.equipment_sales set order_claimed_at=clock_timestamp() where id=s.id returning * into s;
 return private.equipment_sale_json(s)||jsonb_build_object('claimed',true);
 elsif p_action='bind_order' then
 if s.order_claimed_at is null or coalesce(p_input->>'orderId','') !~ '^order_[A-Za-z0-9]+$'
 or (s.order_id is not null and s.order_id<>p_input->>'orderId') then raise exception using errcode='22023',message='Claimed matching order required'; end if;
 update private.equipment_sales set order_id=p_input->>'orderId' where id=s.id returning * into s;
 elsif p_action in ('capture','refund') then
 if s.order_id is null or s.order_id is distinct from p_input->>'orderId' or (p_input->>'amount')::bigint is distinct from s.amount_paise
 or p_input->>'currency' is distinct from 'INR' or coalesce(p_input->>'paymentId','') !~ '^pay_[A-Za-z0-9]+$'
 or (s.payment_id is not null and s.payment_id<>p_input->>'paymentId') then
 raise exception using errcode='22023',message='Captured payment must match the sale order'; end if;
 refund:=coalesce((p_input->>'refundedAmount')::bigint,0);
 if refund<0 or refund>s.amount_paise then raise exception using errcode='22023',message='Invalid refund amount'; end if;
 refund:=greatest(refund,s.refunded_amount);
 if s.payment_id is null and refund=0 then
 -- Every checked unit must still be held for this sale; then it leaves the rental pool for good.
 ok:=s.cancelled_at is null and s.declined_at is null and not exists(select 1 from private.equipment_sale_lines y
  left join private.checkout_inventory_holds h on h.quote_id=y.id and h.resource_id=y.resource_id and h.released_at is null
  where y.sale_id=s.id and h.quote_id is null);
 if not ok then s.review_reason:='hold_unavailable';
 else
 for l in select * from private.equipment_sale_lines where sale_id=s.id for update loop
  delete from private.rental_catalogue_resources where resource_id=l.resource_id;
  update public.asset_units set status='retired' where id in(select asset_unit_id from public.equipment_rental_units where resource_id=l.resource_id);
  update private.equipment_sale_lines set retired_at=clock_timestamp() where id=l.id;
  perform public.release_signed_booking_inventory(l.id);
 end loop;
 end if;
 elsif s.payment_id is null and refund>0 and refund<s.amount_paise then s.review_reason:='captured_with_partial_refund_requires_review';
 end if;
 if refund>s.refunded_amount and s.refund_approved_at is null and s.review_reason is null then
 s.review_reason:='refund_without_approval_requires_review'; end if;
 if refund>0 and refund<s.amount_paise and s.review_reason is null then s.review_reason:='partial_refund_requires_review'; end if;
 update private.equipment_sales set payment_id=p_input->>'paymentId',captured_at=coalesce(captured_at,clock_timestamp()),
 refunded_amount=refund,review_reason=s.review_reason where id=s.id returning * into s;
 end if;
 return private.equipment_sale_json(s);
end $$;
revoke all on function private.equipment_sale_status(private.equipment_sales),private.equipment_sale_json(private.equipment_sales),
 private.equipment_sale_restore(uuid) from public,anon,authenticated;
revoke all on function public.equipment_sale(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.equipment_sale(text,uuid,jsonb) to service_role;

-- Sales are invoiced like other captured payments (prefix S, no GST); refunds wait for staff.
alter table private.billing_operations drop constraint billing_operations_source_check;
alter table private.billing_operations add constraint billing_operations_source_check check(source in ('desk_quote','rental_quote','event_quote','equipment_sale'));
create or replace function private.billing_enqueue(p_source text,p_source_id uuid,p_member uuid,p_starts date,p_ends date,
 p_item text,p_amount_paise bigint,p_payment_id text,p_captured_at timestamptz,p_party_name text,p_customer_state text,p_fixture boolean)
returns void language plpgsql security definer set search_path='' as $$
declare inv private.billing_operations; name text; email text; invoice_date date:=(p_captured_at at time zone 'Asia/Kolkata')::date;
 number text:='ARM-'||case p_source when 'desk_quote' then 'D' when 'event_quote' then 'E' when 'equipment_sale' then 'S' else 'R' end||'-'||to_char(p_starts,'YYYYMM')||'-'||upper(left(replace(p_source_id::text,'-',''),10));
 doc jsonb; gst boolean;
begin
 if p_amount_paise<=0 then return; end if;
 select nullif(btrim(coalesce(p_party_name,p.display_name)),''),u.email into name,email
  from auth.users u left join public.profiles p on p.id=u.id where u.id=p_member;
 select s.gst_enabled and invoice_date>=s.gst_effective_from into gst from private.billing_settings s;
 doc:=private.billing_document(number,invoice_date,coalesce(name,'Unnamed customer'),email,
  p_item||case when p_source='equipment_sale' then '' else ' ('||to_char(p_starts,'DD Mon YYYY')||' to '||to_char(p_ends,'DD Mon YYYY')||')' end,p_amount_paise,p_customer_state);
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

create function private.billing_sale_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare day date;
begin
 if old.captured_at is null and new.captured_at is not null and new.payment_id is not null then
  day:=(new.captured_at at time zone 'Asia/Kolkata')::date;
  perform private.billing_enqueue('equipment_sale',new.id,new.member_id,day,day,
   (select string_agg(concat_ws(' ',c.maker,c.name),', ' order by c.sort_order,c.code) from private.equipment_sale_lines l
    join private.rental_catalogue c on c.code=l.code where l.sale_id=new.id),new.amount_paise,new.payment_id,new.captured_at,null,null,false);
 end if;
 if new.refunded_amount>coalesce(old.refunded_amount,0) then
  perform private.billing_refund_review('equipment_sale',new.id,new.refunded_amount,false);
 end if;
 return null;
end $$;
revoke all on function private.billing_sale_capture() from public,anon,authenticated;
create trigger billing_sale_capture after update of captured_at,refunded_amount on private.equipment_sales
 for each row execute function private.billing_sale_capture();
