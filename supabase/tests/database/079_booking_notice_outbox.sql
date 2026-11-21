begin;
select no_plan();

insert into auth.users(id, aud, role, email)
values ('97079000-0000-4000-8000-000000000001','authenticated','authenticated','booking-notice-fixture@example.test');
insert into private.guest_passes(id,user_id,visit_date,purpose,details)
values ('97079000-0000-4000-8000-000000000002','97079000-0000-4000-8000-000000000001',current_date+1,'meeting','Synthetic initially disabled');
select is((select count(*) from private.booking_notice_outbox),0::bigint,'Customer notices default to disabled');
select ok(not has_function_privilege('authenticated','public.claim_booking_notices(integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.settle_booking_notice(uuid,text,text)','EXECUTE'),
  'Only the service worker can claim or settle notices');

update private.booking_notice_settings set enabled=true;
insert into private.guest_passes(id,user_id,visit_date,purpose,details)
values ('97079000-0000-4000-8000-000000000003','97079000-0000-4000-8000-000000000001',current_date+2,'meeting','Synthetic enabled');
update private.guest_passes set status='alternate',offered_date=current_date+3
where id='97079000-0000-4000-8000-000000000003';
update private.guest_passes set status='pending',visit_date=offered_date,offered_date=null
where id='97079000-0000-4000-8000-000000000003';
update private.guest_passes set status='approved'
where id='97079000-0000-4000-8000-000000000003';
update private.guest_passes set status='checked_in'
where id='97079000-0000-4000-8000-000000000003';
select is((select array_agg(stage order by sequence) from private.booking_notice_outbox),
  array['received','alternate','received','confirmed'],'Approval emits the invite milestone once; check-in does not');
select is((select payload->>'guestDate' from private.booking_notice_outbox where stage='confirmed'),
  (current_date+3)::text,'Approval uses the accepted alternate date');
select ok(not exists(select from private.booking_notice_outbox where payload ?| array['details','staff_note']),
  'Guest personal details and staff notes stay outside the notice payload');

select set_config('notice.claim',public.claim_booking_notices(5)::text,true);
select is(jsonb_array_length(current_setting('notice.claim')::jsonb),1,'Only the first notice per aggregate can be claimed');
select is(public.claim_booking_notices(5),'[]'::jsonb,'A second worker cannot claim an in-flight notice or overtake it');
select ok(public.settle_booking_notice((current_setting('notice.claim')::jsonb->0->>'id')::uuid,'sent','fixture-id'),
  'The worker records a successful delivery');
select is(public.claim_booking_notices(5)->0->>'stage','alternate','Settlement unlocks the next milestone');
select is(public.claim_booking_notices(5),'[]'::jsonb,'Claiming does not repeat a previously sent notice');

insert into public.locations(id,slug,name)
values ('97079000-0000-4000-8000-000000000004','booking-notice-fixture','Synthetic lab');
insert into public.resources(id,location_id,slug,name,kind) values
 ('97079000-0000-4000-8000-000000000005','97079000-0000-4000-8000-000000000004','desk','Synthetic desk','workspace'),
 ('97079000-0000-4000-8000-000000000006','97079000-0000-4000-8000-000000000004','cabin','Synthetic cabin','workspace'),
 ('97079000-0000-4000-8000-000000000007','97079000-0000-4000-8000-000000000004','equipment','Synthetic equipment','equipment');
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at) values
 ('97079000-0000-4000-8000-000000000008','97079000-0000-4000-8000-000000000005','97079000-0000-4000-8000-000000000001',now()+interval '4 days',now()+interval '4 days 8 hours'),
 ('97079000-0000-4000-8000-000000000009','97079000-0000-4000-8000-000000000005','97079000-0000-4000-8000-000000000001',now()+interval '7 days',now()+interval '7 days 8 hours'),
 ('97079000-0000-4000-8000-000000000010','97079000-0000-4000-8000-000000000006','97079000-0000-4000-8000-000000000001',now()+interval '10 days',now()+interval '40 days'),
 ('97079000-0000-4000-8000-000000000011','97079000-0000-4000-8000-000000000007','97079000-0000-4000-8000-000000000001',now()+interval '10 days',now()+interval '17 days');

