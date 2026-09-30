-- Offers never issue access or enable payment collection.
create table public.discount_offers (
 id uuid primary key default extensions.gen_random_uuid(), revision integer not null default 1,
 name text not null check(length(trim(name)) between 2 and 120), description text not null default '' check(length(description)<=1000),
 audience text not null check(audience in ('public','personal','code','student')), member_id uuid references auth.users(id), code text unique,
 value_kind text not null check(value_kind in ('percent','fixed')), value bigint not null check(value>0),
 categories text[] not null check(cardinality(categories)>0 and categories <@ array['coworking','cabin','equipment']::text[] and array_position(categories,null) is null),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), state text not null default 'active' check(state in ('active','paused','expired')),
 personal_use text not null default 'once' check(personal_use in ('once','repeat_until_expiry')), total_limit integer check(total_limit>0), per_member_limit integer check(per_member_limit>0), stack_with_launch boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(value_kind<>'percent' or value<=100), check((audience in ('personal','student'))=(member_id is not null)),
 check((audience='code')=(code is not null)), check(code is null or code ~ '^[A-Z0-9_-]{3,40}$'),
 check(audience<>'student' or (value_kind='percent' and value<=20 and categories=array['coworking']::text[] and stack_with_launch))
);
create index discount_offer_member on public.discount_offers(member_id) where member_id is not null;
create table public.discount_offer_audit (
 id bigint generated always as identity primary key, actor_id uuid not null references auth.users(id), offer_id uuid not null references public.discount_offers(id), before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now()
);
create index discount_audit_offer on public.discount_offer_audit(offer_id,id);
create table private.discount_quotes (
 id uuid primary key default extensions.gen_random_uuid(), member_id uuid not null references auth.users(id), category text not null, base_paise bigint not null, payable_paise bigint not null,
 offer_id uuid references public.discount_offers(id), offer_revision integer, breakdown jsonb not null, expires_at timestamptz not null default now()+interval '15 minutes', created_at timestamptz not null default now()
);
create table private.discount_redemptions (
 id uuid primary key default extensions.gen_random_uuid(), quote_id uuid not null unique references private.discount_quotes(id), offer_id uuid references public.discount_offers(id), member_id uuid not null references auth.users(id),
 idempotency_key text not null unique check(length(idempotency_key) between 8 and 200), state text not null default 'reserved' check(state in ('reserved','captured','released')), expires_at timestamptz not null,
 created_at timestamptz not null default now(), captured_at timestamptz
);
create index discount_redemption_limits on private.discount_redemptions(offer_id,member_id,state,expires_at);
alter table public.discount_offers enable row level security;
alter table public.discount_offer_audit enable row level security;
revoke all on public.discount_offers,public.discount_offer_audit,private.discount_quotes,private.discount_redemptions from public,anon,authenticated;
create or replace function public.admin_discount_offers() returns setof public.discount_offers language plpgsql stable security definer set search_path='' as $$
begin perform private.require_paid_admin(); return query select * from public.discount_offers order by created_at desc; end $$;
create or replace function public.discount_offer_history(p_id uuid) returns setof public.discount_offer_audit language plpgsql stable security definer set search_path='' as $$
begin perform private.require_paid_admin(); return query select * from public.discount_offer_audit where offer_id=p_id order by id desc; end $$;
create or replace function public.save_discount_offer(p_offer jsonb,p_id uuid default null,p_expected_revision integer default null) returns public.discount_offers language plpgsql security definer set search_path='' as $$
declare old public.discount_offers; n public.discount_offers;
begin
 perform private.require_paid_admin();
 if p_id is not null then
  select * into old from public.discount_offers where id=p_id for update;
  if old.id is null or old.revision is distinct from p_expected_revision then raise exception 'Offer changed; refresh before saving' using errcode='40001'; end if;
 end if;
 n:=jsonb_populate_record(null::public.discount_offers,p_offer);
 n.id:=coalesce(p_id,extensions.gen_random_uuid()); n.revision:=coalesce(old.revision,0)+1;
 n.name:=trim(n.name); n.description:=coalesce(n.description,''); n.code:=nullif(upper(trim(n.code)),'');
 n.state:=coalesce(n.state,'active'); n.personal_use:=coalesce(n.personal_use,'once'); n.stack_with_launch:=coalesce(n.stack_with_launch,false);
 n.created_at:=coalesce(old.created_at,now()); n.updated_at:=now();
 if n.member_id is not null and not exists(select 1 from public.profiles where id=n.member_id) then raise exception 'Select a registered member' using errcode='22023'; end if;
 insert into public.discount_offers select n.* on conflict(id) do update set revision=excluded.revision,name=excluded.name,description=excluded.description,audience=excluded.audience,member_id=excluded.member_id,code=excluded.code,value_kind=excluded.value_kind,value=excluded.value,categories=excluded.categories,starts_at=excluded.starts_at,ends_at=excluded.ends_at,state=excluded.state,personal_use=excluded.personal_use,total_limit=excluded.total_limit,per_member_limit=excluded.per_member_limit,stack_with_launch=excluded.stack_with_launch,updated_at=excluded.updated_at;
 insert into public.discount_offer_audit(actor_id,offer_id,before_data,after_data) values(auth.uid(),n.id,case when old.id is not null then to_jsonb(old) end,to_jsonb(n)); return n;
