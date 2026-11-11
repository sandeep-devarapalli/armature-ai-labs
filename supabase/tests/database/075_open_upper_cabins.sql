begin;
select no_plan();
select is((select array_agg(deposit_paise order by code) from private.rental_catalogue where code in ('cabin201','cabin202','cabin203')),
 array[60000000,36000000,36000000]::bigint[],'Upper cabin deposits are three months of rent');
select is((select array_agg(distinct available_from) from private.rental_catalogue where code in ('cabin201','cabin202','cabin203')),
 array['2026-11-22'::date],'Upper cabins open on 22 Nov 2026');
select is((select count(*) from private.rental_catalogue k where k.code in ('cabin201','cabin202','cabin203')
 and k.released<>exists(select 1 from private.rental_catalogue_resources r where r.code=k.code)),0::bigint,'Upper cabins release only with a linked room');
select * from finish();
rollback;
