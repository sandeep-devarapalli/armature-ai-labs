begin;
-- Enable mock activation only inside this rolled-back local fixture.
update public.booking_policy_settings set mock_grants_enabled=true;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table('public', 'locker_plans', 'locker plans table exists');
select has_table('public', 'lockers', 'physical lockers table exists');
select has_table('public', 'locker_assignments', 'locker assignments table exists');
select has_table('public', 'consumable_skus', 'consumable SKU table exists');
select has_table('public', 'consumable_orders', 'consumable orders table exists');
select has_table('public', 'consumable_order_items', 'consumable order items table exists');
select has_table('public', 'toolkit_templates', 'toolkit templates table exists');
select has_table('public', 'toolkit_kits', 'serialized toolkit kits table exists');
select has_table('public', 'toolkit_rental_sessions', 'toolkit rental sessions table exists');
select has_table('public', 'toolkit_rental_items', 'toolkit rental items table exists');
select has_table('public', 'toolkit_condition_evidence', 'toolkit condition evidence table exists');
select has_view('public', 'public_locker_catalog', 'coarse public locker catalog exists');
select has_view('public', 'public_consumable_catalog', 'coarse public consumable catalog exists');
select has_view('public', 'public_toolkit_catalog', 'coarse public toolkit catalog exists');
select ok(
  to_regprocedure(
    'public.request_locker_subscription(text,public.locker_plan_period)'
  ) is not null,
  'preferred locker request RPC signature exists'
);
select ok(
  to_regprocedure(
    'public.assign_locker_subscription(uuid,uuid)'
  ) is not null,
  'preferred staff locker assignment RPC signature exists'
);
select ok(
  to_regprocedure(
    'public.extend_locker_subscription(uuid,public.locker_plan_period)'
  ) is not null,
  'preferred locker extension RPC signature exists'
);
select ok(
  to_regprocedure(
    'public.release_locker_subscription(uuid)'
  ) is not null,
  'preferred locker release RPC signature exists'
);
select ok(
  to_regprocedure('public.create_consumable_order(jsonb)') is not null,
  'preferred consumable order RPC signature exists'
);
select ok(
  to_regprocedure(
    'public.set_consumable_order_status(uuid,public.consumable_order_status)'
  ) is not null,
  'preferred consumable staff status RPC signature exists'
);
select ok(
  to_regprocedure('public.start_toolkit_rental(text,interval)') is not null,
  'preferred toolkit rental start RPC signature exists'
);
select ok(
  to_regprocedure('public.return_toolkit_rental(uuid,text)') is not null,
  'preferred toolkit return RPC signature exists'
);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  (
    '26000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'maker-member@example.test',
    now()
  ),
  (
    '26000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'maker-other@example.test',
    now()
  ),
  (
    '26000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'maker-staff@example.test',
    now()
  ),
  (
    '26000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'maker-pending@example.test',
    now()
  );

update public.memberships
set status = 'active', starts_at = now() - interval '1 day'
where user_id in (
  '26000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000002',
  '26000000-0000-4000-8000-000000000003'
);
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select u.id,'Fixture Member',u.email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved'
from auth.users u join public.memberships m on m.user_id=u.id where u.id::text like '26000000%' and m.status='active';
insert into public.paid_access_entitlements(user_id,product_id,starts_at,ends_at,seats,price_paise,granted_by)
select u.id,p.id,now()-interval '1 day',now()+interval '30 days',1,0,u.id
from auth.users u join public.memberships m on m.user_id=u.id cross join public.booking_products p
where u.id::text like '26000000%' and m.status='active' and p.code='workspace-day';


insert into public.staff_roles (user_id, role, granted_by)
values (
  '26000000-0000-4000-8000-000000000003',
  'operations',
  '26000000-0000-4000-8000-000000000003'
);

insert into public.locations (id, slug, name, timezone, active)
values (
  '26000000-0000-4000-8000-000000000010',
  'maker-services-test-lab',
  'Maker services test lab',
  'Asia/Kolkata',
  true
);

