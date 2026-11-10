begin;
select no_plan();

create function pg_temp.item(p_code text) returns jsonb language sql as $$
 select p from jsonb_array_elements(public.public_equipment_catalog()) p where p->>'product'=p_code;
$$;

-- Visitors can read the list; it carries listing fields and prices.
set local role anon;
select ok(jsonb_array_length(public.public_equipment_catalog())>=3,'Anonymous visitors can read the equipment list');
reset role;
select is(pg_temp.item('hiwonder')->>'name','LeRobot SO-101 Advanced Kit','The list names each item');
select is((pg_temp.item('hiwonder')->>'salePaise')::bigint,5500000::bigint,'The list shows the sale price');
select is((pg_temp.item('waveshare-ov5693')->>'dayRentPaise')::bigint,20000::bigint,'The list shows the day rate');
select is(pg_temp.item('waveshare-ov5693')->>'inStock','false','An item with no units is out of stock');
select is(pg_temp.item('cabin101'),null,'Cabins are not in the equipment list');

-- Only listing keys leave the function: no unit counts, resource ids or quotability internals.
select is((select count(*) from jsonb_array_elements(public.public_equipment_catalog()) p, jsonb_object_keys(p) k
 where k not in ('product','kind','name','dayRentPaise','weekRentPaise','monthRentPaise','depositPaise','salePaise','status','inStock',
 'category','maker','version','summary','images','highlights','specs','parts','partsNote','sourceLabel','sourceUrl','stockNote')),0::bigint,
 'The public list exposes listing fields only');

-- Unreleased items stay hidden.
update private.rental_catalogue set released=false where code='waveshare-ov5693';
select is(pg_temp.item('waveshare-ov5693'),null,'Unreleased equipment is not listed');

select * from finish();
rollback;
