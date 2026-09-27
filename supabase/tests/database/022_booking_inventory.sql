begin;
select no_plan();
delete from public.booking_inventory;
select is((select mock_grants_enabled from public.booking_policy_settings),false,'mock activation defaults off');
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('91000000-0000-4000-8000-000000000001','inventory-admin@example.test',now(),'authenticated','authenticated'),
 ('91000000-0000-4000-8000-000000000002','inventory-member@example.test',now(),'authenticated','authenticated'),
 ('91000000-0000-4000-8000-000000000003','inventory-minor@example.test',now(),'authenticated','authenticated');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Person',email,'9999999999','https://linkedin.com/in/test',case when id::text like '%003' then date '2014-06-01' else date '1990-01-01' end,'approved' from auth.users where id::text like '91000000%';
insert into public.staff_roles(user_id,role) values('91000000-0000-4000-8000-000000000001','admin');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_guests,max_duration_minutes,booking_horizon_days)
select x.id::uuid,l.id,x.slug,x.slug,x.kind::public.resource_kind,x.capacity,x.guests,1440,10000 from (values
 ('92000000-0000-4000-8000-000000000001','inventory-workspace','workspace',1,0),
 ('92000000-0000-4000-8000-000000000002','inventory-cabin','room',4,2),
 ('92000000-0000-4000-8000-000000000003','inventory-equipment','equipment',1,0),
 ('92000000-0000-4000-8000-000000000004','inventory-event','room',35,34)) x(id,slug,kind,capacity,guests) cross join lateral(select id from public.locations limit 1) l;
insert into public.resource_booking_policies values
 ('92000000-0000-4000-8000-000000000001','workspace'),('92000000-0000-4000-8000-000000000002','cabin'),
 ('92000000-0000-4000-8000-000000000003','equipment'),('92000000-0000-4000-8000-000000000004','event');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at)