insert into public.resources(id,location_id,slug,name,kind,capacity)
values('26000000-0000-4000-8000-000000000020','26000000-0000-4000-8000-000000000010','fixture-26000000','Fixture workspace','workspace',3);
insert into public.resource_booking_policies(resource_id,kind) values('26000000-0000-4000-8000-000000000020','workspace');
update public.paid_access_entitlements set resource_id='26000000-0000-4000-8000-000000000020' where user_id::text like '26000000%';
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at) select '26000000-0000-4000-8000-000000000020',n,'09:00','17:00' from generate_series(0,6) n;
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at,status)
select ('26000000-0000-4000-8000-'||lpad((20+n)::text,12,'0'))::uuid,'26000000-0000-4000-8000-000000000020',
('26000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
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
    '26000000-0000-4000-8000-000000000021',
    '26000000-0000-4000-8000-000000000020',
    '26000000-0000-4000-8000-000000000011',
    '26000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000010',
    'active',
    now()
  ),
  (
    '26000000-0000-4000-8000-000000000022',
    '26000000-0000-4000-8000-000000000020',
    '26000000-0000-4000-8000-000000000012',
    '26000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000010',
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
  '26000000-0000-4000-8000-000000000013',
  '26000000-0000-4000-8000-000000000010',
  'MAKER_TEST',
  'Maker services test store',
  true
);

insert into public.lockers (
  id,
  location_id,
  code,
  size_label,
  active,
  metadata
)
values
  (
    '26000000-0000-4000-8000-000000000020',
    '26000000-0000-4000-8000-000000000010',
    'ARM-LKR-TEST01',
    'Test size',
    true,
    '{"offering_slug":"small-parts-locker"}'
  ),
  (
    '26000000-0000-4000-8000-000000000021',
    '26000000-0000-4000-8000-000000000010',
    'ARM-LKR-TEST02',
    'Test size',
    true,
    '{"offering_slug":"medium-project-locker"}'
  );

insert into public.components (
  id,
  slug,
  name,
  description,
  category,
  inventory_kind,
  unit,
  target_quantity,
  reorder_threshold
)
values (
  '26000000-0000-4000-8000-000000000030',
  'maker-test-hookup-wire',
  'Maker test hookup wire',
  'Low-cost consumable used only by maker service database tests.',
  'Consumables',
  'consumable',
  'metre',
  20,
  3
);

insert into public.inventory_lots (
  id,
  component_id,
  inventory_location_id,
  lot_code,
  quantity_on_hand
)
values (
  '26000000-0000-4000-8000-000000000031',
  '26000000-0000-4000-8000-000000000030',
  '26000000-0000-4000-8000-000000000013',
  'MAKER-WIRE-TEST-LOT',
  10
);

insert into public.consumable_skus (
  id,
  component_id,
  inventory_lot_id,
  sku_code,
  name,
  description,
  order_unit,
  quantity_per_order_unit,
  reference_price_inr_including_gst
)
values (
  '26000000-0000-4000-8000-000000000032',
  '26000000-0000-4000-8000-000000000030',
  '26000000-0000-4000-8000-000000000031',
  'ARM-CNS-TESTWIRE',
  'Hookup wire length',
  'A small quantity of hookup wire collected at the lab desk.',
  'length',
  1,
  null
);

insert into public.toolkit_templates (
  id,
  slug,
  name,
  description,
  safety_notes
)
values (
  '26000000-0000-4000-8000-000000000040',
  'maker-test-electronics-kit',
  'Maker test electronics kit',
  'A database-test toolkit representing a standard handheld electronics kit.',
  'Return every required item before leaving the lab.'
);

insert into public.toolkit_template_items (
  id,
  toolkit_template_id,
  item_name,
  quantity,
  required,
  display_order
)
values
  (
    '26000000-0000-4000-8000-000000000041',
    '26000000-0000-4000-8000-000000000040',
    'Test screwdriver',
    1,
    true,
    1
  ),
  (
    '26000000-0000-4000-8000-000000000042',
    '26000000-0000-4000-8000-000000000040',
    'Test soldering tool',
    1,
    true,
    2
  );

insert into public.toolkit_kits (
  id,
  toolkit_template_id,
  inventory_location_id,
  kit_tag,
  status
)
values (
  '26000000-0000-4000-8000-000000000043',
  '26000000-0000-4000-8000-000000000040',
  '26000000-0000-4000-8000-000000000013',
  'ARM-KIT-000001',
  'available'
);

