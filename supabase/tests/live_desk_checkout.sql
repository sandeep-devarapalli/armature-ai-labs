-- Run after checkout_inventory_holds.sql in the same rollback-only test transaction.
do $$
declare
  m uuid := 'e1000000-0000-4000-8000-000000000001';
  other_member uuid := 'e1000000-0000-4000-8000-000000000002';
  chair uuid := 'e3000000-0000-4000-8000-000000000001';
  start_date date := (now() at time zone 'Asia/Kolkata')::date+14;
  quote jsonb;
  context jsonb;
  payment jsonb;
  result jsonb;
  selected_booking_id uuid;
  scenario text;
  n integer := 1;
begin
  if has_function_privilege('authenticated','public.live_desk_checkout(text,uuid,jsonb)','execute')
    or has_function_privilege('anon','public.live_desk_checkout(text,uuid,jsonb)','execute') then
    raise exception 'Browser roles can invoke the checkout ledger';
  end if;
  begin
    perform public.live_desk_checkout('availability',m,'{}');
    raise exception 'Checkout is open by default';
  exception when insufficient_privilege then null;
  end;

  update private.membership_level_settings set enabled=true where singleton;
  update auth.users set phone='12025550125',phone_confirmed_at=now() where id=m;
  update public.basic_onboarding_applications set phone='+12025550125' where user_id=m;
  insert into private.member_phone_verifications values(m,'+12025550125',now());
  update public.booking_policy_settings set public_desk_calendar_enabled=true,live_desk_checkout_enabled=true,
    live_desk_checkout_member=m,live_desk_checkout_policy_version='test-v1',mock_grants_enabled=false where singleton;
  update public.resources set capacity=1,max_duration_minutes=480,booking_horizon_days=90 where id=chair;
  update public.locations set timezone='Asia/Kolkata' where id='e2000000-0000-4000-8000-000000000001';
  update public.booking_products set enabled=true,price_paise=35000 where code='workspace-day';
  insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at)
  select chair,d,time '09:00',time '17:00' from generate_series(0,6) d;

  set local role service_role;
  begin
    perform public.live_desk_checkout('availability',other_member,'{}');
    raise exception 'Unapproved member accessed the pilot';
  exception when insufficient_privilege then null;
  end;
  if not (public.live_desk_checkout('availability',m,'{}')->'chairs' ? 'S25') then
    raise exception 'Pilot could not see real configured desk codes';
  end if;
  quote := public.live_desk_checkout('quote',m,jsonb_build_object('chair','S25','unit','day','start',start_date));
  context := jsonb_build_object('quoteId',quote->>'id');
  if quote->>'amount_paise' is distinct from '35000' then raise exception 'Incorrect quote'; end if;
  begin
    perform public.live_desk_checkout('status',other_member,context);
    raise exception 'Another member could read the quote';
  exception when no_data_found then null;
  end;
  perform public.live_desk_checkout('seal',m,context||'{"documentId":"LiveDocument01","revision":"2026-11-06T00:00:00Z"}');
  begin
    perform public.live_desk_checkout('claim_order',m,context||jsonb_build_object('signedAt',now(),'policyVersion','outdated'));
    raise exception 'Outdated policy accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.live_desk_checkout('claim_order',m,context||jsonb_build_object('signedAt',now(),'policyVersion','test-v1'));
  perform public.live_desk_checkout('bind_order',m,context||'{"orderId":"order_LiveTest01"}');
  if public.live_desk_checkout('lookup_order',null,'{"orderId":"order_Unrelated"}')->>'status' is distinct from 'ignored' then
    raise exception 'Unrelated gateway order was not ignored';
  end if;
  if public.live_desk_checkout('lookup_order',null,'{"orderId":"order_LiveTest01"}')->>'id' is distinct from quote->>'id' then
    raise exception 'Webhook could not look up the bound order';
  end if;

  reset role;
  update public.booking_policy_settings set live_desk_checkout_enabled=false where singleton;
  set local role service_role;
  payment := '{"orderId":"order_LiveTest01","paymentId":"pay_LiveTest01","amount":35000,"currency":"INR","refundedAmount":0}';
  begin
    perform public.live_desk_checkout('capture',null,payment||'{"amount":34999}');
    raise exception 'Wrong amount was accepted';
  exception when invalid_parameter_value then null;
  end;
  result := public.live_desk_checkout('capture',null,payment);
  selected_booking_id := (result->>'bookingId')::uuid;
  if result->>'status' is distinct from 'confirmed' or result->>'membership' is distinct from 'premium'
    or selected_booking_id is null
    or public.live_desk_checkout('capture',m,context||payment) is distinct from result then
    raise exception 'Verified capture did not atomically confirm and grant Premium: %',result;
  end if;
  reset role;
  if (select count(*) from public.resource_reservations r
    where r.booking_id=selected_booking_id and r.released_at is null)<>1 then
    raise exception 'Capture did not reserve the desk exactly once';
  end if;
  set local role service_role;
  result := public.live_desk_checkout('refund',null,payment||'{"refundedAmount":5000}');
  if result->>'reviewReason' is distinct from 'partial_refund' or result->>'status' is distinct from 'confirmed'
    or result->>'membership' is distinct from 'premium' then
    raise exception 'Partial refund did not retain the booking for financial review: %',result;
  end if;
  if public.live_desk_checkout('capture',null,payment) is distinct from result then
    raise exception 'An old capture reduced the recorded refund amount';
  end if;
  result := public.live_desk_checkout('refund',null,payment||'{"refundedAmount":35000}');
  if result->>'status' is distinct from 'refunded' or result->>'membership' is distinct from 'verified'
    or public.live_desk_checkout('capture',null,payment) is distinct from result then
    raise exception 'Full refund failed to remove Premium or a replay revived the booking: %',result;
  end if;
  reset role;
  if exists (select 1 from public.resource_reservations r where r.booking_id=selected_booking_id and r.released_at is null)
    or (select count(*) from public.bookings b where b.id=selected_booking_id and b.status='cancelled')<>1
    or (select count(*) from private.membership_paid_terms where payment_reference='pay_LiveTest01' and revoked_at is not null)<>1
    or (select count(*) from public.paid_access_entitlements where user_id=m and source='razorpay' and revoked_at is not null)<>1 then
    raise exception 'Refund did not cancel the reservation and both paid records';
  end if;
  update public.booking_policy_settings set live_desk_checkout_enabled=true where singleton;
  foreach scenario in array array['full_refund_first','partial_refund_first','expired_hold'] loop
    n := n+1;
    quote := public.live_desk_checkout('quote',m,jsonb_build_object('chair','S25','unit','day','start',start_date+n));
    context := jsonb_build_object('quoteId',quote->>'id');
    perform public.live_desk_checkout('seal',m,context||jsonb_build_object('documentId','LiveDocument0'||n,'revision','2026-11-06T00:00:00Z'));
    perform public.live_desk_checkout('claim_order',m,context||jsonb_build_object('signedAt',now(),'policyVersion','test-v1'));
    payment := jsonb_build_object('orderId','order_LiveTest0'||n,'paymentId','pay_LiveTest0'||n,'amount',35000,'currency','INR','refundedAmount',0);
    perform public.live_desk_checkout('bind_order',m,context||payment);
    if scenario='full_refund_first' then
      result := public.live_desk_checkout('refund',null,payment||'{"refundedAmount":35000}');
      if result->>'status' is distinct from 'refunded' or result->>'bookingId' is not null
        or public.live_desk_checkout('capture',null,payment) is distinct from result then
        raise exception 'Refund-before-capture improperly fulfilled the order: %',result;
      end if;
    elsif scenario='partial_refund_first' then
      result := public.live_desk_checkout('refund',null,payment||'{"refundedAmount":5000}');
      if result->>'status' is distinct from 'confirmed' or result->>'membership' is distinct from 'premium'
        or result->>'reviewReason' is distinct from 'partial_refund' then
        raise exception 'Partial refund before capture did not fulfill and flag review: %',result;
      end if;
      perform set_config('request.jwt.claim.sub',m::text,true);
      perform public.cancel_booking((result->>'bookingId')::uuid,'Synthetic cancellation');
      if private.membership_level_at(m,clock_timestamp()) is distinct from 'verified'
        or public.live_desk_checkout('status',m,context)->>'status' is distinct from 'cancelled' then
        raise exception 'Cancelled booking still grants access or displays confirmed';
      end if;
    else
      update private.checkout_inventory_holds set expires_at=clock_timestamp()-interval '1 second' where quote_id=(quote->>'id')::uuid;
      result := public.live_desk_checkout('capture',null,payment);
      if result->>'status' is distinct from 'needs_review' or result->>'reviewReason' is distinct from 'hold_unavailable'
        or result->>'bookingId' is not null or result->>'membership' is distinct from 'verified' then
        raise exception 'Late capture improperly reserved the desk: %',result;
      end if;
    end if;
  end loop;
  raise notice 'Live desk pilot, signed agreement, replay, Premium, refund ordering, cancellation and expired hold passed';
end;
$$;
