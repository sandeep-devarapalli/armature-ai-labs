-- Run inside a transaction against a local database and roll it back.
insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('e1000000-0000-4000-8000-000000000001', 'hold-verified@example.test', now(), 'authenticated', 'authenticated'),
  ('e1000000-0000-4000-8000-000000000002', 'hold-unverified@example.test', now(), 'authenticated', 'authenticated');
insert into public.basic_onboarding_applications (user_id, full_name, email, phone, linkedin_url, date_of_birth, status)
values ('e1000000-0000-4000-8000-000000000001', 'Synthetic member', 'hold-verified@example.test', '9999999999', 'https://linkedin.com/in/test', '1990-01-01', 'approved');

insert into public.locations (id, slug, name) values ('e2000000-0000-4000-8000-000000000001', 'checkout-test', 'Checkout test');
insert into public.resources (id, location_id, slug, name, kind) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'desk', 'Test desk', 'workspace'),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'cabin', 'Test cabin', 'room'),
  ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'kit', 'Test kit', 'equipment');
insert into public.resource_booking_policies (resource_id, kind) values
  ('e3000000-0000-4000-8000-000000000001', 'workspace'),
  ('e3000000-0000-4000-8000-000000000002', 'cabin'),
  ('e3000000-0000-4000-8000-000000000003', 'equipment');
delete from public.booking_inventory where code in ('S25', 'C01');
insert into public.booking_inventory values
  ('e3000000-0000-4000-8000-000000000001', 'S25', 'GF', 'GF-10'),
  ('e3000000-0000-4000-8000-000000000002', 'C01', 'GF', 'GF-01');
insert into public.components (id, slug, name, category, inventory_kind) values
  ('e4000000-0000-4000-8000-000000000001', 'checkout-test-kit', 'Test kit', 'Equipment', 'serialized_reusable');
insert into public.inventory_locations (id, lab_location_id, code, name) values
  ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'CHECKOUT-TEST', 'Test inventory');
insert into public.asset_units (id, component_id, inventory_location_id, asset_tag) values
  ('e4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000002', 'ARM-TEST-990005');
insert into public.equipment_rental_units (asset_unit_id, resource_id, commissioned, reason) values
  ('e4000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000003', true, 'Synthetic kit');

do $$
declare
  v_member uuid := 'e1000000-0000-4000-8000-000000000001';
  v_resource uuid;
  v_quote uuid;
  v_block uuid;
  v_start timestamptz := now() + interval '1 day';
  v_end timestamptz := now() + interval '2 days';
  v_deadline timestamptz;
begin
  if has_function_privilege('authenticated', 'public.hold_signed_booking_inventory(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz)', 'EXECUTE')
    or has_function_privilege('anon', 'public.release_signed_booking_inventory(uuid)', 'EXECUTE') then
    raise exception 'Browser role has checkout hold permission';
  end if;
  for v_resource in select id from public.resources where location_id = 'e2000000-0000-4000-8000-000000000001' loop
    v_quote := extensions.gen_random_uuid();
    set local role service_role;
    v_deadline := public.hold_signed_booking_inventory(v_quote, v_resource, v_member, v_start, v_end, now());
    if v_deadline <> now() + interval '30 minutes'
      or public.hold_signed_booking_inventory(v_quote, v_resource, v_member, v_start, v_end, now()) <> v_deadline then
      raise exception 'Signed quote retry changed its deadline';
    end if;
    begin
      perform public.hold_signed_booking_inventory(extensions.gen_random_uuid(), v_resource, v_member, v_start, v_end, now());
      raise exception 'Overlapping checkout hold was accepted';
    exception when exclusion_violation then null;
    end;
    reset role;

    insert into public.resource_blocks (resource_id, starts_at, ends_at, kind, reason, created_by)
    values (v_resource, v_start, v_end, 'staff_hold', 'Synthetic conflict', v_member) returning id into v_block;
    begin
      insert into public.resource_reservations (resource_id, starts_at, ends_at, kind, block_id)
      values (v_resource, v_start, v_end, 'block', v_block);
      raise exception 'Existing reservation path bypassed checkout hold';
    exception when exclusion_violation then null;
    end;

    perform public.release_signed_booking_inventory(v_quote);
    insert into public.resource_reservations (resource_id, starts_at, ends_at, kind, block_id)
    values (v_resource, v_start, v_end, 'block', v_block);
    begin
      perform public.hold_signed_booking_inventory(extensions.gen_random_uuid(), v_resource, v_member, v_start, v_end, now());
      raise exception 'Checkout hold bypassed an existing reservation';
    exception when exclusion_violation then null;
    end;
    delete from public.resource_blocks where id = v_block;

    v_quote := extensions.gen_random_uuid();
    perform public.hold_signed_booking_inventory(v_quote, v_resource, v_member, v_start, v_end, now());
    update private.checkout_inventory_holds set expires_at = now() - interval '1 second' where quote_id = v_quote;
    perform public.hold_signed_booking_inventory(extensions.gen_random_uuid(), v_resource, v_member, v_start, v_end, now());
    raise notice 'Checkout hold conflict, release, and expiry passed for resource %', v_resource;
  end loop;

  begin
    perform public.hold_signed_booking_inventory(extensions.gen_random_uuid(), v_resource, 'e1000000-0000-4000-8000-000000000002', v_start, v_end, now());
    raise exception 'Unverified member received a checkout hold';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.hold_signed_booking_inventory(extensions.gen_random_uuid(), v_resource, v_member, v_start, v_end, now() - interval '31 minutes');
    raise exception 'Expired signed quote received a checkout hold';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
