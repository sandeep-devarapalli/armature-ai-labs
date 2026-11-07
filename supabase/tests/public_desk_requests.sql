-- Run after live_desk_checkout.sql in CI's outer rollback-only transaction.
reset role;
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days,active,reservable)
values('e3000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000001',
  'desk-s01-rehearsal','Synthetic public S01','workspace',1,480,90,true,true);
insert into public.resource_booking_policies(resource_id,kind)
values('e3000000-0000-4000-8000-000000000004','workspace');
delete from public.booking_inventory where code='S01';
insert into public.booking_inventory(resource_id,code,floor,room)
values('e3000000-0000-4000-8000-000000000004','S01','GF','GF-10');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at)
select 'e3000000-0000-4000-8000-000000000004',d,time '09:00',time '17:00' from generate_series(0,6) d;
update public.booking_products set enabled=true,price_paise=case unit when 'day' then 35000 when 'week' then 175000 when 'month' then 1300000 end
where kind='workspace' and code in ('workspace-day','workspace-week','workspace-month');
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
  pass text;
  pass_start date;
  pass_request jsonb;
  pass_quote jsonb;
  expected_days integer;
begin
  if not exists (select 1 from public.resources where slug='desk-s01-rehearsal') then
    raise exception 'This regression requires the isolated S01 staging fixture';
  end if;
  if has_function_privilege('authenticated','public.list_desk_requests(uuid,boolean,integer)','execute')
    or has_function_privilege('anon','public.list_desk_requests(uuid,boolean,integer)','execute') then
    raise exception 'Browser roles can invoke desk request lists directly';
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
  update public.booking_policy_settings set live_desk_checkout_member=null,public_desk_checkout_enabled=false where singleton;
  begin
    perform public.live_desk_checkout('quote',buyer,jsonb_build_object('chair','S01','unit','day','start',start_date));
    raise exception 'Public gate off allowed quote';
  exception when insufficient_privilege then null;
  end;
  update public.booking_policy_settings set public_desk_checkout_enabled=true where singleton;
  quote := public.live_desk_checkout('quote',buyer,jsonb_build_object('chair','S01','unit','day','start',start_date));
  if jsonb_array_length(public.list_desk_requests(reviewer,false,0)->'quotes')<>0 then
    raise exception 'Own list leaked another member';
  end if;
  if jsonb_array_length(public.list_desk_requests(buyer,false,0)->'quotes')<>1 then
    raise exception 'Own quote recovery failed';
  end if;
  begin
    perform public.list_desk_requests(buyer,true,0);
    raise exception 'Nonstaff accessed queue';
  exception when insufficient_privilege then null;
  end;
  foreach pass in array array['week','month'] loop
    pass_start := case when pass='month' then (date_trunc('month',start_date+8)+interval '1 month')::date else start_date+1 end;
    result := public.live_desk_checkout('quote',buyer,jsonb_build_object('chair','S01','unit',pass,'start',pass_start));
    if result->>'amount_paise' is distinct from case pass when 'week' then '175000' else '1300000' end then
      raise exception 'Incorrect released desk price';
    end if;
    perform public.manual_desk_agreement(buyer,(result->>'id')::uuid,jsonb_build_object(
      'reviewerId',reviewer,'documentId','PublicAgreement_'||pass,'agreementHash',result->>'agreement_hash',
      'evidenceSha256',case pass when 'week' then repeat('c',64) else repeat('d',64) end));
    pass_quote := result;
    pass_request := jsonb_build_object('quoteId',result->>'id');
    perform public.live_desk_checkout('claim_order',buyer,pass_request||jsonb_build_object(
      'signedAt',public.manual_desk_agreement(buyer,(result->>'id')::uuid),'policyVersion',version));
    perform public.live_desk_checkout('bind_order',buyer,pass_request||jsonb_build_object('orderId','order_Public'||pass));
    result := public.live_desk_checkout('capture',null,jsonb_build_object(
      'orderId','order_Public'||pass,'paymentId','pay_Public'||pass,'amount',(pass_quote->>'amount_paise')::bigint,
      'currency','INR','refundedAmount',0));
    expected_days := (pass_quote->>'ends_on')::date-(pass_quote->>'starts_on')::date+1;
    if result->>'status' is distinct from 'confirmed' or result->>'membership' is distinct from 'premium'
      or jsonb_array_length(result->'bookingIds') is distinct from expected_days
      or (select count(*) from public.resource_reservations r
        where r.booking_id in (select value::uuid from jsonb_array_elements_text(result->'bookingIds'))
          and r.released_at is null)<>expected_days then
      raise exception 'Public % capture did not reserve every date and grant Premium',pass;
    end if;

  end loop;
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
  update private.manual_desk_agreements set approved_at=clock_timestamp()-interval '31 minutes' where manual_desk_agreements.quote_id=(request->>'quoteId')::uuid;
  if public.live_desk_checkout('quote',buyer,jsonb_build_object('chair','S01','unit','day','start',start_date))->>'id'=quote_id::text then
    raise exception 'Expired approval prevented fresh quote';
  end if;
  update private.manual_desk_agreements set approved_at=clock_timestamp() where manual_desk_agreements.quote_id=(request->>'quoteId')::uuid;
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
select 'Public S01 regression passed; outer transaction must roll back' as result;
