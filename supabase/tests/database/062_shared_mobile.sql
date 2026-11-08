begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at)
select ('82000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','shared-'||n||'@example.test',now()
from generate_series(1,5) n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic shared member',email,'+919000000082','https://linkedin.com/in/synthetic-shared','1990-01-01','approved'
from auth.users where id::text like '82000000%';
update auth.users set phone='919000000082',phone_confirmed_at=now() where id='82000000-0000-4000-8000-000000000001';
insert into private.member_phone_verifications values('82000000-0000-4000-8000-000000000001','+919000000082',now());
insert into public.staff_roles(user_id,role) values('82000000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
insert into private.membership_paid_terms(user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
values('82000000-0000-4000-8000-000000000001','workspace','week',now()-interval '1 hour',now()+interval '6 days','razorpay','synthetic-shared-source-paid',now());
select ok(not has_table_privilege('authenticated','private.shared_mobile_approvals','INSERT'),'browser cannot forge shared evidence');
select ok(not has_function_privilege('anon','public.approve_shared_member_phone(uuid,text,text,boolean)','EXECUTE'),'anonymous cannot approve');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000002','shared-1@example.test','Confirmed both account holders',true)$$,'42501','Independent MFA Admin required','superuser without authenticated actor claims cannot approve');
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000002','shared-1@example.test','Confirmed both account holders',true)$$,'42501','Independent MFA Admin required','MFA required');
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000002','shared-1@example.test','Confirmed both account holders',true)$$,'42501','Independent MFA Admin required','nonstaff denied');
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000003","role":"service_role","aal":"aal2"}',true);
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000002','shared-1@example.test','Confirmed both account holders',true)$$,'42501','Independent MFA Admin required','service impersonation denied');
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000003','shared-1@example.test','Confirmed both account holders',true)$$,'42501','Independent accounts and reviewer required','reviewer cannot approve own target');
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000002','shared-3@example.test','Confirmed both account holders',true)$$,'42501','Independent accounts and reviewer required','reviewer cannot approve own source');
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000001','shared-1@example.test','Confirmed both account holders',true)$$,'42501','Independent accounts and reviewer required','same account denied');
select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000002','shared-1@example.test','Confirmed both account holders',false)$$,'22023','Confirm same person and record the review reason','checkbox required');
select lives_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000002','shared-1@example.test','Owner confirmed same person controls both accounts',true)$$,'independent MFA approval succeeds');
select ok(private.has_verified_mobile('82000000-0000-4000-8000-000000000002'),'target mobile recognized');
select is(private.membership_level_at('82000000-0000-4000-8000-000000000002'),'verified','approval does not invent Premium');
select is(private.membership_level_summary('82000000-0000-4000-8000-000000000002')->>'mobile_verification_method','staff_shared','method disclosed accurately');
select is((select phone from auth.users where id='82000000-0000-4000-8000-000000000002'),null,'target Auth phone unchanged');
select is((select count(*)::integer from private.member_phone_verifications where user_id='82000000-0000-4000-8000-000000000002'),0,'no fabricated OTP proof');
select is((select reviewer_id::text from private.shared_mobile_approvals where target_user_id='82000000-0000-4000-8000-000000000002'),'82000000-0000-4000-8000-000000000003','actual reviewer audited');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.member_phone_operation('status','82000000-0000-4000-8000-000000000002')->>'method','staff_shared','idle status discloses shared approval');
insert into private.member_phone_intents(user_id,phone,channel,expires_at,resend_available_at,delivered)
values('82000000-0000-4000-8000-000000000002','+919000000084','sms',now()+interval '5 minutes',now()+interval '30 seconds',true);
select is(public.member_phone_operation('status','82000000-0000-4000-8000-000000000002')->>'id',
 (select id::text from private.member_phone_intents where user_id='82000000-0000-4000-8000-000000000002'),'pending replacement preserves OTP intent');
select is(public.member_phone_operation('status','82000000-0000-4000-8000-000000000002')->>'delivered','true','pending replacement preserves delivery result');
delete from private.member_phone_intents where user_id='82000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);

select throws_ok($$select public.approve_shared_member_phone('82000000-0000-4000-8000-000000000005','shared-2@example.test','Confirmed both account holders',true)$$,'22023','Confirmed accounts, approved identities and matching genuine mobile proof required','shared verification cannot form a chain');
update private.member_phone_verifications set verified_at=now()+interval '1 second' where user_id='82000000-0000-4000-8000-000000000001';
select ok(not private.has_verified_mobile('82000000-0000-4000-8000-000000000002'),'changed source proof invalidates link');
update private.member_phone_verifications set verified_at=now() where user_id='82000000-0000-4000-8000-000000000001';
update auth.users set phone='919000000099' where id='82000000-0000-4000-8000-000000000001';
select ok(not private.has_verified_mobile('82000000-0000-4000-8000-000000000002'),'source phone change invalidates link');
update auth.users set phone='919000000082',banned_until=now()+interval '1 day' where id='82000000-0000-4000-8000-000000000001';
select ok(not private.has_verified_mobile('82000000-0000-4000-8000-000000000002'),'banned source invalidates link');
update auth.users set banned_until=null where id='82000000-0000-4000-8000-000000000001';
update public.basic_onboarding_applications set phone='+919000000099' where user_id='82000000-0000-4000-8000-000000000002';
select ok(not private.has_verified_mobile('82000000-0000-4000-8000-000000000002'),'target phone change invalidates link');
update public.basic_onboarding_applications set phone='+919000000082',status='revoked' where user_id='82000000-0000-4000-8000-000000000002';
select ok(not private.has_verified_mobile('82000000-0000-4000-8000-000000000002'),'revoked target identity invalidates link');
update public.basic_onboarding_applications set status='approved' where user_id='82000000-0000-4000-8000-000000000002';
select lives_ok($$select public.revoke_shared_member_phone('82000000-0000-4000-8000-000000000002','Owner requested removal of shared mobile review')$$,'explicit revocation succeeds');
select ok(not private.has_verified_mobile('82000000-0000-4000-8000-000000000002'),'revoked attestation no longer grants mobile status');
select ok(exists(select 1 from private.shared_mobile_approvals where revoked_by='82000000-0000-4000-8000-000000000003' and revoked_at is not null and revocation_reason is not null),'revocation retained in audit');
select ok(private.has_otp_verified_mobile('82000000-0000-4000-8000-000000000001'),'source genuine verification preserved');
select is(private.membership_level_at('82000000-0000-4000-8000-000000000001'),'premium','source Premium survives approval and revocation');
select is((select count(*)::integer from private.membership_paid_terms where user_id='82000000-0000-4000-8000-000000000002'),0,'no paid terms transferred to target');
select is((select count(*)::integer from private.membership_paid_terms where user_id='82000000-0000-4000-8000-000000000001'),1,'source paid term preserved');
select * from finish();
rollback;
