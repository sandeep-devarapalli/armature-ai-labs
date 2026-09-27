begin;
select no_plan();
select is((select mock_grants_enabled from public.booking_policy_settings),false,'mock activation defaults off');
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('81000000-0000-4000-8000-000000000001','policy-admin@example.test',now(),'authenticated','authenticated'),
 ('81000000-0000-4000-8000-000000000002','policy-member@example.test',now(),'authenticated','authenticated'),
 ('81000000-0000-4000-8000-000000000003','policy-minor@example.test',now(),'authenticated','authenticated');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Person',email,'9999999999','https://linkedin.com/in/test',case when id::text like '%003' then date '2014-06-01' else date '1990-01-01' end,'approved' from auth.users where id::text like '81000000%';
insert into public.staff_roles(user_id,role) values('81000000-0000-4000-8000-000000000001','admin');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_guests,max_duration_minutes,booking_horizon_days)
select x.id::uuid,l.id,x.slug,x.slug,x.kind::public.resource_kind,x.capacity,x.guests,1440,10000 from (values
 ('82000000-0000-4000-8000-000000000001','policy-workspace','workspace',1,0),
 ('82000000-0000-4000-8000-000000000002','policy-cabin','room',4,2),
 ('82000000-0000-4000-8000-000000000003','policy-equipment','equipment',1,0),
 ('82000000-0000-4000-8000-000000000004','policy-event','room',35,34)) x(id,slug,kind,capacity,guests) cross join lateral(select id from public.locations limit 1) l;
insert into public.resource_booking_policies values
 ('82000000-0000-4000-8000-000000000001','workspace'),('82000000-0000-4000-8000-000000000002','cabin'),
 ('82000000-0000-4000-8000-000000000003','equipment'),('82000000-0000-4000-8000-000000000004','event');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at)
