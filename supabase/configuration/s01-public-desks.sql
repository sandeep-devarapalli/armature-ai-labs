-- Owner-approved S01 configuration, prepared for review. Does not enable checkout.
-- Apply only after confirming S01 maps to the physical GF-10 chair.
begin;
do $$
declare chair uuid;
begin
  select i.resource_id into strict chair from public.booking_inventory i
  join public.resources r on r.id=i.resource_id
  where i.code='S01' and r.active and r.reservable and r.capacity=1;
  if not exists(select 1 from public.resource_booking_policies where resource_id=chair and kind='workspace') then
    raise exception 'S01 must be the confirmed workspace chair';
  end if;
  if (select count(*) from public.booking_products where kind='workspace' and
      (code,unit) in (('workspace-day','day'),('workspace-week','week'),('workspace-month','month')))<>3 then
    raise exception 'Expected exactly three desk products';
  end if;
  delete from public.resource_hours where resource_id=chair;
  insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at)
    select chair,d,time '09:00',time '17:00' from generate_series(0,6) d;
  update public.booking_products set price_paise=case unit when 'day' then 35000 when 'week' then 175000 when 'month' then 1300000 end,enabled=true
    where kind='workspace' and (code,unit) in (('workspace-day','day'),('workspace-week','week'),('workspace-month','month'));
end;
$$;
-- Deliberately keep public collection disabled. A separate release activates it.
update public.booking_policy_settings set public_desk_checkout_enabled=false where singleton;
commit;
