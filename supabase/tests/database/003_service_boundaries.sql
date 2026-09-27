begin;
-- Enable mock activation only inside this rolled-back local fixture.
update public.booking_policy_settings set mock_grants_enabled=true;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values (
  '24000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'active-and-suspended@example.test',
  now()
);

update public.profiles
set handle = 'active-test-member', display_name = 'Active Test Member'
where id = '24000000-0000-4000-8000-000000000001';

update public.memberships
set status = 'active', starts_at = now() - interval '1 day'
where user_id = '24000000-0000-4000-8000-000000000001';
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select u.id,'Fixture Member',u.email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved'
from auth.users u join public.memberships m on m.user_id=u.id where u.id::text like '24000000%' and m.status='active';
insert into public.paid_access_entitlements(user_id,product_id,starts_at,ends_at,seats,price_paise,granted_by)
select u.id,p.id,now()-interval '1 day',now()+interval '30 days',1,0,u.id
from auth.users u join public.memberships m on m.user_id=u.id cross join public.booking_products p
where u.id::text like '24000000%' and m.status='active' and p.code='workspace-day';


insert into public.member_certifications (
  member_id,
  certification_type_id,
  issued_by,
  expires_at
)
select
  '24000000-0000-4000-8000-000000000001',
  certification.id,
  '24000000-0000-4000-8000-000000000001',
  now() + interval '1 year'
from public.certification_types certification
where certification.slug = 'lab-orientation';

insert into public.resource_booking_policies(resource_id,kind) select id,'workspace' from public.resources where slug in ('builder-pod-02','builder-pod-03');
update public.paid_access_entitlements set resource_id=(select id from public.resources where slug='builder-pod-02') where user_id='24000000-0000-4000-8000-000000000001';

create temporary table valid_booking_slot as
select
  (
    candidate_date::date + time '10:00'
  ) at time zone 'Asia/Kolkata' as starts_at,
  (
    candidate_date::date + time '11:00'
  ) at time zone 'Asia/Kolkata' as ends_at
from generate_series(current_date + 1, current_date + 7, interval '1 day') candidate_date
where extract(dow from candidate_date) between 1 and 5
order by candidate_date
limit 1;

grant select on valid_booking_slot to authenticated;

select is(
  has_function_privilege(
    'anon',
    'public.redeem_checkin_intent(text,uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous role cannot execute kiosk redemption'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.redeem_checkin_intent(text,uuid)',
    'EXECUTE'
  ),
  false,
  'member role cannot execute kiosk redemption'
);
select is(
  has_function_privilege(
    'service_role',
    'public.redeem_checkin_intent(text,uuid)',
    'EXECUTE'
  ),
  true,
  'service role can execute kiosk redemption'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.run_attendance_maintenance()',
    'EXECUTE'
  ),
  false,
  'member role cannot run system maintenance'
);
select is(
  has_function_privilege(
    'service_role',
    'public.run_attendance_maintenance()',
    'EXECUTE'
  ),
  true,
  'service role can run system maintenance'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.create_booking(
      (select id from public.public_resources where slug = 'builder-pod-02'),
      (select starts_at from valid_booking_slot),
      (select ends_at from valid_booking_slot),
      '{}',
      null,
      'active-member-booking'
    )
  $$,
  'active certified member can create a valid booking'
);
select is(
  (select count(*)::integer from public.bookings),
  1,
  'active member sees their own booking'
);
select is(
  (select count(*)::integer from public.kiosk_devices),
  0,
  'ordinary member cannot see kiosk devices'
);

reset role;
update public.memberships
set status = 'suspended', suspended_reason = 'RLS test'
where user_id = '24000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.create_booking(
      (select id from public.public_resources where slug = 'builder-pod-03'),
      (select starts_at from valid_booking_slot),
      (select ends_at from valid_booking_slot),
      '{}',
      null,
      'suspended-member-booking'
    )
  $$,
  '42501',
  'Approved basic membership and dated paid access required',
  'suspended member cannot create a booking'
);

reset role;

insert into public.kiosk_devices (
  id,
  location_id,
  name,
  public_key_jwk,
  status,
  enrolled_at
)
select
  '24000000-0000-4000-8000-000000000002',
  location.id,
  'Replay test kiosk',
  '{"kty":"EC","crv":"P-256","x":"test-x","y":"test-y"}',
  'active',
  now()
from public.locations location
where location.slug = 'hsr-layout';

insert into public.kiosk_request_nonces (
  device_id,
  nonce,
  expires_at
)
values (
  '24000000-0000-4000-8000-000000000002',
  'nonce-value-000000000001',
  now() + interval '5 minutes'
);

select throws_ok(
  $$
    insert into public.kiosk_request_nonces (
      device_id,
      nonce,
      expires_at
    )
    values (
      '24000000-0000-4000-8000-000000000002',
      'nonce-value-000000000001',
      now() + interval '5 minutes'
    )
  $$,
  '23505'
);

select * from finish();
rollback;
