-- Signed-out visitors can browse released equipment: listing fields, prices and an in-stock flag only.
-- No unit counts, resource ids, members or reservations leave this function.
begin;
create function public.public_equipment_catalog() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('product',c.code,'kind',c.kind,'name',c.name,
  'dayRentPaise',c.day_rent_paise,'weekRentPaise',c.week_rent_paise,'monthRentPaise',c.month_rent_paise,
  'depositPaise',c.deposit_paise,'salePaise',c.sale_paise,
  'status',case when private.rental_item_quotable(c) then 'available' else 'coming_soon' end,
  'inStock',private.rental_free_units(c.code)>0,
  'category',c.category,'maker',c.maker,'version',c.version,'summary',c.summary,'images',c.images,'highlights',c.highlights,
  'specs',c.specs,'parts',c.parts,'partsNote',c.parts_note,'sourceLabel',c.source_label,'sourceUrl',c.source_url,'stockNote',c.stock_note)
  order by c.sort_order,c.code),'[]'::jsonb)
 from private.rental_catalogue c where c.kind='equipment' and c.released;
$$;
revoke all on function public.public_equipment_catalog() from public;
grant execute on function public.public_equipment_catalog() to anon,authenticated;
commit;