end $$;
create or replace function private.discount_available(p public.discount_offers,p_member uuid) returns boolean language sql stable set search_path='' as $$
 select (p.total_limit is null or count(*)<p.total_limit) and (case when p.audience in ('personal','student') and p.personal_use='once' then count(*) filter(where member_id=p_member)<1 else p.per_member_limit is null or count(*) filter(where member_id=p_member)<p.per_member_limit end)
 from private.discount_redemptions where offer_id=p.id and (state='captured' or (state='reserved' and expires_at>clock_timestamp()))
$$;
create or replace function public.public_discount_offers() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'value_kind',value_kind,'value',value,'categories',categories,'starts_at',starts_at,'ends_at',ends_at,'stack_with_launch',stack_with_launch) order by ends_at),'[]'::jsonb) from public.discount_offers where audience='public' and state='active' and starts_at<=now() and ends_at>now() and private.discount_available(discount_offers,auth.uid())
$$;
create or replace function public.my_discount_offers() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'audience',audience,'value_kind',value_kind,'value',value,'categories',categories,'starts_at',starts_at,'ends_at',ends_at,'personal_use',personal_use,'stack_with_launch',stack_with_launch) order by ends_at),'[]'::jsonb) from public.discount_offers where member_id=auth.uid() and state='active' and ends_at>now() and private.discount_available(discount_offers,auth.uid())
$$;
create or replace function private.make_discount_quote(p_member uuid,p_category text,p_base bigint,p_launch bigint default 0,p_code text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.discount_offers; selected public.discount_offers; amount bigint; best bigint:=p_base-p_launch; total bigint; q uuid; breakdown jsonb;
begin
 if p_base is null or p_base<0 or p_launch<0 or p_launch>p_base then raise exception 'Configured price required' using errcode='22023'; end if;
 for o in select * from public.discount_offers where state='active' and starts_at<=now() and ends_at>now() and p_category=any(categories) and (audience='public' or member_id=p_member or (audience='code' and code=upper(trim(p_code)))) order by created_at,id loop
  if not private.discount_available(o,p_member) then continue; end if;
  amount:=case when o.stack_with_launch then p_base-p_launch else p_base end;
  total:=greatest(0,amount-case when o.value_kind='percent' then round(amount::numeric*o.value/100)::bigint else o.value end);
  if total<best then best:=total; selected:=o; end if;
 end loop;
 breakdown:=jsonb_build_object('base_paise',p_base,'launch_discount_paise',case when selected.id is null or selected.stack_with_launch then p_launch else 0 end,'offer_discount_paise',case when selected.id is null then 0 else p_base-best-case when selected.stack_with_launch then p_launch else 0 end end,'offer_id',selected.id,'offer_name',selected.name,'payable_paise',best,'tax_included',false,'tax_status','not_configured_pre_tax_only');
 insert into private.discount_quotes(member_id,category,base_paise,payable_paise,offer_id,offer_revision,breakdown) values(p_member,p_category,p_base,best,selected.id,selected.revision,breakdown) returning id into q;
 return breakdown||jsonb_build_object('discount_quote_id',q,'expires_at',now()+interval '15 minutes','payment_enabled',false);
end $$;
create or replace function private.quote_discounted_access_for(p_member_id uuid,p_product_id uuid,p_dates date[],p_resource_id uuid default null,p_seats integer default 1,p_code text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; d jsonb; p public.booking_products; base bigint; launch bigint:=0;
begin
 if not private.has_approved_basic_membership(p_member_id) then raise exception 'Approved basic membership required' using errcode='42501'; end if;
 q:=public.quote_access_pass(p_product_id,p_dates,0,p_resource_id,p_seats); select * into p from public.booking_products where id=p_product_id;
 if p.kind not in ('workspace','cabin') then raise exception 'Select coworking or cabin access' using errcode='22023'; end if;
 if (q->>'starts_on')::date<='2026-12-31' and (q->>'ends_on')::date>'2026-12-31' then raise exception 'Pass crossing launch expiry requires pricing review' using errcode='22023'; end if;
 base:=(q->>'total_paise')::bigint;
 -- Avoid double-discounting launch prices: only the approved standard baseline qualifies.
 if (q->>'starts_on')::date>='2026-11-17' and now()<'2027-01-01 00:00:00+05:30'::timestamptz and (q->>'ends_on')::date<='2026-12-31' and ((p.code='workspace-day' and p.price_paise=50000) or (p.code='workspace-week' and p.price_paise=250000) or (p.code='workspace-month' and p.price_paise=1000000) or (p.code='cabin-month' and p.price_paise=1250000)) then launch:=round(base::numeric*30/100); end if;
 d:=private.make_discount_quote(p_member_id,case when p.kind='workspace' then 'coworking' else 'cabin' end,base,launch,p_code);
 update private.discount_quotes set breakdown=breakdown||jsonb_build_object('access_quote',q,'resource_id',p_resource_id,'tax_status','not_configured_pre_tax_only') where id=(d->>'discount_quote_id')::uuid;
 return q||d;
end $$;
create or replace function public.quote_discounted_access(p_product_id uuid,p_dates date[],p_resource_id uuid default null,p_seats integer default 1,p_code text default null) returns jsonb language sql security definer set search_path='' as $$
 select private.quote_discounted_access_for(auth.uid(),p_product_id,p_dates,p_resource_id,p_seats,p_code)
$$;
create or replace function public.admin_preview_discount_access(p_member_id uuid,p_product_id uuid,p_dates date[],p_resource_id uuid default null,p_seats integer default 1,p_code text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_paid_admin(); return private.quote_discounted_access_for(p_member_id,p_product_id,p_dates,p_resource_id,p_seats,p_code); end $$;
create or replace function public.admin_discount_member(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_paid_admin(); return (select jsonb_build_object('id',u.id,'name',coalesce(a.full_name,p.display_name),'email',u.email) from auth.users u join public.profiles p on p.id=u.id left join public.basic_onboarding_applications a on a.user_id=u.id where u.id=p_id); end $$;
create or replace function public.admin_discount_quote_products() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_paid_admin(); return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'kind',kind,'unit',unit,'price_paise',price_paise,'enabled',enabled) order by code),'[]'::jsonb) from public.booking_products where kind in ('workspace','cabin')); end $$;
create or replace function public.quote_discounted_equipment(p_quote_id uuid,p_code text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.equipment_rental_quotes; r public.equipment_rental_rates; d jsonb; tax bigint;
begin
 select * into q from public.equipment_rental_quotes where id=p_quote_id and user_id=auth.uid() and payment_state='unpaid' and expires_at>now();
 if q.id is null or not private.has_approved_basic_membership(auth.uid()) then raise exception 'Current owned equipment quote required' using errcode='42501'; end if;
 select * into r from public.equipment_rental_rates where id=q.rate_id; d:=private.make_discount_quote(auth.uid(),'equipment',q.amount_paise,0,p_code); tax:=round((d->>'payable_paise')::numeric*r.tax_bps/10000);
 update private.discount_quotes set expires_at=least(expires_at,q.expires_at),breakdown=breakdown||jsonb_build_object('equipment_quote_id',q.id,'tax_status',case when r.tax_bps is null then 'not_configured' else 'configured' end,'tax_bps',r.tax_bps,'tax_paise',tax,'total_paise',(d->>'payable_paise')::bigint+tax) where id=(d->>'discount_quote_id')::uuid;
 return d||jsonb_build_object('expires_at',least(now()+interval '15 minutes',q.expires_at),'equipment_quote_id',q.id,'tax_status',case when r.tax_bps is null then 'not_configured' else 'configured' end,'tax_bps',r.tax_bps,'tax_paise',tax,'total_paise',(d->>'payable_paise')::bigint+tax);
end $$;
-- Service-only future payment adapter. Reservation does not grant access or prove payment.
create or replace function public.reserve_discount_quote(p_quote_id uuid,p_member_id uuid,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare q private.discount_quotes; o public.discount_offers; r private.discount_redemptions;
begin
 if p_quote_id is null or p_member_id is null or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'Valid quote, member and idempotency key required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,30001)); select * into r from private.discount_redemptions where idempotency_key=p_idempotency_key;
 if r.id is not null then if r.quote_id<>p_quote_id or r.member_id<>p_member_id then raise exception 'Idempotency key conflict' using errcode='22023'; end if; return r.id; end if;
 select * into q from private.discount_quotes where id=p_quote_id and member_id=p_member_id for update;
 if q.id is null or q.expires_at<=clock_timestamp() or not private.has_approved_basic_membership(p_member_id) then raise exception 'Quote expired or ineligible' using errcode='22023'; end if;
 if q.offer_id is not null then
  select * into o from public.discount_offers where id=q.offer_id for update;
  if o.revision<>q.offer_revision or o.state<>'active' or o.starts_at>clock_timestamp() or o.ends_at<=clock_timestamp() or not private.discount_available(o,p_member_id) then raise exception 'Offer changed or exhausted; requote' using errcode='40001'; end if;
 end if;
 if q.expires_at<=clock_timestamp() then raise exception 'Quote expired or ineligible' using errcode='22023'; end if;
 insert into private.discount_redemptions(quote_id,offer_id,member_id,idempotency_key,expires_at) values(q.id,q.offer_id,p_member_id,p_idempotency_key,least(q.expires_at,coalesce(o.ends_at,q.expires_at))) returning id into r.id; return r.id;
end $$;
create or replace function public.settle_discount_reservation(p_id uuid,p_capture boolean) returns void language plpgsql security definer set search_path='' as $$
declare r private.discount_redemptions; offer uuid;
begin
 select offer_id into offer from private.discount_redemptions where id=p_id;
 if offer is not null then perform 1 from public.discount_offers where id=offer for update; end if;
 select * into r from private.discount_redemptions where id=p_id for update;
 if r.id is null or p_capture is null then raise exception 'Unknown reservation or decision' using errcode='22023'; end if;
 if (r.state='captured' and p_capture) or (r.state='released' and not p_capture) then return; end if;
 if r.state<>'reserved' or (p_capture and (r.expires_at<=clock_timestamp() or not private.has_approved_basic_membership(r.member_id))) then raise exception 'Reservation no longer active' using errcode='22023'; end if;
 -- A valid reserved quote retains its agreed price if the offer is subsequently paused.
 update private.discount_redemptions set state=case when p_capture then 'captured' else 'released' end,captured_at=case when p_capture then clock_timestamp() end where id=p_id;
end $$;
revoke all on function public.admin_discount_offers(),public.discount_offer_history(uuid),public.save_discount_offer(jsonb,uuid,integer),public.public_discount_offers(),public.my_discount_offers(),public.quote_discounted_access(uuid,date[],uuid,integer,text),public.quote_discounted_equipment(uuid,text),public.reserve_discount_quote(uuid,uuid,text),public.settle_discount_reservation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.public_discount_offers() to anon,authenticated;
grant execute on function public.admin_discount_offers(),public.discount_offer_history(uuid),public.save_discount_offer(jsonb,uuid,integer),public.my_discount_offers(),public.quote_discounted_access(uuid,date[],uuid,integer,text),public.quote_discounted_equipment(uuid,text) to authenticated;
grant execute on function public.reserve_discount_quote(uuid,uuid,text),public.settle_discount_reservation(uuid,boolean) to service_role;
revoke all on function private.discount_available(public.discount_offers,uuid),private.make_discount_quote(uuid,text,bigint,bigint,text) from public,anon,authenticated,service_role;

revoke all on function private.quote_discounted_access_for(uuid,uuid,date[],uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.admin_preview_discount_access(uuid,uuid,date[],uuid,integer,text),public.admin_discount_member(uuid),public.admin_discount_quote_products() from public,anon,authenticated;
grant execute on function public.admin_preview_discount_access(uuid,uuid,date[],uuid,integer,text),public.admin_discount_member(uuid),public.admin_discount_quote_products() to authenticated;
