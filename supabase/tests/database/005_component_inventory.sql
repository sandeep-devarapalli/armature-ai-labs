begin;
-- Enable mock activation only inside this rolled-back local fixture.
update public.booking_policy_settings set mock_grants_enabled=true;

create extension if not exists pgtap with schema extensions;

select plan(45);

select has_table('public', 'components', 'components table exists');
select has_table('public', 'component_requests', 'component requests table exists');
select has_table('public', 'asset_units', 'serialized assets table exists');
select has_table('public', 'cabinet_events', 'smart-cabinet event ledger exists');
select has_function('public', 'vote_component_request', 'atomic vote RPC exists');
select has_function('public', 'begin_inventory_checkout', 'atomic checkout begin RPC exists');
select has_function('public', 'set_component_request_status', 'staff request decision RPC exists');
select has_view('public', 'member_checkout_assets', 'member checkout asset view exists');
select has_view('public', 'member_active_cabinets', 'member cabinet directory exists');
select hasnt_column(
  'public',
  'public_component_requests',
  'requester_email',
  'verified request view excludes private email'
);
select hasnt_column(
  'public',
  'public_component_requests',
  'verification_token_hash',
  'verified request view excludes token material'
);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  (
    '25000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'inventory-member@example.test',
    now()
  ),
  (
    '25000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'inventory-other@example.test',
    now()
  ),
  (
    '25000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'inventory-staff@example.test',
    now()
  ),
  (
    '25000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'inventory-pending@example.test',
    now()
  );

update public.memberships
set status = 'active', starts_at = now() - interval '1 day'
where user_id in (
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000002',
  '25000000-0000-4000-8000-000000000003'
);
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select u.id,'Fixture Member',u.email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved'
from auth.users u join public.memberships m on m.user_id=u.id where u.id::text like '25000000%' and m.status='active';
insert into public.paid_access_entitlements(user_id,product_id,starts_at,ends_at,seats,price_paise,granted_by)
select u.id,p.id,now()-interval '1 day',now()+interval '30 days',1,0,u.id
from auth.users u join public.memberships m on m.user_id=u.id cross join public.booking_products p
where u.id::text like '25000000%' and m.status='active' and p.code='workspace-day';


insert into public.staff_roles (user_id, role, granted_by)
values (
  '25000000-0000-4000-8000-000000000003',
  'admin',
  '25000000-0000-4000-8000-000000000003'
);

insert into public.locations (id, slug, name, timezone, active)
values (
  '25000000-0000-4000-8000-000000000010',
  'inventory-test-lab',
  'Inventory test lab',
  'Asia/Kolkata',
  true
);

