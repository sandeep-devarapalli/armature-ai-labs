begin;
select no_plan();
delete from public.booking_inventory;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('97600000-0000-4000-8000-000000000001','weekday-admin@example.test',now(),'authenticated','authenticated'),
 ('97600000-0000-4000-8000-000000000002','weekday-member@example.test',now(),'authenticated','authenticated');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Person',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '97600000%';
insert into public.staff_roles(user_id,role) values('97600000-0000-4000-8000-000000000001','admin');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days)
select '97600000-0000-4000-8000-000000000010',id,'weekday-desk','Weekday desk','workspace',1,1440,10000 from public.locations limit 1;
insert into public.resource_booking_policies values('97600000-0000-4000-8000-000000000010','workspace');
insert into public.booking_inventory values('97600000-0000-4000-8000-000000000010','S07','GF','GF-10');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at)
select '97600000-0000-4000-8000-000000000010',d,time '09:00',time '17:00' from generate_series(1,5) d;
update public.booking_products set price_paise=1001,enabled=true;
update public.booking_policy_settings set public_desk_calendar_enabled=true;
select set_config('t.monday',(current_date+14+(8-extract(isodow from current_date)::int))::text,true);

select is((select private.desk_open_days('97600000-0000-4000-8000-000000000010',current_setting('t.monday')::date,current_setting('t.monday')::date+6)),5,'A week holds five open weekdays');
select is((select available from public.list_bookable_desk_dates('S07','day',current_setting('t.monday')::date+5,current_setting('t.monday')::date+5)),false,'Saturday day pass is not offered');
select is((select available from public.list_bookable_desk_dates('S07','week',current_setting('t.monday')::date+6,current_setting('t.monday')::date+6)),false,'Week pass cannot start on a Sunday');
select is((select available from public.list_bookable_desk_dates('S07','week',current_setting('t.monday')::date,current_setting('t.monday')::date)),true,'Week pass spanning a weekend is offered');

update public.booking_policy_settings set mock_grants_enabled=true;
select set_config('request.jwt.claims','{"sub":"97600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.grant_mock_access('97600000-0000-4000-8000-000000000002',(select id from public.booking_products where code='workspace-week'),'97600000-0000-4000-8000-000000000010',array[current_setting('t.monday')::date]);
select set_config('request.jwt.claims','{"sub":"97600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(cardinality(public.reserve_workspace_pass('97600000-0000-4000-8000-000000000010',(select id from public.booking_products where code='workspace-week'),array[current_setting('t.monday')::date])),5,'Week pass books only the weekdays');
select is((select count(*)::integer from public.bookings where resource_id='97600000-0000-4000-8000-000000000010' and extract(isodow from starts_at at time zone 'Asia/Kolkata')>5),0,'No weekend bookings are created');
select is((select period from public.workspace_pass_allocations where resource_id='97600000-0000-4000-8000-000000000010'),
 daterange(current_setting('t.monday')::date,current_setting('t.monday')::date+7,'[)'),'Allocation keeps the full seven-day span');
select * from finish();
rollback;
