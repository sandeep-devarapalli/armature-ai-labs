begin;
-- Enable mock activation only inside this rolled-back local fixture.
update public.booking_policy_settings set mock_grants_enabled=true;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table('public', 'profiles', 'profiles table exists');
select has_table(
  'public',
  'resource_reservations',
  'resource reservation ledger exists'
);
select has_function('public', 'create_booking', 'atomic booking RPC exists');
select hasnt_column(
  'public',
  'public_member_profiles',
  'phone',
  'public profiles exclude phone'
);
select hasnt_column(
  'public',
  'public_resources',
  'metadata',
  'public resources exclude operational metadata'
);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'approved@example.test',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'pending@example.test',
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'staff@example.test',
    now()
  );

update public.profiles
set
  handle = case id
    when '20000000-0000-4000-8000-000000000001' then 'approved-member'
    when '20000000-0000-4000-8000-000000000002' then 'pending-member'
    else 'staff-member'
  end,
  display_name = case id
    when '20000000-0000-4000-8000-000000000001' then 'Approved Member'
    when '20000000-0000-4000-8000-000000000002' then 'Pending Member'
    else 'Staff Member'
  end,
  phone = '+91 99999 00000',
  emergency_contact = '{"name":"Private contact","phone":"+91 88888 00000"}'
where id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003'
);

update public.memberships
set status = 'active', starts_at = now() - interval '1 day'
where user_id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003'
);
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select u.id,'Fixture Member',u.email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved'
from auth.users u join public.memberships m on m.user_id=u.id where u.id::text like '20000000%' and m.status='active';
insert into public.paid_access_entitlements(user_id,product_id,starts_at,ends_at,seats,price_paise,granted_by)
select u.id,p.id,now()-interval '1 day',now()+interval '30 days',1,0,u.id
from auth.users u join public.memberships m on m.user_id=u.id cross join public.booking_products p
where u.id::text like '20000000%' and m.status='active' and p.code='workspace-day';


insert into public.membership_applications (user_id)
values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');

insert into public.staff_roles (user_id, role, granted_by)
values (
  '20000000-0000-4000-8000-000000000003',
  'admin',
  '20000000-0000-4000-8000-000000000003'
);

insert into public.resource_booking_policies(resource_id,kind) select id,'workspace' from public.resources where slug='builder-pod-02';
set local role anon;

select is(
  (select count(*)::integer from public.public_member_profiles),
  2,
  'anonymous users see only approved public profiles'
);
select ok(
  (select count(*) > 0 from public.public_resources),
  'anonymous users can read active public resources'
);
select throws_ok(
  $$select phone from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'anonymous users cannot query private profiles'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1","user_metadata":{"staff_role":"super_admin"}}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.profiles),
  1,
  'pending member sees only their own private profile'
);
select is(
  (select count(*)::integer from public.memberships),
  1,
  'pending member sees only their own membership'
);
select is(
  public.has_staff_role(null),
  false,
  'profile and JWT metadata cannot grant staff access'
);
select throws_ok(
  $$insert into public.staff_roles (user_id, role) values ('20000000-0000-4000-8000-000000000002', 'super_admin')$$,
  '42501',
  'permission denied for table staff_roles',
  'member cannot self-assign a staff role'
);
select throws_ok(
  $$select public.create_booking(
    (select id from public.public_resources where slug='builder-pod-02'),
    date_trunc('hour', now() + interval '1 day'),
    date_trunc('hour', now() + interval '1 day') + interval '1 hour',
    '{}',
    null,
    'pending-member-attempt'
  )$$,
  '42501',
  'Approved basic membership and dated paid access required',
  'pending member cannot create a booking'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select is(
  public.has_staff_role(array['admin']::public.staff_role[]),
  true,
  'protected staff role grants staff access'
);
select is(
  (select count(*)::integer from public.membership_applications),
  2,
  'staff can inspect all membership applications'
);

reset role;

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity = false
  ),
  0,
  'every exposed public table has RLS enabled'
);

select * from finish();
rollback;
