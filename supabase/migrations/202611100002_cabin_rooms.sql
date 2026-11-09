-- Owner 2026-11-09: cabins map to the rooms on the glass-run plans, and every cabin lists at INR 20,000 per billable
-- seat a month with free extra seats. Cabin 101 (GF-01, 4 + 2 seats) is occupied under a licence: it stays listed
-- but cannot be quoted. Cabins 201-203 are on the first floor and still have no deposit or start date.
alter table private.rental_catalogue
 add column room text check(room ~ '^(GF|FF)-[0-9]{2}$'),
 add column occupied boolean not null default false,
 add constraint rental_catalogue_room_cabins check(kind='cabin' or (room is null and not occupied));

update private.rental_catalogue set room='GF-01',billable_seats=4,extra_seats=2,monthly_rent_paise=4*2000000,occupied=true where code='cabin101';
update private.rental_catalogue set room='FF-06',floor='First floor',monthly_rent_paise=10*2000000 where code='cabin201';
update private.rental_catalogue set room='FF-03',floor='First floor',monthly_rent_paise=6*2000000 where code='cabin202';
update private.rental_catalogue set room='FF-04',floor='First floor',monthly_rent_paise=6*2000000 where code='cabin203';

create or replace function private.rental_item_quotable(c private.rental_catalogue) returns boolean language sql immutable set search_path='' as $$
 select not c.occupied and c.released and c.deposit_paise is not null and case c.kind when 'cabin' then c.monthly_rent_paise is not null and c.available_from is not null
 else coalesce(c.week_rent_paise,c.month_rent_paise) is not null end;
$$;

create or replace function private.rental_products() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_agg(jsonb_build_object('product',c.code,'kind',c.kind,'name',c.name,'floor',c.floor,'room',c.room,
 'billableSeats',c.billable_seats,'extraSeats',c.extra_seats,'monthlyRentPaise',c.monthly_rent_paise,'weekRentPaise',c.week_rent_paise,
 'monthRentPaise',c.month_rent_paise,'dayRentPaise',c.day_rent_paise,'depositPaise',c.deposit_paise,'salePaise',c.sale_paise,
 'availableFrom',c.available_from,'status',case when c.occupied then 'occupied' when private.rental_item_quotable(c) then 'available' else 'coming_soon' end,
 'quantity',(select count(*) from private.rental_catalogue_resources r where r.code=c.code),'freeUnits',private.rental_free_units(c.code),
 'workspaceRequired',c.kind='equipment','staffConfirmationRequired',true,'configured',private.rental_resource(c.code,null) is not null,
 'category',c.category,'maker',c.maker,'version',c.version,'summary',c.summary,'images',c.images,'highlights',c.highlights,
 'specs',c.specs,'parts',c.parts,'partsNote',c.parts_note,'sourceLabel',c.source_label,'sourceUrl',c.source_url,'stockNote',c.stock_note)
 order by c.sort_order,c.code) from private.rental_catalogue c),'[]'::jsonb);
$$;
