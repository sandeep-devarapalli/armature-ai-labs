begin;

create extension if not exists pgtap with schema extensions;
select plan(44);

select has_table('public','organizations','team organizations exist');
select has_table('public','organization_invitations','team invitations exist');
select has_column('public','bookings','access_source','bookings record access source');
select has_function('public','create_booking_with_access','team booking RPC exists');
select has_function('public','staff_decide_team_application','staff review RPC exists');

insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('30000000-0000-4000-8000-000000000001','authenticated','authenticated','team-staff@example.test',now()),
 ('30000000-0000-4000-8000-000000000002','authenticated','authenticated','team-admin@example.test',now()),
 ('30000000-0000-4000-8000-000000000003','authenticated','authenticated','teammate@example.test',now()),
 ('30000000-0000-4000-8000-000000000004','authenticated','authenticated','outsider@example.test',now());

insert into public.staff_roles(user_id,role,granted_by) values
 ('30000000-0000-4000-8000-000000000001','admin','30000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims',
 '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;

select lives_ok(
  $$select public.submit_team_application('Test Robotics','Team Admin','Prototype team',1)$$,
  'prospective team admin can apply'
);
select is(
  (select count(*)::integer from public.team_membership_applications),1,
  'applicant sees own application'
);
select throws_ok(
  $$select public.staff_create_team('Unauthorized','30000000-0000-4000-8000-000000000002',1,now(),now()+interval '30 days')$$,
  '42501','staff role required','team admin cannot self-activate membership'
);

reset role;
select set_config('request.jwt.claims',
 '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;

select lives_ok(
  $$select public.staff_decide_team_application(
    (select id from public.team_membership_applications where applicant_id='30000000-0000-4000-8000-000000000002'),
    true,'Application accepted',now()-interval '1 day',now()+interval '30 days')$$,
  'staff can approve a team application'
);
select is(
  (select membership.status::text from public.organization_memberships membership
   join public.organization_members member on member.organization_id=membership.organization_id
   where member.user_id='30000000-0000-4000-8000-000000000002'),
  'pending','approved application does not activate seats before payment'
);
select lives_ok(
  $$select public.staff_set_team_membership(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'),
    'active',1,now()-interval '1 day',now()+interval '30 days')$$,
  'staff activates seats after offline payment'
);

reset role;
select is(
  (select status::text from public.team_membership_applications
   where applicant_id='30000000-0000-4000-8000-000000000002'),
  'approved','application decision is recorded'
);
select is(
  (select seat_enabled from public.organization_members
   where user_id='30000000-0000-4000-8000-000000000002'),
  false,'admin begins without consuming a seat'
);

create temp table test_team_token(token text);
grant all on test_team_token to authenticated;
select set_config('request.jwt.claims',
 '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;

select is(
  (select membership_active from public.list_my_team_access()),
  true,'admin can manage an active team without occupying a seat'
);
select throws_ok(
  $$select public.submit_team_application('Second Team','Team Admin','',1)$$,
  '23505','person already has a team affiliation',
  'affiliated admin cannot submit another team application'
);
insert into test_team_token(token)
select public.team_create_invitation(
  (select organization_id from public.organization_members
   where user_id='30000000-0000-4000-8000-000000000002'),
  'teammate@example.test')->>'token';
select is(
  (select pending_invitations from public.get_team_capacity(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'))),
  1,'pending invitation reserves the only named seat'
);
select throws_ok(
  $$select public.team_create_invitation(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'),
    'outsider@example.test')$$,
  '22023','no team seats available','second invitation cannot overbook seats'
);
select throws_ok(
  $$select public.team_set_admin_seat(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'),true)$$,
  '22023','no team seats available','admin cannot take an occupied seat'
);

reset role;
update public.organization_memberships set seat_allowance=2
where organization_id=(select organization_id from public.organization_members
  where user_id='30000000-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok(
  $$select public.team_create_invitation(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'),
    'teammate@example.test')$$,
  '23505','duplicate key value violates unique constraint "organization_invitations_one_open_email"',
  'the same email cannot hold two open invitations'
);
reset role;
update public.organization_memberships set seat_allowance=1
where organization_id=(select organization_id from public.organization_members
  where user_id='30000000-0000-4000-8000-000000000002');
set local role authenticated;

reset role;
select set_config('request.jwt.claims',
 '{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  $$select public.team_accept_invitation((select token from test_team_token))$$,
  '42501','invitation is unavailable','invitation is bound to a verified email'
);

reset role;
select set_config('request.jwt.claims',
 '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  $$select public.team_accept_invitation((select token from test_team_token))$$,
  '22023','profile display name required','invited person must complete their profile'
);
reset role;
update public.profiles set display_name='Teammate'
where id='30000000-0000-4000-8000-000000000003';
set local role authenticated;
select lives_ok(
  $$select public.team_accept_invitation((select token from test_team_token))$$,
  'verified invited person can claim the reserved seat'
);
select throws_ok(
  $$select public.team_accept_invitation((select token from test_team_token))$$,
  '42501','invitation is unavailable','invitation is single use'
);

reset role;
insert into public.organization_invitations
  (organization_id,email,token_hash,invited_by,created_at,expires_at)
select member.organization_id,'teammate@example.test',
  extensions.digest('expired-team-token','sha256'),
  '30000000-0000-4000-8000-000000000002',now()-interval '8 days',now()-interval '1 day'
from public.organization_members member
where member.user_id='30000000-0000-4000-8000-000000000002';
insert into public.organization_invitations
  (organization_id,email,token_hash,invited_by,revoked_at)
select member.organization_id,'teammate@example.test',
  extensions.digest('revoked-team-token','sha256'),
  '30000000-0000-4000-8000-000000000002',now()
from public.organization_members member
where member.user_id='30000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok(
  $$select public.team_accept_invitation('expired-team-token')$$,
  '42501','invitation is unavailable','expired invitation cannot be accepted'
);
select throws_ok(
  $$select public.team_accept_invitation('revoked-team-token')$$,
  '42501','invitation is unavailable','revoked invitation cannot be accepted'
);

reset role;
select is(
  private.has_active_team_membership(
    '30000000-0000-4000-8000-000000000003',
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000003'),
    now(),now()+interval '1 hour'),
  true,'team seat grants access without a personal membership'
);

insert into public.organizations(id,name)
values ('32000000-0000-4000-8000-000000000001','Separate Robotics Team');
insert into public.organization_memberships
  (organization_id,status,seat_allowance,starts_at,ends_at)
values ('32000000-0000-4000-8000-000000000001','active',1,
  now()-interval '1 day',now()+interval '30 days');
insert into public.organization_members(organization_id,user_id,role,seat_enabled)
values ('32000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000004','admin',false);
create temp table test_first_team_id(organization_id uuid);
insert into test_first_team_id
select organization_id from public.organization_members
where user_id='30000000-0000-4000-8000-000000000002';
grant select on test_first_team_id to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_team_roster('32000000-0000-4000-8000-000000000001')$$,
  '42501','team admin required','first admin cannot read another team roster'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_team_usage((select organization_id from test_first_team_id))$$,
  '42501','team admin required','second admin cannot read first team usage'
);
reset role;

update public.memberships set status='active',starts_at=now()-interval '1 day'
where user_id='30000000-0000-4000-8000-000000000003';
insert into public.bookings
  (id,resource_id,member_id,starts_at,ends_at,notes,access_source,organization_id)
select '31000000-0000-4000-8000-000000000001',resource.id,
  '30000000-0000-4000-8000-000000000003',
  date_trunc('hour',now()+interval '7 days'),
  date_trunc('hour',now()+interval '7 days')+interval '1 hour',
  'Private team booking purpose','team',member.organization_id
from public.resources resource
cross join public.organization_members member
where resource.slug='builder-pod-01'
  and member.user_id='30000000-0000-4000-8000-000000000003';
insert into public.bookings
  (id,resource_id,member_id,starts_at,ends_at,notes,access_source)
select '31000000-0000-4000-8000-000000000002',resource.id,
  '30000000-0000-4000-8000-000000000003',
  date_trunc('hour',now()+interval '8 days'),
  date_trunc('hour',now()+interval '8 days')+interval '1 hour',
  'Private personal booking purpose','personal'
from public.resources resource where resource.slug='builder-pod-01';
insert into public.resource_reservations
  (resource_id,kind,booking_id,starts_at,ends_at)
select booking.resource_id,'booking',booking.id,booking.starts_at,booking.ends_at
from public.bookings booking where booking.id='31000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(
  $$select public.create_booking_with_access(
    (select id from public.resources where slug='builder-pod-01'),
    date_trunc('day',now()+interval '11 days')+interval '12 hours',
    date_trunc('day',now()+interval '11 days')+interval '13 hours',
    '{}'::text[],null,'team-booking-cert-test','team',
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000003'))$$,
  '42501','required certification is missing or expired',
  'team seat does not bypass personal equipment certification'
);
reset role;
insert into public.member_certifications
  (member_id,certification_type_id,issued_at,issued_by)
select '30000000-0000-4000-8000-000000000003',certification.id,
  now()-interval '1 day','30000000-0000-4000-8000-000000000001'
from public.certification_types certification
where certification.slug='lab-orientation';
set local role authenticated;
select lives_ok(
  $$select public.create_booking_with_access(
    (select id from public.resources where slug='builder-pod-01'),
    date_trunc('day',now()+interval '11 days')+interval '12 hours',
    date_trunc('day',now()+interval '11 days')+interval '13 hours',
    '{}'::text[],null,'team-booking-rpc-test','team',
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000003'))$$,
  'team member can create a booking through the attribution RPC'
);
select is(
  (select access_source from public.bookings
   where member_id='30000000-0000-4000-8000-000000000003'
     and idempotency_key='team-booking-rpc-test'),
  'team','RPC booking records team access source'
);
select lives_ok(
  $$select public.reschedule_booking(
    (select id from public.bookings where idempotency_key='team-booking-rpc-test'),
    date_trunc('day',now()+interval '12 days')+interval '12 hours',
    date_trunc('day',now()+interval '12 days')+interval '13 hours')$$,
  'team booking can be rescheduled within membership dates'
);
select is(
  (select starts_at from public.bookings
   where idempotency_key='team-booking-rpc-test'),
  date_trunc('day',now()+interval '12 days')+interval '12 hours',
  'team booking retains its attribution after rescheduling'
);
reset role;

insert into public.bookings
  (id,resource_id,member_id,starts_at,ends_at,access_source,organization_id)
select '31000000-0000-4000-8000-000000000003',resource.id,
  '30000000-0000-4000-8000-000000000003',now()-interval '10 minutes',
  now()+interval '50 minutes','team',member.organization_id
from public.resources resource
cross join public.organization_members member
where resource.slug='builder-pod-01'
  and member.user_id='30000000-0000-4000-8000-000000000003';
insert into public.attendance_sessions
  (user_id,booking_id,resource_id,location_id,checked_in_at)
select booking.member_id,booking.id,booking.resource_id,resource.location_id,
  now()-interval '5 minutes'
from public.bookings booking
join public.resources resource on resource.id=booking.resource_id
where booking.id='31000000-0000-4000-8000-000000000003';

select is(private.has_booking_access(
  '30000000-0000-4000-8000-000000000003','team',
  (select organization_id from public.organization_members
   where user_id='30000000-0000-4000-8000-000000000003'),
  now(),now()+interval '1 hour'),true,
  'team access source is independently eligible');
select is(private.has_booking_access(
  '30000000-0000-4000-8000-000000000003','personal',null,
  now(),now()+interval '1 hour'),true,
  'personal membership can coexist with a team seat');

select set_config('request.jwt.claims',
 '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_team_usage(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'))),
  3,'team admin sees only team-attributed usage');
select is(
  (select attended_hours from public.list_team_usage(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'))
   where starts_at=date_trunc('hour',now()+interval '7 days')),
  0::numeric,'team report distinguishes attendance from booked hours');
select is(
  (select count(*)::integer from public.bookings
   where member_id='30000000-0000-4000-8000-000000000003'),
  0,'team admin cannot read teammate raw bookings or private notes');
select lives_ok(
  $$select public.team_remove_member(
    (select organization_id from public.organization_members
     where user_id='30000000-0000-4000-8000-000000000002'),
    '30000000-0000-4000-8000-000000000003')$$,
  'admin can remove teammate and cancel future team reservations');

reset role;
select is(
  (select status::text from public.bookings
   where id='31000000-0000-4000-8000-000000000001'),
  'cancelled','future team booking remains in history as cancelled');
select is(
  (select released_at is not null from public.resource_reservations
   where booking_id='31000000-0000-4000-8000-000000000001'),
  true,'removed teammate reservation is released');
select is(
  (select status::text from public.bookings
   where id='31000000-0000-4000-8000-000000000002'),
  'confirmed','personal booking remains after team removal');

update public.memberships set status='suspended'
where user_id='30000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*)::integer from public.list_my_team_access()),0,
  'removed teammate has no team access and personal membership is suspended');
select lives_ok(
  $$select public.create_checkin_intent(
    '31000000-0000-4000-8000-000000000003','check_out')$$,
  'removed teammate can still start checkout of an active session'
);

select * from finish();
rollback;