insert into public.toolkit_items (
  id,
  toolkit_kit_id,
  template_item_id,
  item_tag,
  name,
  required,
  status
)
values
  (
    '26000000-0000-4000-8000-000000000044',
    '26000000-0000-4000-8000-000000000043',
    '26000000-0000-4000-8000-000000000041',
    'ARM-TLK-000001',
    'Test screwdriver',
    true,
    'available'
  ),
  (
    '26000000-0000-4000-8000-000000000045',
    '26000000-0000-4000-8000-000000000043',
    '26000000-0000-4000-8000-000000000042',
    'ARM-TLK-000002',
    'Test soldering tool',
    true,
    'available'
  );

set local role anon;

select is(
  (select count(*)::integer from public.public_locker_catalog),
  9,
  'anonymous visitor sees three terms for each locker size'
);
select is(
  (
    select count(*)::integer
    from public.public_locker_catalog
    where price_inr_including_gst is null
  ),
  9,
  'locker plan pricing remains a placeholder'
);
select is(
  (
    select availability_status
    from public.public_consumable_catalog
    where sku_code = 'ARM-CNS-TESTWIRE'
  ),
  'available',
  'anonymous visitor sees only coarse consumable availability'
);
select is(
  (
    select availability_status
    from public.public_toolkit_catalog
    where slug = 'maker-test-electronics-kit'
  ),
  'low_stock',
  'anonymous visitor sees coarse toolkit availability'
);
select throws_ok(
  $$select code from public.lockers$$,
  '42501',
  'permission denied for table lockers',
  'anonymous visitor cannot read physical locker labels'
);
select throws_ok(
  $$select quantity_on_hand from public.inventory_lots$$,
  '42501',
  'permission denied for table inventory_lots',
  'anonymous visitor cannot read exact consumable stock'
);
select throws_ok(
  $$select kit_tag from public.toolkit_kits$$,
  '42501',
  'permission denied for table toolkit_kits',
  'anonymous visitor cannot read serialized toolkit tags'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.request_locker_subscription('small-parts-locker', 'week')$$,
  '42501',
  'active membership is required',
  'pending member cannot request a locker'
);
select throws_ok(
  $$select public.create_consumable_order('[{"sku_code":"ARM-CNS-TESTWIRE","quantity":1}]'::jsonb)$$,
  '42501',
  'active membership is required',
  'pending member cannot request consumables'
);
select throws_ok(
  $$select public.start_toolkit_rental('maker-test-electronics-kit', interval '4 hours')$$,
  '42501',
  'active membership is required',
  'pending member cannot start a toolkit rental'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

create temporary table member_locker_request as
select public.request_locker_subscription('small-parts-locker', 'week') as id;
grant select on member_locker_request to authenticated;

select is(
  (
    select status::text
    from public.locker_assignments
    where id = (select id from member_locker_request)
  ),
  'requested',
  'active member creates a locker subscription request'
);
select throws_ok(
  $$select public.assign_locker_subscription(
    (select id from member_locker_request),
    '26000000-0000-4000-8000-000000000020'
  )$$,
  '42501',
  'operations staff role required',
  'member cannot assign a physical locker'
);

create temporary table member_consumable_order as
select public.create_consumable_order(
  '[{"sku_code":"ARM-CNS-TESTWIRE","quantity":3}]'::jsonb
) as id;
grant select on member_consumable_order to authenticated;

select is(
  (
    select status::text || ':' || collection_method
    from public.consumable_orders
    where id = (select id from member_consumable_order)
  ),
  'submitted:front_desk',
  'member consumable order is a submitted front-desk collection request'
);
select is(
  (
    select quantity
    from public.consumable_order_items
    where order_id = (select id from member_consumable_order)
  ),
  3,
  'atomic consumable order stores its requested line'
);

create temporary table member_toolkit_rental as
select public.start_toolkit_rental(
  'maker-test-electronics-kit',
  interval '4 hours'
) as id;
grant select on member_toolkit_rental to authenticated;

select lives_ok(
  $$select public.add_toolkit_rental_item(
    (select id from member_toolkit_rental),
    'ARM-TLK-000001',
    'Checked before use'
  )$$,
  'member scans the first toolkit item'
);
select throws_ok(
  $$select public.complete_toolkit_rental(
    (select id from member_toolkit_rental)
  )$$,
  '22023',
  'required toolkit items are missing',
  'rental cannot complete with a required tool missing'
);
select lives_ok(
  $$select public.add_toolkit_rental_item(
    (select id from member_toolkit_rental),
    'ARM-TLK-000002',
    'Checked before use'
  )$$,
  'member scans the second toolkit item'
);
select lives_ok(
  $$select public.complete_toolkit_rental(
    (select id from member_toolkit_rental)
  )$$,
  'member completes a fully scanned toolkit rental'
);

insert into public.toolkit_condition_evidence (
  toolkit_rental_session_id,
  toolkit_item_id,
  uploaded_by,
  evidence_phase,
  storage_path,
  retention_class,
  retain_until
)
values (
  (select id from member_toolkit_rental),
  '26000000-0000-4000-8000-000000000044',
  '26000000-0000-4000-8000-000000000001',
  'checkout',
  '26000000-0000-4000-8000-000000000001/toolkits/'
    || (select id from member_toolkit_rental)::text
    || '/checkout.webp',
  'routine',
  now()
);

select is(
  (
    select extract(day from retain_until - captured_at)::integer
    from public.toolkit_condition_evidence
    where toolkit_rental_session_id = (select id from member_toolkit_rental)
  ),
  30,
  'routine toolkit condition evidence receives 30-day retention metadata'
);

reset role;

select throws_ok(
  $$
    update public.attendance_sessions
    set status = 'closed', checked_out_at = now()
    where id = '26000000-0000-4000-8000-000000000011'
  $$,
  '23514',
  'attendance cannot close while lab-only inventory holdings are open',
  'open toolkit rental blocks attendance checkout'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.locker_assignments),
  0,
  'another member cannot read the first member locker request'
);
select is(
  (select count(*)::integer from public.consumable_orders),
  0,
  'another member cannot read the first member consumable order'
);
select is(
  (select count(*)::integer from public.toolkit_rental_sessions),
  0,
  'another member cannot read the first member toolkit rental'
);
select is(
  (select count(*)::integer from public.toolkit_condition_evidence),
  0,
  'another member cannot read private toolkit evidence metadata'
);
select throws_ok(
  $$select public.start_toolkit_rental(
    'maker-test-electronics-kit',
    interval '4 hours'
  )$$,
  '55000',
  'toolkit is not available at this location',
  'second member cannot start the already-active serialized toolkit'
);