insert into private.live_desk_quotes(id,member_id,resource_id,product_id,chair,unit,starts_on,ends_on,amount_paise,agreement_hash)
select '97079000-0000-4000-8000-000000000012','97079000-0000-4000-8000-000000000001',
 '97079000-0000-4000-8000-000000000005',id,'S01','week',current_date+4,current_date+10,175000,'fixture'
from public.booking_products where code='workspace-week';
select is((select count(*) from private.booking_notice_outbox where kind='week'),0::bigint,'An unpaid desk quote emits no confirmation');
update private.live_desk_quotes set payment_id='pay_NoticeFixture',
  booking_ids=array['97079000-0000-4000-8000-000000000008','97079000-0000-4000-8000-000000000009']::uuid[]
where id='97079000-0000-4000-8000-000000000012';
select is((select jsonb_array_length(payload->'sessions') from private.booking_notice_outbox where kind='week' and stage='confirmed'),
  2,'A multi-day pass emits one notice with exact reserved sessions');
update public.bookings set starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour'
where id='97079000-0000-4000-8000-000000000008';
select is((select payload#>>'{sessions,0,id}' from private.booking_notice_outbox
  where aggregate_id='97079000-0000-4000-8000-000000000012' and stage='updated'),
  '97079000-0000-4000-8000-000000000008','Schedule change retains the original desk session and aggregate IDs');
update public.bookings set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=member_id
where id='97079000-0000-4000-8000-000000000009';
select is((select payload#>>'{sessions,0,id}' from private.booking_notice_outbox
  where aggregate_id='97079000-0000-4000-8000-000000000012' and stage='cancelled'),
  '97079000-0000-4000-8000-000000000009','Cancellation targets the same reserved session rather than the whole pass');

insert into private.rental_quotes(id,member_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,policy_version,agreement_hash) values
 ('97079000-0000-4000-8000-000000000013','97079000-0000-4000-8000-000000000001','cabin101','individual','97079000-0000-4000-8000-000000000006','month',current_date+10,current_date+40,4000000,8000000,'fixture','fixture-cabin'),
 ('97079000-0000-4000-8000-000000000014','97079000-0000-4000-8000-000000000001','hiwonder','individual','97079000-0000-4000-8000-000000000007','week',current_date+10,current_date+17,105000,2500000,'fixture','fixture-equipment');
update private.rental_quotes set approved_at=clock_timestamp()
where id in ('97079000-0000-4000-8000-000000000013','97079000-0000-4000-8000-000000000014');
update private.rental_quotes set deposit_verified_at=clock_timestamp()
where id in ('97079000-0000-4000-8000-000000000013','97079000-0000-4000-8000-000000000014');
update private.rental_quotes set booking_id='97079000-0000-4000-8000-000000000010'
where id='97079000-0000-4000-8000-000000000013';
update private.rental_quotes set booking_id='97079000-0000-4000-8000-000000000011'
where id='97079000-0000-4000-8000-000000000014';
select is((select array_agg(stage order by sequence) from private.booking_notice_outbox where kind='cabin'),
  array['received','payment_due','deposit_verified','confirmed'],'Cabin notices follow the same authoritative milestones as checkout');
select is((select array_agg(stage order by sequence) from private.booking_notice_outbox where kind='equipment'),
  array['received','payment_due','deposit_verified','confirmed'],'Equipment notices follow the same authoritative milestones as checkout');
select ok(not exists(select from private.booking_notice_outbox where kind in ('cabin','equipment') and payload?'sessions'),
  'Rental term dates do not create invented handover appointments');

select * from finish();
rollback;
