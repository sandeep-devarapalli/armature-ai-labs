-- Mock-only combined checkout. Existing standalone rental amounts remain unchanged.
create table public.equipment_workspace_quotes(
 quote_id uuid primary key references public.equipment_rental_quotes(id),
 resource_id uuid not null references public.resources(id),product_id uuid not null references public.booking_products(id),dates date[] not null,
 seats integer not null check(seats in (1,6)),unit_price_paise bigint not null, tax_bps integer not null,
 workspace_paise bigint not null check(workspace_paise>=0),workspace_tax_paise bigint not null check(workspace_tax_paise>=0),
 total_paise bigint not null check(total_paise>0),authorized_by uuid references auth.users(id),
 entitlement_ids uuid[] not null default '{}',captured_at timestamptz);
alter table public.equipment_workspace_quotes enable row level security;
revoke all on public.equipment_workspace_quotes from public,anon,authenticated;
grant select on public.equipment_workspace_quotes to authenticated;
grant all on public.equipment_workspace_quotes to service_role;
create policy bundle_read on public.equipment_workspace_quotes for select to authenticated using(exists(select 1 from public.equipment_rental_quotes q where q.id=quote_id));
create function private.reserve_workspace_for_operator(p_resource_id uuid,p_product_id uuid,p_dates date[],p_organization_id uuid,p_operator_id uuid) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare p public.booking_products; r public.resources; ds date[]; d date; ids uuid[]:='{}'; bid uuid; s timestamptz; e timestamptz;
begin
 if auth.uid() is null or p_operator_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_operator_id<>auth.uid() and (p_organization_id is null or not private.is_team_admin(p_organization_id)) then raise exception 'Team admin required for another operator' using errcode='42501'; end if;
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
  if not exists(select 1 from public.paid_access_entitlements x where x.product_id=p.id and x.resource_id=r.id and x.revoked_at is null and x.starts_at<=s and x.ends_at>=e and ((p_organization_id is null and x.user_id=p_operator_id) or x.organization_id=p_organization_id)) then raise exception 'Matching pass entitlement required' using errcode='42501'; end if;
  if p_operator_id=auth.uid() then
   bid:=public.create_booking_with_access(r.id,s,e,'{}',null,null,case when p_organization_id is null then 'personal' else 'team' end,p_organization_id);
  else
   bid:=public.team_create_booking(p_organization_id,p_operator_id,r.id,s,e,'{}',null,null);
  end if;
  ids:=array_append(ids,bid);
 end loop;
 delete from private.workspace_booking_requests where transaction_id=txid_current() and resource_id=r.id;
 if cardinality(ids)=0 then raise exception 'No open dates in selected pass' using errcode='22023'; end if;
 if p.unit in ('week','month') then
  insert into public.workspace_pass_allocations(resource_id,member_id,product_id,period,booking_ids) values(r.id,p_operator_id,p.id,daterange(ds[1],ds[cardinality(ds)]+1,'[)'),ids);
 end if;
 return ids;
end; $$;

