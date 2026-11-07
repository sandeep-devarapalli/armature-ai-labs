-- Run against isolated booking staging after the S01 fixture and manual agreement migration.
begin;
do $$
declare
  buyer uuid := extensions.gen_random_uuid();
  reviewer uuid := extensions.gen_random_uuid();
  quote_id uuid;
  start_date date;
  version text;
  quote jsonb;
  request jsonb;
  approval jsonb;
  approved_at timestamptz;
  result jsonb;
begin
  if not exists (select 1 from public.resources where slug='desk-s01-rehearsal') then
    raise exception 'This regression requires the isolated S01 staging fixture';
  end if;
  if has_function_privilege('authenticated','public.manual_desk_agreement(uuid,uuid,jsonb)','execute')
    or has_function_privilege('anon','public.manual_desk_agreement(uuid,uuid,jsonb)','execute') then
    raise exception 'Browser roles can write approval';
  end if;
  select live_desk_checkout_policy_version into strict version
  from public.booking_policy_settings where singleton and live_desk_checkout_enabled and not mock_grants_enabled;
  insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
  values(buyer,'manual-s01-buyer@example.invalid',now(),'12025550189',now());
  insert into public.basic_onboarding_applications (user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
  values(buyer,'Synthetic S01 buyer','manual-s01-buyer@example.invalid','+12025550189','https://linkedin.com/in/test','1990-01-01','approved');
  insert into private.member_phone_verifications values(buyer,'+12025550189',now());
  update public.booking_policy_settings set live_desk_checkout_member=buyer where singleton;
  insert into auth.users(id,email) values(reviewer,'manual-s01-reviewer@example.invalid');
  insert into public.staff_roles(user_id,role) values(reviewer,'admin');
  select booking_date into strict start_date from public.list_bookable_desk_dates('S01','day',
    (now() at time zone 'Asia/Kolkata')::date+3,(now() at time zone 'Asia/Kolkata')::date+14)
  where available order by booking_date limit 1;
  quote := public.live_desk_checkout('quote',buyer,jsonb_build_object('chair','S01','unit','day','start',start_date));
  quote_id := (quote->>'id')::uuid;
  request := jsonb_build_object('quoteId',quote_id);
  if quote->>'amount_paise' <> '35000' or public.manual_desk_agreement(buyer,quote_id) is not null then
    raise exception 'Unexpected initial quote or approval';
  end if;
  begin
    perform public.live_desk_checkout('claim_order',buyer,request||jsonb_build_object('signedAt',now(),'policyVersion',version));
    raise exception 'Unsigned quote claimed';
  exception when invalid_parameter_value then null;
  end;
  approval := jsonb_build_object('reviewerId',reviewer,'documentId','SyntheticManualS01',
    'agreementHash',quote->>'agreement_hash','evidenceSha256',repeat('a',64));
  begin
    perform public.manual_desk_agreement(buyer,quote_id,approval||jsonb_build_object('reviewerId',buyer));
    raise exception 'Buyer self-approved';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.manual_desk_agreement(buyer,quote_id,approval||jsonb_build_object('agreementHash',repeat('b',64)));
    raise exception 'Wrong quote hash accepted';
  exception when invalid_parameter_value then null;
  end;
  approved_at := public.manual_desk_agreement(buyer,quote_id,approval);
  if approved_at is null or approved_at is distinct from public.manual_desk_agreement(buyer,quote_id,approval)
    or approved_at is distinct from public.manual_desk_agreement(buyer,quote_id)
    or public.manual_desk_agreement(reviewer,quote_id) is not null then
    raise exception 'Manual evidence was not bound and stored exactly once';
  end if;
  perform public.live_desk_checkout('claim_order',buyer,request||jsonb_build_object('signedAt',approved_at,'policyVersion',version));
  perform public.live_desk_checkout('bind_order',buyer,request||'{"orderId":"order_ManualS01Fixture"}');
  result := public.live_desk_checkout('capture',null,
    '{"orderId":"order_ManualS01Fixture","paymentId":"pay_ManualS01Fixture","amount":35000,"currency":"INR","refundedAmount":0}');
  if result->>'status' is distinct from 'confirmed' or result->>'membership' is distinct from 'premium'
    or not exists (select 1 from public.resource_reservations where booking_id=(result->>'bookingId')::uuid and released_at is null) then
    raise exception 'Synthetic capture did not reserve the seat and grant Premium';
  end if;
end;
$$;
rollback;
select 'Manual S01 staging regression passed and rolled back' as result;
