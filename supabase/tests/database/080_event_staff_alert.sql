begin;
select no_plan();

insert into auth.users(id,aud,role,email,email_confirmed_at) values
  ('94800000-0000-4000-8000-000000000001','authenticated','authenticated','event-alert@example.test',now()),
  ('94800000-0000-4000-8000-000000000002','authenticated','authenticated','hello@armatureailabs.com',now());
insert into public.locations(id,slug,name)
  values('94800000-0000-4000-8000-000000000010','event-staff-alert-fixture','Synthetic event alert lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days)
  values('94800000-0000-4000-8000-000000000011','94800000-0000-4000-8000-000000000010',
         'event-staff-alert-room','Synthetic event alert room','room',40,900,366);

update private.booking_notice_settings set enabled=false,test_recipient_id=null;
insert into private.event_quotes(id,member_id,resource_id,event_date,start_time,hours,attendees,purpose,starts_at,ends_at,
  rent_paise,policy_version,agreement_hash,direct_checkout)
values('94800000-0000-4000-8000-000000000021','94800000-0000-4000-8000-000000000001','94800000-0000-4000-8000-000000000011',
  '2027-03-13','10:00',3,20,'Synthetic equipment demonstration','2027-03-13 10:00+05:30','2027-03-13 13:00+05:30',
  750000,'test-event-alert','fixture',true);
select is((select count(*) from private.booking_notice_outbox where dedupe_key='94800000-0000-4000-8000-000000000021:event_staff_approval'),
  0::bigint,'Email switch suppresses staff alerts');

update private.booking_notice_settings set test_recipient_id='94800000-0000-4000-8000-000000000002';
insert into private.event_quotes(id,member_id,resource_id,event_date,start_time,hours,attendees,purpose,starts_at,ends_at,
  rent_paise,policy_version,agreement_hash,direct_checkout)
select '94800000-0000-4000-8000-000000000022',member_id,resource_id,event_date,start_time,hours,attendees,purpose,starts_at,ends_at,
  rent_paise,policy_version,agreement_hash,direct_checkout
from private.event_quotes where id='94800000-0000-4000-8000-000000000021';
update private.event_quotes set purpose='Updated synthetic demonstration' where id='94800000-0000-4000-8000-000000000022';
select is((select count(*) from private.booking_notice_outbox where dedupe_key='94800000-0000-4000-8000-000000000022:event_staff_approval'),
  1::bigint,'Internal-only delivery queues one staff alert despite a later update');
select ok((select recipient_id='94800000-0000-4000-8000-000000000002' and aggregate_id<> '94800000-0000-4000-8000-000000000022'
  and payload->>'reference'='94800000-0000-4000-8000-000000000022'
  and (payload#>>'{sessions,0,startsAt}')::timestamptz='2027-03-13 10:00+05:30'::timestamptz
  and (payload#>>'{sessions,0,endsAt}')::timestamptz='2027-03-13 13:00+05:30'::timestamptz
  and not payload?'purpose'
  from private.booking_notice_outbox where dedupe_key='94800000-0000-4000-8000-000000000022:event_staff_approval'),
  'Staff alert carries only review details to the verified mailbox and cannot block customer confirmations');

select * from finish();
rollback;