create function public.create_equipment_workspace_quote(p_rate_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_workspace_resource_id uuid,p_workspace_product_id uuid,p_workspace_dates date[],p_dates date[] default null,p_parent_order_id uuid default null,p_operator_id uuid default null,p_organization_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare qid uuid; p public.booking_products; r public.resources; q public.equipment_rental_quotes; ds date[]; access_quote jsonb; amount bigint; tax bigint; seats integer;
begin
 perform private.require_rental_mock();
 select * into p from public.booking_products where booking_products.id=p_workspace_product_id and enabled and price_paise is not null and tax_bps is not null for share;
 select rr.* into r from public.resources rr join public.booking_inventory i on i.resource_id=rr.id join public.resource_booking_policies rp on rp.resource_id=rr.id where rr.id=p_workspace_resource_id and rp.kind=p.kind and rr.active and rr.reservable for share of rr;
 if p.id is null or r.id is null or p.kind not in ('workspace','cabin') or (p.kind='workspace' and (r.capacity<>1 or p_organization_id is not null)) or (p.kind='cabin' and (p.unit<>'month' or r.capacity<>6 or p_organization_id is null or not private.is_team_admin(p_organization_id))) then raise exception 'Choose a configured personal chair or whole team cabin with explicit tax' using errcode='22023'; end if;
 seats:=r.capacity; ds:=private.pass_dates(p.unit,p_workspace_dates);
 qid:=public.create_equipment_rental_quote(p_rate_id,p_starts_at,p_ends_at,p_dates,p_parent_order_id,p_operator_id,p_organization_id);
 select * into q from public.equipment_rental_quotes where equipment_rental_quotes.id=qid;
 if not q.dates<@ds then raise exception 'Workspace dates must cover every equipment date' using errcode='22023'; end if;
 if not exists(select 1 from public.equipment_rental_rates er join public.equipment_rental_units u on u.id=er.unit_id join public.resources eq on eq.id=u.resource_id where er.id=p_rate_id and eq.location_id=r.location_id) then raise exception 'Workspace and equipment must be at the same lab' using errcode='22023'; end if;
 access_quote:=public.quote_access_pass(p.id,p_workspace_dates,0,r.id,seats); amount:=(access_quote->>'total_paise')::bigint; tax:=round(amount::numeric*p.tax_bps/10000);
 insert into public.equipment_workspace_quotes(quote_id,resource_id,product_id,dates,seats,unit_price_paise,tax_bps,workspace_paise,workspace_tax_paise,total_paise)
 values(qid,r.id,p.id,ds,seats,p.price_paise,p.tax_bps,amount,tax,q.total_paise+amount+tax); return qid;
end; $$;
create function public.authorize_mock_equipment_bundle(p_quote_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.equipment_workspace_quotes;
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin(); perform private.require_rental_mock();
 perform 1 from public.equipment_rental_quotes where id=p_quote_id for update;
 select * into b from public.equipment_workspace_quotes where quote_id=p_quote_id for update;
 if b.quote_id is null or b.authorized_by is not null then raise exception 'Unpaid combined quote required' using errcode='22023'; end if;
 perform public.authorize_mock_equipment_payment(p_quote_id);
 update public.equipment_workspace_quotes set authorized_by=auth.uid() where quote_id=p_quote_id;
 perform private.record_audit(auth.uid(),'staff','equipment_bundle.mock_authorized','rental_quote',p_quote_id,null,jsonb_build_object('total_paise',b.total_paise,'provider','local_mock'));
end; $$;
create function public.reserve_equipment_workspace_bundle(p_quote_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.equipment_rental_quotes; b public.equipment_workspace_quotes; p public.booking_products; ds date; i integer:=0; ids uuid[]:='{}'; eid uuid; ws uuid[]; oid uuid; total bigint;
begin
 perform private.require_rental_mock();
 perform 1 from public.organization_memberships where organization_id=(select organization_id from public.equipment_rental_quotes where id=p_quote_id and user_id=auth.uid()) for update;
 select * into q from public.equipment_rental_quotes where id=p_quote_id and user_id=auth.uid() for update;
 if q.id is null then raise exception 'Own combined quote required' using errcode='42501'; end if;
 select * into b from public.equipment_workspace_quotes where quote_id=q.id for update;
 if b.quote_id is null then raise exception 'Combined quote required' using errcode='22023'; end if;
 if b.captured_at is not null then select id into oid from public.equipment_rental_orders where quote_id=q.id; return oid; end if;
 if b.authorized_by is null or q.payment_state<>'authorized' or q.expires_at<=now() then raise exception 'Current combined mock authorization required' using errcode='42501'; end if;
 select * into p from public.booking_products where id=b.product_id for share;
 if not p.enabled or p.price_paise is distinct from b.unit_price_paise or p.tax_bps is distinct from b.tax_bps then raise exception 'Workspace price changed; request a new quote' using errcode='22023'; end if;
 if private.has_approved_basic_membership(auth.uid()) is not true or (q.organization_id is not null and not private.is_team_admin(q.organization_id)) then raise exception 'Payer eligibility changed' using errcode='42501'; end if;
 total:=b.workspace_paise+b.workspace_tax_paise;
 foreach ds in array b.dates loop
  i:=i+1;
  insert into public.paid_access_entitlements(user_id,organization_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,granted_by)
  values(case when q.organization_id is null then q.operator_id end,q.organization_id,b.product_id,b.resource_id,(ds+time '09:00') at time zone 'Asia/Kolkata',(ds+time '17:00') at time zone 'Asia/Kolkata',b.seats,total/cardinality(b.dates)+case when i<=mod(total,cardinality(b.dates)) then 1 else 0 end,b.authorized_by) returning id into eid;
  ids:=array_append(ids,eid);
 end loop;
 ws:=private.reserve_workspace_for_operator(b.resource_id,b.product_id,case when p.unit in ('week','month') then array[b.dates[1]] else b.dates end,q.organization_id,q.operator_id);
 update public.equipment_workspace_quotes set entitlement_ids=ids where quote_id=q.id;
 oid:=public.reserve_equipment_rental(q.id,ws,null,null,null,q.organization_id);
 update public.equipment_workspace_quotes set captured_at=now() where quote_id=q.id;
 perform private.record_audit(auth.uid(),'member','equipment_bundle.mock_captured','rental_order',oid,null,jsonb_build_object('quote_id',q.id,'total_paise',b.total_paise,'workspace_paise',total,'provider','local_mock'));
 return oid;
end; $$;
create function private.guard_equipment_bundle_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.payment_state='captured' and old.payment_state<>'captured' and exists(select 1 from public.equipment_workspace_quotes where quote_id=new.id and (authorized_by is null or cardinality(entitlement_ids)=0)) then raise exception 'Use the combined checkout transaction' using errcode='42501'; end if;
 return new;
end; $$;
create trigger guard_equipment_bundle_capture before update on public.equipment_rental_quotes for each row execute function private.guard_equipment_bundle_capture();
revoke all on function private.reserve_workspace_for_operator(uuid,uuid,date[],uuid,uuid),private.guard_equipment_bundle_capture() from public,anon,authenticated;
revoke all on function public.create_equipment_workspace_quote(uuid,timestamptz,timestamptz,uuid,uuid,date[],date[],uuid,uuid,uuid),public.authorize_mock_equipment_bundle(uuid),public.reserve_equipment_workspace_bundle(uuid) from public,anon;
grant execute on function public.create_equipment_workspace_quote(uuid,timestamptz,timestamptz,uuid,uuid,date[],date[],uuid,uuid,uuid),public.authorize_mock_equipment_bundle(uuid),public.reserve_equipment_workspace_bundle(uuid) to authenticated;
