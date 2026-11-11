-- Owner 2026-11-11: Cabins 201-203 open from 22 Nov 2026 with a refundable deposit of three months' rent.
-- Each cabin gets a bookable room copied from Cabin 101's settings, so checkout, holds and the floor plan treat it
-- the same way. A cabin is released only once its room is linked; databases without Cabin 101's room stay unchanged.
do $$
declare base public.resources; c record; rid uuid;
begin
 select r.* into base from private.rental_catalogue_resources cr join public.resources r on r.id=cr.resource_id
 where cr.code='cabin101' order by cr.sort_order limit 1;
 if base.id is null then return; end if;
 for c in select k.*, v.slug, v.inventory_code from private.rental_catalogue k
  join (values ('cabin201','cabin-201','C04'),('cabin202','cabin-202','C02'),('cabin203','cabin-203','C03')) v(code,slug,inventory_code) on v.code=k.code
 loop
  continue when exists(select 1 from private.rental_catalogue_resources where code=c.code);
  insert into public.resources(location_id,slug,name,kind,risk,capacity,max_guests,guests_allowed,reservable,active,
   default_duration_minutes,increment_minutes,max_duration_minutes,booking_horizon_days,checkin_early_minutes,checkin_late_minutes,checkout_grace_minutes)
  values(base.location_id,c.slug,c.name,base.kind,base.risk,c.billable_seats+c.extra_seats,base.max_guests,base.guests_allowed,base.reservable,base.active,
   base.default_duration_minutes,base.increment_minutes,base.max_duration_minutes,base.booking_horizon_days,base.checkin_early_minutes,base.checkin_late_minutes,base.checkout_grace_minutes)
  returning id into rid;
  insert into public.resource_booking_policies(resource_id,kind) select rid,p.kind from public.resource_booking_policies p where p.resource_id=base.id;
  insert into public.booking_inventory(resource_id,code,floor,room) values(rid,c.inventory_code,'FF',c.room) on conflict do nothing;
  insert into private.rental_catalogue_resources(code,resource_id) values(c.code,rid);
 end loop;
end $$;

update private.rental_catalogue k set available_from='2026-11-22',deposit_paise=3*k.monthly_rent_paise,
 released=exists(select 1 from private.rental_catalogue_resources r where r.code=k.code)
where k.code in ('cabin201','cabin202','cabin203');