select id,d,time '00:00',time '24:00' from public.resources cross join generate_series(0,6) d where id::text like '92000000%';
update public.booking_products set price_paise=1001,enabled=true;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.booking_inventory values('92000000-0000-4000-8000-000000000001','S01','GF','GF-10');
select is((select count(*)::integer from public.booking_inventory),1,'mapped inventory has stable chair identity');
select throws_ok($$insert into public.booking_inventory values('92000000-0000-4000-8000-000000000003','S26','GF','GF-10')$$,'23514',null,'only25 shared codes accepted');
select throws_ok($$select public.reserve_workspace_pass('92000000-0000-4000-8000-000000000001',(select id from public.booking_products where code='workspace-day'),array[date '2030-01-07'])$$,'42501','Matching pass entitlement required','no paid access cannot reserve');
update public.booking_policy_settings set mock_grants_enabled=true;
select public.grant_mock_access('91000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='workspace-month'),'92000000-0000-4000-8000-000000000001',array[date '2030-01-01']);
select public.set_booking_closure((select location_id from public.resources where id='92000000-0000-4000-8000-000000000001'),'2030-01-08','Synthetic holiday',true);
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.set_booking_resource_enabled('92000000-0000-4000-8000-000000000001',false,'test')$$,'42501','Website Admin required','member cannot disable inventory');
select throws_ok($$select public.create_booking_with_access('92000000-0000-4000-8000-000000000001','2030-01-07 09:00+05:30','2030-01-07 17:00+05:30','{}',null,null,'personal',null)$$,'42501','Use workspace pass reservation for mapped inventory','legacy API cannot bypass pass allocation');
select is(cardinality(public.reserve_workspace_pass('92000000-0000-4000-8000-000000000001',(select id from public.booking_products where code='workspace-month'),array[date '2030-01-01'])),30,'month reserves every open day atomically');
select is((select period from public.workspace_pass_allocations where resource_id='92000000-0000-4000-8000-000000000001'),daterange('2030-01-01','2030-02-01','[)'),'monthly allocation includes closed day');
select is((public.get_workspace_availability((select id from public.booking_products where code='workspace-day'),array[date '2030-01-08'])->0->>'available')::boolean,false,'closed date remains reserved');
select throws_ok($$select public.reserve_workspace_pass('92000000-0000-4000-8000-000000000001',(select id from public.booking_products where code='workspace-day'),array[date '2030-01-07'])$$,'23P01','Resource is reserved by a workspace pass','day cannot overlap monthly reserved chair');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_booking_closure((select location_id from public.resources where id='92000000-0000-4000-8000-000000000001'),'2030-01-08','Synthetic holiday',false);
select is((public.get_workspace_availability((select id from public.booking_products where code='workspace-day'),array[date '2030-01-08'])->0->>'available')::boolean,false,'reopening closure does not sell reserved chair');
select lives_ok($$select public.set_booking_resource_enabled('92000000-0000-4000-8000-000000000001',false,'Maintenance')$$,'admin can disable resource');
select is((select active from public.resources where id='92000000-0000-4000-8000-000000000001'),false,'resource disabled on server');
select public.set_booking_resource_enabled('92000000-0000-4000-8000-000000000001',true,'Ready');
select ok(not has_table_privilege('authenticated','public.booking_inventory','INSERT'),'inventory cannot be forged by member');
select ok(not has_table_privilege('authenticated','private.workspace_booking_requests','INSERT'),'pass guard context cannot be forged');
select ok(not has_function_privilege('anon','public.reserve_workspace_pass(uuid,uuid,date[],uuid)','EXECUTE'),'anonymous reserve denied');
select throws_ok($$update public.resource_reservations set ends_at=ends_at-interval '1 hour' where booking_id=(select booking_ids[1] from public.workspace_pass_allocations where resource_id='92000000-0000-4000-8000-000000000001')$$,'42501','Cancel and reserve a new workspace pass to change dates','legacy reschedule cannot shorten mapped pass');
update public.bookings set status='cancelled',cancelled_at=now(),cancelled_by='91000000-0000-4000-8000-000000000001' where id=(select booking_ids[1] from public.workspace_pass_allocations where resource_id='92000000-0000-4000-8000-000000000001');
select is((select released_at is null from public.workspace_pass_allocations where resource_id='92000000-0000-4000-8000-000000000001'),true,'partial cancellation preserves monthly reservation');
update public.bookings set status='cancelled',cancelled_at=now(),cancelled_by='91000000-0000-4000-8000-000000000001' where resource_id='92000000-0000-4000-8000-000000000001';
select is((select released_at is not null from public.workspace_pass_allocations where resource_id='92000000-0000-4000-8000-000000000001'),true,'all cancelled bookings release allocation');
-- Only one date has matching entitlement: the first insert must roll back on the second.
select public.grant_mock_access('91000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='workspace-day'),'92000000-0000-4000-8000-000000000001',array[date '2030-02-01']);
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.reserve_workspace_pass('92000000-0000-4000-8000-000000000001',(select id from public.booking_products where code='workspace-day'),array[date '2030-02-01',date '2030-02-02'])$$,'42501','Matching pass entitlement required','later day failure aborts entire request');
select is((select count(*)::integer from public.bookings where resource_id='92000000-0000-4000-8000-000000000001' and starts_at>='2030-02-01'),0,'no partial booking survives failed batch');
update public.resources set capacity=6 where id='92000000-0000-4000-8000-000000000002';
insert into public.booking_inventory values('92000000-0000-4000-8000-000000000002','C01','GF','GF-01');
select throws_ok($$select public.reserve_workspace_pass('92000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='cabin-month'),array[date '2030-02-01'])$$,'42501','Team admin required for whole cabin','personal cabin booking blocked');
set local role authenticated;
select throws_ok($$select public.set_booking_resource_enabled('92000000-0000-4000-8000-000000000001',false,'test')$$,'42501','Website Admin required','authenticated nonstaff RPC denied');
reset role;
insert into public.organizations(id,name) values('94000000-0000-4000-8000-000000000001','Synthetic cabin team');
insert into public.organization_memberships(organization_id,status,seat_allowance,starts_at,ends_at) values('94000000-0000-4000-8000-000000000001','active',6,now()-interval '1 day','2031-01-01');
insert into public.organization_members(organization_id,user_id,role,seat_enabled) values
('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','admin',true),
('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','member',true);
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.grant_mock_access(null,(select id from public.booking_products where code='cabin-month'),'92000000-0000-4000-8000-000000000002',array[date '2030-03-01'],4,0,'94000000-0000-4000-8000-000000000001')$$,'22023','Pay for the full cabin seat count','partial cabin seat grant denied');
select public.grant_mock_access(null,(select id from public.booking_products where code='cabin-month'),'92000000-0000-4000-8000-000000000002',array[date '2030-03-01'],6,0,'94000000-0000-4000-8000-000000000001');
select throws_ok($$select public.reserve_workspace_pass('92000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='cabin-month'),array[date '2030-03-01'],'94000000-0000-4000-8000-000000000001')$$,'42501','Team admin required for whole cabin','team member cannot allocate whole cabin');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(cardinality(public.reserve_workspace_pass('92000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='cabin-month'),array[date '2030-03-01'],'94000000-0000-4000-8000-000000000001')),31,'team admin reserves full six-seat cabin across month');
select * from finish();
rollback;