insert into public.resources(id,location_id,slug,name,kind,capacity)
values('25000000-0000-4000-8000-000000000020','25000000-0000-4000-8000-000000000010','fixture-25000000','Fixture workspace','workspace',3);
insert into public.resource_booking_policies(resource_id,kind) values('25000000-0000-4000-8000-000000000020','workspace');
update public.paid_access_entitlements set resource_id='25000000-0000-4000-8000-000000000020' where user_id::text like '25000000%';
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at) select '25000000-0000-4000-8000-000000000020',n,'09:00','17:00' from generate_series(0,6) n;
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at,status)
select ('25000000-0000-4000-8000-'||lpad((20+n)::text,12,'0'))::uuid,'25000000-0000-4000-8000-000000000020',
('25000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
((now() at time zone 'Asia/Kolkata')::date+time '09:00') at time zone 'Asia/Kolkata',
((now() at time zone 'Asia/Kolkata')::date+time '17:00') at time zone 'Asia/Kolkata','confirmed' from generate_series(1,2) n;

insert into public.attendance_sessions (
  booking_id,
  resource_id,
  id,
  user_id,
  location_id,
  status,
  checked_in_at
)
values
  (
    '25000000-0000-4000-8000-000000000021',
    '25000000-0000-4000-8000-000000000020',
    '25000000-0000-4000-8000-000000000011',
    '25000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000010',
    'active',
    now()
  ),
  (
    '25000000-0000-4000-8000-000000000022',
    '25000000-0000-4000-8000-000000000020',
    '25000000-0000-4000-8000-000000000012',
    '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000010',
    'active',
    now()
  );

insert into public.inventory_locations (
  id,
  lab_location_id,
  code,
  name,
  member_visible
)
values (
  '25000000-0000-4000-8000-000000000013',
  '25000000-0000-4000-8000-000000000010',
  'TEST_CAGE',
  'Test component cage',
  true
);

insert into public.components (
  id,
  slug,
  name,
  description,
  category,
  inventory_kind,
  target_quantity,
  reorder_threshold
)
values (
  '25000000-0000-4000-8000-000000000014',
  'inventory-test-sensor',
  'Inventory test sensor',
  'Serialized sensor used by database tests.',
  'Sensors',
  'serialized_reusable',
  2,
  1
);

insert into public.inventory_lots (
  id,
  component_id,
  inventory_location_id,
  lot_code,
  quantity_on_hand
)
values (
  '25000000-0000-4000-8000-000000000015',
  '25000000-0000-4000-8000-000000000014',
  '25000000-0000-4000-8000-000000000013',
  'TEST-LOT-001',
  0
);

insert into public.asset_units (
  id,
  component_id,
  inventory_lot_id,
  inventory_location_id,
  asset_tag,
  serial_number
)
values (
  '25000000-0000-4000-8000-000000000016',
  '25000000-0000-4000-8000-000000000014',
  '25000000-0000-4000-8000-000000000015',
  '25000000-0000-4000-8000-000000000013',
  'ARM-SEN-000001',
  'TEST-SERIAL-001'
);

create temporary table request_verification as
select response
from (
  select public.create_public_component_request(
    'private-requester@example.test',
    'Requested force sensor',
    'https://example.test/force-sensor',
    'Needed to validate force-control experiments safely.',
    2,
    'project_blocking',
    '10000_to_50000',
    'Please review the range.',
    null
  ) as response
) created;

grant select on request_verification to authenticated;

select is(
  has_function_privilege(
    'anon',
    'public.create_public_component_request(text,text,text,text,integer,public.component_request_urgency,public.component_request_budget,text,uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot insert requests through the service RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.create_public_component_request(text,text,text,text,integer,public.component_request_urgency,public.component_request_budget,text,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot bypass request verification'
);
select is(
  has_function_privilege(
    'service_role',
    'public.create_public_component_request(text,text,text,text,integer,public.component_request_urgency,public.component_request_budget,text,uuid)',
    'EXECUTE'
  ),
  true,
  'service role can create a request after edge validation'
);
select is(
  (
    select count(*)::integer
    from public.public_component_requests
    where id = (
      select (response ->> 'request_id')::uuid
      from request_verification
    )
  ),
  0,
  'unverified request is not published'
);

select public.verify_component_request(
  (select (response ->> 'request_id')::uuid from request_verification),
  (select response ->> 'verification_token' from request_verification)
);

select is(
  (
    select count(*)::integer
    from public.public_component_requests
    where id = (
      select (response ->> 'request_id')::uuid
      from request_verification
    )
  ),
  1,
  'verified request is published'
);
select is(
  (
    select verification_token_hash is null
      and verified_at is not null
      and is_published
    from public.component_requests
    where id = (
      select (response ->> 'request_id')::uuid
      from request_verification
    )
  ),
  true,
  'verification consumes private token material'
);
select throws_ok(
  format(
    'select public.verify_component_request(%L, %L)',
    (select (response ->> 'request_id')::uuid from request_verification),
    (select response ->> 'verification_token' from request_verification)
  ),
  '22023',
  'verification token is expired, invalid, or already used',
  'verification token replay is rejected'
);

create temporary table expired_request_verification as
select public.create_public_component_request(
  'expired-requester@example.test',
  'Expired request sensor',
  'https://example.test/expired-sensor',
  'Needed to verify that expired public request links are rejected.',
  1,
  'nice_to_have',
  'under_2500',
  null,
  null
) as response;

update public.component_requests
set verification_expires_at = now() - interval '1 minute'
where id = (
  select (response ->> 'request_id')::uuid
  from expired_request_verification
);

select throws_ok(
  format(
    'select public.verify_component_request(%L, %L)',
    (select (response ->> 'request_id')::uuid from expired_request_verification),
    (select response ->> 'verification_token' from expired_request_verification)
  ),
  '22023',
  'verification token is expired, invalid, or already used',
  'expired verification token is rejected'
);

select is(
  public.consume_component_request_rate_limit(
    repeat('a', 64),
    2,
    3600
  ),
  true,
  'first public request is inside the rate limit'
);
select is(
  public.consume_component_request_rate_limit(
    repeat('a', 64),
    2,
    3600
  ),
  true,
  'second public request is inside the rate limit'
);
select is(
  public.consume_component_request_rate_limit(
    repeat('a', 64),
    2,
    3600
  ),
  false,
  'request above the rate limit is rejected'
);

set local role anon;

select ok(
  (select count(*) > 0 from public.public_component_catalog),
  'anonymous visitors can read coarse component stock'
);
select throws_ok(
  $$select requester_email from public.component_requests$$,
  '42501',
  'permission denied for table component_requests',
  'anonymous visitors cannot read private request data'
);
select throws_ok(
  $$
    insert into public.component_requests (
      requester_email,
      component_name,
      project_use_case,
      verification_token_hash,
      verification_expires_at
    )
    values (
      'bypass@example.test',
      'Bypass attempt',
      'This direct anonymous insert must be rejected.',
      decode('00', 'hex'),
      now() + interval '1 hour'
    )
  $$,
  '42501',
  'permission denied for table component_requests',
  'anonymous visitors cannot directly insert requests'
);
select throws_ok(
  $$select * from public.member_component_inventory$$,
  '42501',
  'permission denied for view member_component_inventory',
  'anonymous visitors cannot read exact stock'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  public.vote_component_request(
    (select (response ->> 'request_id')::uuid from request_verification),
    true
  ),
  1,
  'active member can vote once'
);
select is(
  public.vote_component_request(
    (select (response ->> 'request_id')::uuid from request_verification),
    true
  ),
  1,
  'repeated vote is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.component_request_votes
    where request_id = (
      select (response ->> 'request_id')::uuid
      from request_verification
    )
  ),
  1,
  'vote uniqueness is enforced'
);
select ok(
  (
    select count(*) = 1
    from public.member_component_inventory
    where component_id = '25000000-0000-4000-8000-000000000014'
      and available_quantity = 1
  ),
  'active member sees exact stock and its member-visible location'
);
select throws_ok(
  $$select public.begin_inventory_checkout(
    '25000000-0000-4000-8000-000000000099',
    'missing-attendance-key'
  )$$,
  '42501',
  'active on-site attendance is required',
  'checkout cannot begin without the member active on site'
);

create temporary table member_checkout as
select public.begin_inventory_checkout(
  '25000000-0000-4000-8000-000000000011',
  'member-checkout-0001'
) as id;

grant select on member_checkout to authenticated;

select lives_ok(
  $$select public.scan_checkout_asset(
    (select id from member_checkout),
    'ARM-SEN-000001'
  )$$,
  'member can atomically scan an available asset'
);
select lives_ok(
  $$select public.complete_inventory_checkout(
    (select id from member_checkout)
  )$$,
  'member can complete a checkout with a scanned asset'
);
select is(
  (
    select count(*)::integer
    from public.member_checkout_assets
    where checkout_session_id = (select id from member_checkout)
      and asset_tag = 'ARM-SEN-000001'
  ),
  1,
  'member can reload asset tags from their own checkout'
);

reset role;

select throws_ok(
  $$
    update public.attendance_sessions
    set status = 'closed', checked_out_at = now()
    where id = '25000000-0000-4000-8000-000000000011'
  $$,
  '23514',
  'attendance cannot close while lab-only inventory holdings are open',
  'attendance checkout is guarded while holdings remain'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

create temporary table other_checkout as
select public.begin_inventory_checkout(
  '25000000-0000-4000-8000-000000000012',
  'other-checkout-0001'
) as id;

grant select on other_checkout to authenticated;

select throws_ok(
  $$select public.scan_checkout_asset(
    (select id from other_checkout),
    'ARM-SEN-000001'
  )$$,
  '55000',
  'asset is not available',
  'a second member cannot check out an already-held asset'
);

reset role;

select throws_ok(
  $$
    insert into public.inventory_movements (
      component_id,
      asset_unit_id,
      checkout_session_id,
      movement_kind,
      actor_user_id
    )
    values (
      '25000000-0000-4000-8000-000000000014',
      '25000000-0000-4000-8000-000000000016',
      (select id from other_checkout),
      'checkout',
      '25000000-0000-4000-8000-000000000002'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "inventory_movements_asset_active_checkout"',
  'partial uniqueness prevents an active serialized asset double checkout'
);

insert into public.inventory_evidence (
  checkout_session_id,
  uploaded_by,
  evidence_kind,
  storage_path,
  retention_class,
  retain_until
)
values
  (
    (select id from member_checkout),
    '25000000-0000-4000-8000-000000000001',
    'checkout',
    '25000000-0000-4000-8000-000000000001/' ||
      (select id from member_checkout)::text || '/routine.webp',
    'routine',
    now()
  ),
  (
    (select id from member_checkout),
    '25000000-0000-4000-8000-000000000001',
    'discrepancy',
    '25000000-0000-4000-8000-000000000001/' ||
      (select id from member_checkout)::text || '/flagged.webp',
    'flagged',
    now()
  );

select is(
  (
    select extract(day from retain_until - captured_at)::integer
    from public.inventory_evidence
    where retention_class = 'routine'
      and checkout_session_id = (select id from member_checkout)
  ),
  30,
  'routine evidence receives 30-day retention metadata'
);
select is(
  (
    select extract(day from retain_until - captured_at)::integer
    from public.inventory_evidence
    where retention_class = 'flagged'
      and checkout_session_id = (select id from member_checkout)
  ),
  180,
  'flagged evidence receives 180-day retention metadata'
);
select is(
  (
    select public
    from storage.buckets
    where id = 'inventory-evidence'
  ),
  false,
  'inventory evidence storage bucket is private'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.inventory_evidence),
  0,
  'another member cannot read private evidence metadata'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select is(
  (
    select requester_email
    from public.component_requests
    where id = (
      select (response ->> 'request_id')::uuid
      from request_verification
    )
  ),
  'private-requester@example.test',
  'staff can read private requester email'
);
select is(
  public.set_component_request_status(
    (select (response ->> 'request_id')::uuid from request_verification),
    'approved',
    'Approved for the shared manipulation bench'
  )::text,
  'approved',
  'staff can atomically approve a verified request'
);
select is(
  (select count(*)::integer from public.inventory_evidence),
  2,
  'staff can inspect private evidence metadata'
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
  'every exposed public table still has RLS enabled'
);

select * from finish();
rollback;