select id,d,time '00:00',time '24:00' from public.resources cross join generate_series(0,6) d where id::text like '82000000%';
update public.booking_products set price_paise=1001,enabled=true;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.grant_mock_access('81000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='workspace-day'),'82000000-0000-4000-8000-000000000001',array[date '2030-01-07'])$$,'42501','Mock grants are disabled','website Admin cannot activate mock grants while hold remains');
update public.booking_policy_settings set mock_grants_enabled=true;
select is(cardinality(private.pass_dates('week',array[date '2030-01-07'])),7,'week is seven consecutive days');
select is((private.pass_dates('week',array[date '2030-01-07']))[7],date '2030-01-13','week includes final seventh day');
select is(cardinality(private.pass_dates('month',array[date '2032-02-01'])),29,'calendar month includes leap day');
select throws_ok($$select private.pass_dates('month',array[date '2030-01-22'])$$,'22023','Month pass starts on the first day','midmonth start cannot silently become rolling month');
select throws_ok($$select private.pass_dates('day',array[date '2030-01-31',date '2030-02-01'])$$,'22023','Selected day passes must be within one month','selected days remain within one month');
select is(cardinality(private.pass_dates('day',array[date '2030-01-07',date '2030-01-09',date '2030-01-07'])),2,'selected dates deduplicate');
select is((public.quote_access_pass((select id from public.booking_products where code='workspace-week'),array[date '2030-01-07'],0,'82000000-0000-4000-8000-000000000001',3)->>'total_paise')::bigint,3003::bigint,'team quote charges all three named seats');
select throws_ok($$select public.quote_access_pass((select id from public.booking_products where code='cabin-month'),array[date '2030-01-01'],0,'82000000-0000-4000-8000-000000000001')$$,'22023','Product does not match resource','cabin quote cannot use a workspace resource');
select public.grant_mock_access('81000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='workspace-week'),'82000000-0000-4000-8000-000000000001',array[date '2030-01-07']);
select is((select sum(price_paise)::bigint from public.paid_access_entitlements where user_id='81000000-0000-4000-8000-000000000002'),1001::bigint,'weekly row prices sum exactly without rounding drift');
select lives_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-07 09:00+05:30','2030-01-07 17:00+05:30','personal',null,0)$$,'standard access includes exact09to17');
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-07 08:00+05:30','2030-01-07 09:00+05:30','personal',null,0)$$,'42501','Approved basic membership and dated paid access required','building opening does not grant unpriced08to09');
select public.set_booking_closure((select location_id from public.resources where id='82000000-0000-4000-8000-000000000001'),'2030-01-08','Synthetic holiday',true);
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-08 09:00+05:30','2030-01-08 10:00+05:30','personal',null,0)$$,'22023','Lab is closed on a selected date','paid weekly entitlement does not override holiday');
select is(jsonb_array_length(public.quote_access_pass((select id from public.booking_products where code='workspace-week'),array[date '2030-01-07'],0,'82000000-0000-4000-8000-000000000001')->'closed_dates'),1,'quote shows exact closure date');
select public.grant_mock_resource_access('81000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='equipment-hour'),'82000000-0000-4000-8000-000000000003','2030-01-07 10:00+05:30','2030-01-07 12:00+05:30');
select lives_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000003','2030-01-07 10:00+05:30','2030-01-07 12:00+05:30','personal',null,0)$$,'equipment plus workspace entitlement works');
update public.paid_access_entitlements set revoked_at=now() where product_id=(select id from public.booking_products where code='workspace-week');
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000003','2030-01-07 10:00+05:30','2030-01-07 12:00+05:30','personal',null,0)$$,'42501','Approved basic membership and dated paid access required','equipment-only entitlement never grants entry');
update public.paid_access_entitlements set revoked_at=null;
select public.grant_mock_access('81000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='overnight-day'),'82000000-0000-4000-8000-000000000001',array[date '2030-01-09']);
select lives_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-10 01:00+05:30','2030-01-10 03:00+05:30','personal',null,0)$$,'overnight subinterval after midnight works');
select throws_ok($$select public.grant_mock_access('81000000-0000-4000-8000-000000000003',(select id from public.booking_products where code='overnight-day'),'82000000-0000-4000-8000-000000000001',array[date '2030-01-09'])$$,'42501','Overnight access is adults only','minor cannot receive overnight grant');
select public.grant_mock_access('81000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='cabin-month'),'82000000-0000-4000-8000-000000000002',array[date '2030-01-01'],4);
select lives_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','2030-01-07 09:00+05:30','2030-01-07 17:00+05:30','personal',null,2)$$,'full-day cabin permits limited timed guest visit');
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','2030-01-07 09:00+05:30','2030-01-07 17:00+05:30','personal',null,3)$$,'22023','Cabin guests are limited to half the seats','cabin half-seat guest ceiling enforced');
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at) values('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','2030-01-07 09:00+05:30','2030-01-07 17:00+05:30');
insert into public.booking_guests(booking_id,name) values('83000000-0000-4000-8000-000000000001','Synthetic Guest');
select is((select visit_ends_at-visit_starts_at from public.booking_guests where booking_id='83000000-0000-4000-8000-000000000001'),interval '3 hours','guest duration is separately limited to three hours');
select throws_ok($$update public.booking_guests set visit_ends_at='2030-01-07 13:00+05:30' where booking_id='83000000-0000-4000-8000-000000000001'$$,'22023','Guest visit must fit cabin booking and last at most three hours','guest duration cannot exceed three hours');
update public.bookings set starts_at='2030-01-09 09:00+05:30',ends_at='2030-01-09 17:00+05:30' where id='83000000-0000-4000-8000-000000000001';
select is((select visit_starts_at from public.booking_guests where booking_id='83000000-0000-4000-8000-000000000001'),'2030-01-09 09:00+05:30'::timestamptz,'cabin rescheduling moves guest window to new date');
select public.grant_mock_resource_access('81000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='event-hour'),'82000000-0000-4000-8000-000000000004','2030-01-07 08:00+05:30','2030-01-07 23:00+05:30');
select lives_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000004','2030-01-07 17:00+05:30','2030-01-07 21:00+05:30','personal',null,34)$$,'weekday evening supports35 people');
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000004','2030-01-07 17:00+05:30','2030-01-07 21:00+05:30','personal',null,35)$$,'22023','Events require at least one hour and at most 35 attendees within 08:00 to 23:00','event cannot promise36 seats');
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000004','2030-01-07 10:00+05:30','2030-01-07 11:00+05:30','personal',null,0)$$,'42501','Weekday daytime events require Admin approval','weekday daytime special approval enforced');
update public.paid_access_entitlements set daytime_event_approved=true where product_id=(select id from public.booking_products where code='event-hour');
select lives_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000004','2030-01-07 10:00+05:30','2030-01-07 11:00+05:30','personal',null,0)$$,'explicit Admin daytime event grant accepted');
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at) values('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000002','2030-01-07 17:00+05:30','2030-01-07 21:00+05:30');
insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at) values('82000000-0000-4000-8000-000000000004','booking','83000000-0000-4000-8000-000000000002','2030-01-07 17:00+05:30','2030-01-07 21:00+05:30');
select is((select starts_at from public.resource_reservations where booking_id='83000000-0000-4000-8000-000000000002'),'2030-01-07 16:40+05:30'::timestamptz,'setup buffer extends before17');
select is((select ends_at from public.resource_reservations where booking_id='83000000-0000-4000-8000-000000000002'),'2030-01-07 21:20+05:30'::timestamptz,'cleanup buffer extends after21');
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-07 09:00+05:30','2030-01-07 10:00+05:30',null,null,0)$$,'42501','Approved basic membership and dated paid access required','null access source fails closed');
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at) values('83000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000002','2030-01-07 21:15+05:30','2030-01-07 22:15+05:30');
select throws_ok($$insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at) values('82000000-0000-4000-8000-000000000004','booking','83000000-0000-4000-8000-000000000003','2030-01-07 21:15+05:30','2030-01-07 22:15+05:30')$$,'23P01',null,'event buffers reject adjoining bookings with insufficient cleanup/setup interval');
insert into public.organizations(id,name) values('84000000-0000-4000-8000-000000000001','Synthetic policy team');
insert into public.organization_memberships(organization_id,status,seat_allowance,starts_at,ends_at) values('84000000-0000-4000-8000-000000000001','active',2,now()-interval '1 day','2031-01-01');
insert into public.organization_members(organization_id,user_id,role,seat_enabled) values
 ('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','admin',false),
 ('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','member',true);
select throws_ok($$select public.grant_mock_access(null,(select id from public.booking_products where code='workspace-day'),'82000000-0000-4000-8000-000000000001',array[date '2030-01-10'],1,0,'84000000-0000-4000-8000-000000000001')$$,'22023','Paid workspace seats must cover the team seat allowance','one paid seat cannot fund two named team seats');
select public.grant_mock_access(null,(select id from public.booking_products where code='workspace-day'),'82000000-0000-4000-8000-000000000001',array[date '2030-01-10'],2,0,'84000000-0000-4000-8000-000000000001');
select ok(private.has_dated_access('81000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','2030-01-10 12:00+05:30','2030-01-10 13:00+05:30',array['workspace']),'matching paid quantity authorizes team access');
update public.organization_memberships set seat_allowance=3 where organization_id='84000000-0000-4000-8000-000000000001';
select ok(not private.has_dated_access('81000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','2030-01-10 12:00+05:30','2030-01-10 13:00+05:30',array['workspace']),'increasing team allowance does not expand an earlier two-seat purchase');
update public.organization_memberships set seat_allowance=2 where organization_id='84000000-0000-4000-8000-000000000001';

insert into public.resource_certification_requirements(resource_id,certification_type_id) select '82000000-0000-4000-8000-000000000001',id from public.certification_types where slug='lab-orientation';
insert into public.member_certifications(member_id,certification_type_id,issued_by) select '81000000-0000-4000-8000-000000000001',id,'81000000-0000-4000-8000-000000000001' from public.certification_types where slug='lab-orientation';
select throws_ok($$select public.team_create_booking('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-10 12:00+05:30','2030-01-10 13:00+05:30','{}',null,'policy-onbehalf')$$,'42501','Required certification is missing or expired','team admin certification cannot substitute for named member certification');
insert into public.member_certifications(member_id,certification_type_id,issued_by) select '81000000-0000-4000-8000-000000000002',id,'81000000-0000-4000-8000-000000000001' from public.certification_types where slug='lab-orientation';
select lives_ok($$select public.team_create_booking('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-10 12:00+05:30','2030-01-10 13:00+05:30','{}',null,'policy-onbehalf')$$,'team admin books for certified named teammate');
select is((select booked_by from public.bookings where idempotency_key='policy-onbehalf'),'81000000-0000-4000-8000-000000000001'::uuid,'on-behalf booking preserves actual actor');
select is((select member_id from public.bookings where idempotency_key='policy-onbehalf'),'81000000-0000-4000-8000-000000000002'::uuid,'on-behalf booking preserves actual beneficiary');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.set_access_renewal((select id from public.paid_access_entitlements where user_id=auth.uid() and product_id=(select id from public.booking_products where code='workspace-week') limit 1),true)$$,'member can save week renewal preference without charge');
select is((select enabled from public.access_renewal_preferences where product_id=(select id from public.booking_products where code='workspace-week')),true,'renewal preference saved');
select throws_ok($$select public.set_access_renewal((select id from public.paid_access_entitlements where user_id=auth.uid() and product_id=(select id from public.booking_products where code='overnight-day') limit 1),true)$$,'42501','Own week or month pass required','day passes cannot renew');
select throws_ok($$select public.configure_booking_product((select id from public.booking_products where code='workspace-week'),1,true)$$,'42501','Website Admin required','member cannot change prices');
reset role;
update public.booking_policy_settings set mock_grants_enabled=false;
select is(private.has_booking_access('81000000-0000-4000-8000-000000000002','personal',null,'2030-01-07 09:00+05:30','2030-01-07 10:00+05:30'),false,'disabling local mock gate immediately removes mock access');
update public.booking_policy_settings set mock_grants_enabled=true;

update public.basic_onboarding_applications set status='revoked' where user_id='81000000-0000-4000-8000-000000000002';
select throws_ok($$select private.require_booking_policy_access('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','2030-01-07 09:00+05:30','2030-01-07 10:00+05:30','personal',null,0)$$,'42501','Approved basic membership and dated paid access required','basic revocation overrides paid entitlement');
set local role authenticated;
select throws_ok($$update public.booking_policy_settings set mock_grants_enabled=true$$,'42501',null,'website account cannot lift activation hold');
select throws_ok($$insert into public.bookings(resource_id,member_id,starts_at,ends_at) values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',now(),now()+interval '1 hour')$$,'42501',null,'direct booking insert cannot bypass validated RPC');
select throws_ok($$update public.bookings set starts_at=starts_at-interval '1 hour'$$,'42501',null,'direct booking update cannot bypass validation');
select throws_ok($$delete from public.booking_guests$$,'42501',null,'direct guest mutation is blocked');
select throws_ok($$delete from public.resource_reservations$$,'42501',null,'direct reservation release is blocked');
reset role;
select * from finish();
rollback;