create temporary table member_two_locker_request as
select public.request_locker_subscription(
  'medium-project-locker',
  'month'
) as id;
grant select on member_two_locker_request to authenticated;

reset role;

select throws_ok(
  $$
    insert into public.toolkit_rental_sessions (
      member_id,
      attendance_session_id,
      toolkit_kit_id,
      status,
      requested_period,
      idempotency_key
    )
    values (
      '26000000-0000-4000-8000-000000000002',
      '26000000-0000-4000-8000-000000000012',
      '26000000-0000-4000-8000-000000000043',
      'open',
      interval '4 hours',
      'duplicate-toolkit-rental'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "toolkit_rentals_one_active_kit"',
  'partial uniqueness is the concurrency guard for one active serialized toolkit'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.assign_locker_subscription(
    (select id from member_locker_request),
    '26000000-0000-4000-8000-000000000020'
  )$$,
  'staff atomically assigns and activates the physical locker'
);
select is(
  (
    select assignment.status::text || ':' || locker.code
    from public.locker_assignments assignment
    join public.lockers locker on locker.id = assignment.locker_id
    where assignment.id = (select id from member_locker_request)
  ),
  'active:ARM-LKR-TEST01',
  'staff assignment records the physical locker label'
);
select throws_ok(
  $$select public.assign_locker_subscription(
    (select id from member_two_locker_request),
    '26000000-0000-4000-8000-000000000020'
  )$$,
  '22023',
  'physical locker size does not match the requested offering',
  'staff cannot assign a small locker to a medium locker request'
);
select lives_ok(
  $$select public.assign_locker_subscription(
    (select id from member_two_locker_request),
    '26000000-0000-4000-8000-000000000021'
  )$$,
  'staff can assign a physical locker that matches the requested size'
);

select lives_ok(
  $$select public.set_consumable_order_status(
    (select id from member_consumable_order),
    'ready'
  )$$,
  'staff marks the consumable order ready for desk collection'
);
select lives_ok(
  $$select public.set_consumable_order_status(
    (select id from member_consumable_order),
    'fulfilled'
  )$$,
  'staff fulfills the consumable order at the desk'
);
select is(
  (
    select quantity_on_hand
    from public.inventory_lots
    where id = '26000000-0000-4000-8000-000000000031'
  ),
  7::numeric,
  'front-desk fulfillment atomically decrements consumable stock'
);

reset role;

insert into public.locker_assignments (
  id,
  member_id,
  locker_plan_id,
  locker_id,
  status,
  starts_at,
  ends_at,
  idempotency_key,
  assigned_by,
  assigned_at
)
select
  '26000000-0000-4000-8000-000000000050',
  '26000000-0000-4000-8000-000000000002',
  assignment.locker_plan_id,
  '26000000-0000-4000-8000-000000000020',
  'reserved',
  assignment.ends_at,
  assignment.ends_at + interval '7 days',
  'adjacent-locker-assignment',
  '26000000-0000-4000-8000-000000000003',
  now()
from public.locker_assignments assignment
where assignment.id = (select id from member_locker_request);

select lives_ok(
  $$
    select 1
    from public.locker_assignments
    where id = '26000000-0000-4000-8000-000000000050'
  $$,
  'adjacent half-open locker assignments do not overlap'
);
select throws_ok(
  $$
    insert into public.locker_assignments (
      member_id,
      locker_plan_id,
      locker_id,
      status,
      starts_at,
      ends_at,
      idempotency_key,
      assigned_by,
      assigned_at
    )
    select
      '26000000-0000-4000-8000-000000000002',
      assignment.locker_plan_id,
      assignment.locker_id,
      'reserved',
      assignment.starts_at + interval '1 hour',
      assignment.ends_at - interval '1 hour',
      'overlapping-locker-assignment',
      '26000000-0000-4000-8000-000000000003',
      now()
    from public.locker_assignments assignment
    where assignment.id = (select id from member_locker_request)
  $$,
  '23P01',
  'conflicting key value violates exclusion constraint "locker_assignments_no_overlap"',
  'GiST exclusion is the concurrency guard for overlapping locker assignments'
);

insert into public.consumable_orders (
  id,
  member_id,
  status,
  idempotency_key,
  submitted_at
)
values
  (
    '26000000-0000-4000-8000-000000000060',
    '26000000-0000-4000-8000-000000000001',
    'submitted',
    'stock-race-order-one',
    now()
  ),
  (
    '26000000-0000-4000-8000-000000000061',
    '26000000-0000-4000-8000-000000000002',
    'submitted',
    'stock-race-order-two',
    now()
  );

insert into public.consumable_order_items (
  order_id,
  consumable_sku_id,
  quantity
)
values
  (
    '26000000-0000-4000-8000-000000000060',
    '26000000-0000-4000-8000-000000000032',
    4
  ),
  (
    '26000000-0000-4000-8000-000000000061',
    '26000000-0000-4000-8000-000000000032',
    4
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"26000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.set_consumable_order_status(
    '26000000-0000-4000-8000-000000000060',
    'fulfilled'
  )$$,
  'first competing consumable order claims the row-locked stock'
);
select throws_ok(
  $$select public.set_consumable_order_status(
    '26000000-0000-4000-8000-000000000061',
    'fulfilled'
  )$$,
  '23514',
  'insufficient consumable stock',
  'second competing order cannot oversubscribe consumable stock'
);

reset role;
delete from public.locker_assignments
where id = '26000000-0000-4000-8000-000000000050';

select set_config(
  'request.jwt.claims',
  '{"sub":"26000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.extend_locker_subscription(
    (select id from member_locker_request),
    'week'
  )$$,
  'member can extend their active locker using a plan term'
);
select lives_ok(
  $$select public.release_locker_subscription(
    (select id from member_locker_request)
  )$$,
  'member can release their own locker subscription'
);
select lives_ok(
  $$select public.return_toolkit_rental(
    (select id from member_toolkit_rental),
    'Returned complete at the desk'
  )$$,
  'member returns the complete toolkit'
);

reset role;
select lives_ok(
  $$
    update public.attendance_sessions
    set status = 'closed', checked_out_at = now()
    where id = '26000000-0000-4000-8000-000000000011'
  $$,
  'attendance can close after the toolkit is returned'
);
select is(
  (
    select status::text
    from public.toolkit_kits
    where id = '26000000-0000-4000-8000-000000000043'
  ),
  'available',
  'returned serialized toolkit becomes available again'
);
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
