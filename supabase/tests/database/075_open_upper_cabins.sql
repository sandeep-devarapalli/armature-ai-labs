begin;
select no_plan();
select is((select array_agg(deposit_paise order by code) from private.rental_catalogue where code in ('cabin201','cabin202','cabin203')),
 array[60000000,36000000,36000000]::bigint[],'Upper cabin deposits are three months of rent');
select is((select array_agg(distinct available_from) from private.rental_catalogue where code in ('cabin201','cabin202','cabin203')),
 array['2026-11-22'::date],'Legacy upper-cabin start date is retained');
select is((select array_agg(code order by code) from private.rental_catalogue
 where code in ('cabin201','cabin202','cabin203') and not released and not private.rental_item_quotable(rental_catalogue)),
 array['cabin201','cabin202','cabin203']::text[],'Upper cabins are disabled for new self-service quotes');
select * from finish();
rollback;
