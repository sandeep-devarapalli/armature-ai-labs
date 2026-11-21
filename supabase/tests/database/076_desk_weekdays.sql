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
insert into public.resources(id,location_id,slug,name,kind)
select '97600000-0000-4000-8000-000000000011',location_id,'weekday-event','Synthetic event room','workspace'
from public.resources where id='97600000-0000-4000-8000-000000000010';
update private.event_checkout_settings set event_resource='97600000-0000-4000-8000-000000000011';
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at,notes)
select bid::uuid,'97600000-0000-4000-8000-000000000011','97600000-0000-4000-8000-000000000001',
  (current_setting('t.monday')::date+day_offset+opens) at time zone 'Asia/Kolkata',
  (current_setting('t.monday')::date+day_offset+closes) at time zone 'Asia/Kolkata','Private example'
from (values ('97600000-0000-4000-8000-000000000012',0,time '14:00',time '15:00'),
             ('97600000-0000-4000-8000-000000000013',1,time '17:00',time '18:00')) v(bid,day_offset,opens,closes);
select is(public.desk_calendar_events(current_setting('t.monday')::date,current_setting('t.monday')::date+1)
  ->0->>'blocksDesk','true','A confirmed daytime event blocks desks');
select is(public.desk_calendar_events(current_setting('t.monday')::date,current_setting('t.monday')::date+1)
  ->1->>'blocksDesk','false','A confirmed event starting at 17:00 leaves desks open');
select ok(not (public.desk_calendar_events(current_setting('t.monday')::date,current_setting('t.monday')::date)::text like '%Private example%'),
  'The calendar does not expose private event notes');
select is(public.desk_calendar_chairs(current_setting('t.monday')::date,'day'),'{}'::text[],
  'A blocking event prevents new desk checkout');
select is(public.desk_calendar_chairs(current_setting('t.monday')::date-7,'week'),array['S07'],
  'An earlier week can still be reserved');
select is(public.desk_calendar_chairs((now() at time zone 'Asia/Kolkata')::date+31,'day'),'{}'::text[],
  'A desk cannot be purchased more than 30 days in advance');
select ok(not has_function_privilege('authenticated','public.desk_relocations(uuid,uuid)','EXECUTE'),
  'Relocation is accessible only through the staff-authorized Edge Function');

update private.booking_notice_settings set enabled=true;
insert into private.live_desk_quotes(id,member_id,resource_id,product_id,chair,unit,starts_on,ends_on,amount_paise,agreement_hash)
select '97600000-0000-4000-8000-000000000014','97600000-0000-4000-8000-000000000002',
  '97600000-0000-4000-8000-000000000010',id,'S07','week',current_setting('t.monday')::date,current_setting('t.monday')::date+6,175000,'fixture'
from public.booking_products where code='workspace-week';
update private.live_desk_quotes q set payment_id='pay_DeskCalendarFixture',
  booking_ids=(select array_agg(b.id order by b.starts_at) from public.bookings b where b.resource_id=q.resource_id)
where q.id='97600000-0000-4000-8000-000000000014';
select set_config('t.move_booking',(select booking_ids[1]::text from private.live_desk_quotes
  where id='97600000-0000-4000-8000-000000000014'),true);
select is(public.desk_relocations('97600000-0000-4000-8000-000000000001',current_setting('t.move_booking')::uuid)->>'fallback',
 'F7','The paid S07 reservation maps to F7');
select is(public.desk_relocations('97600000-0000-4000-8000-000000000001',current_setting('t.move_booking')::uuid)->>'fallback',
 'F7','Repeating the move is idempotent');
select is((select payload#>>'{sessions,0,id}' from private.booking_notice_outbox
 where aggregate_id='97600000-0000-4000-8000-000000000014' and stage='updated'),
 current_setting('t.move_booking'),'The move updates the original calendar UID once');
select is((select resource_id from public.bookings where id=current_setting('t.move_booking')::uuid),
 '97600000-0000-4000-8000-000000000010'::uuid,'The original paid booking and entitlement are preserved');
select * from finish();
rollback;
