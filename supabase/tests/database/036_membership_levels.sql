begin;
select no_plan();
-- Local synthetic mock entitlement proves simulated payments never confer Premium.
update public.booking_policy_settings set mock_grants_enabled=true;
insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('41000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','levels-'||n||'@example.test',now(),'91900000000'||n,now() from generate_series(1,4) n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Level Test',email,'+91 900000000'||right(id::text,1),'https://linkedin.com/in/level-test','1990-01-01','approved'
from auth.users where id::text like '41000000%';
select is(private.membership_levels_enabled(),false,'release gate defaults off');
select is(private.basic_member_summary('41000000-0000-4000-8000-000000000001')->>'membership_level',null,'old summaries do not activate new tiers');
select is(private.basic_member_summary('41000000-0000-4000-8000-000000000001')->>'status','approved','existing ID status preserved');
select ok(private.has_approved_basic_membership('41000000-0000-4000-8000-000000000001'),'old approved eligibility retained while off');
select private.enqueue_member_notification('41000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','levels-old-event','approved','approved',1);
update private.membership_level_settings set enabled=true;
select ok(private.has_basic_membership('41000000-0000-4000-8000-000000000001'),'confirmed email establishes Basic');
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),'basic','existing ID approval does not fabricate mobile verification');
select is(private.has_verified_mobile('41000000-0000-4000-8000-000000000001'),false,'raw auth phone confirmation alone is not trusted proof');
select is(private.has_approved_basic_membership('41000000-0000-4000-8000-000000000001'),false,'gated equipment eligibility now requires verified mobile');
insert into private.member_phone_verifications(user_id,phone,verified_at)
select id,'+'||phone,now() from auth.users where id::text like '41000000%' and right(id::text,1)<>'4';
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),'verified','matching trusted proof and preserved ID approval grant Verified');
select is(private.basic_member_summary('41000000-0000-4000-8000-000000000001')->'verification','{"email":true,"mobile":true,"identity":true}'::jsonb,'summary separates all three proofs');
select is(private.basic_member_summary('41000000-0000-4000-8000-000000000001')->>'photo_available','false','deleted verification originals do not invalidate approval');
update public.basic_onboarding_applications set phone='+919111111111' where user_id='41000000-0000-4000-8000-000000000001';
select is(private.has_verified_mobile('41000000-0000-4000-8000-000000000001'),false,'unverified profile replacement cannot inherit phone proof');
update public.basic_onboarding_applications set phone='+91 9000000001' where user_id='41000000-0000-4000-8000-000000000001';
update auth.users set phone_confirmed_at=null where id='41000000-0000-4000-8000-000000000001';
select is(private.has_verified_mobile('41000000-0000-4000-8000-000000000001'),false,'unconfirmed auth number cannot qualify');
update auth.users set phone_confirmed_at=now() where id='41000000-0000-4000-8000-000000000001';
insert into public.paid_access_entitlements(user_id,product_id,starts_at,ends_at,seats,price_paise,granted_by)
select '41000000-0000-4000-8000-000000000001',id,now()-interval '1 day',now()+interval '1 day',1,700000,'41000000-0000-4000-8000-000000000001' from public.booking_products where code='workspace-week';
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),'verified','simulated payments never establish Premium');
insert into private.membership_paid_terms(user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
values('41000000-0000-4000-8000-000000000001','workspace','week',now()+interval '1 day',now()+interval '8 days','razorpay','test-future',now());
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),'verified','future paid term is not Premium early');
select is((private.membership_level_summary('41000000-0000-4000-8000-000000000001')->>'next_status_change_at')::timestamptz,now()+interval '1 day','summary supplies future activation boundary');
insert into private.membership_paid_terms(user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
values('41000000-0000-4000-8000-000000000001','workspace','week',now()-interval '1 day',now()+interval '2 days','razorpay','test-current',now());
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),'premium','active captured workspace term qualifies');
select is((private.membership_level_summary('41000000-0000-4000-8000-000000000001')->>'next_status_change_at')::timestamptz,now()+interval '8 days','overlapping terms do not cause a false intermediate downgrade');
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001',now()+interval '8 days'),'verified','Premium expires exactly at term end');
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '23 hours'),'premium','week term includes evenings outside physical access hours');
update private.membership_paid_terms set revoked_at=now();
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),'verified','revoking all terms restores Verified');
insert into private.membership_paid_terms(user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
values('41000000-0000-4000-8000-000000000001','workspace','day','2026-11-01 09:00+05:30','2026-11-01 17:00+05:30','dodo','test-day',now());
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001','2026-11-01 08:59+05:30'),'verified','day badge not active before access opens');
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001','2026-11-01 09:00+05:30'),'premium','day badge starts with booked access');
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001','2026-11-01 17:00+05:30'),'verified','day badge ends with booked access');
select throws_ok($$insert into private.membership_paid_terms(user_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at) values('41000000-0000-4000-8000-000000000001','workspace','day','2026-11-01 09:00+05:30','2026-11-02 17:00+05:30','dodo','invalid-day',now())$$,'23514',null,'day term cannot span unrelated days');
insert into public.organizations(id,name) values('41000000-0000-4000-8000-000000000010','Level Test Team');
insert into public.organization_memberships(organization_id,status,seat_allowance,starts_at,ends_at)
values('41000000-0000-4000-8000-000000000010','active',1,now()-interval '1 day',now()+interval '3 days');
insert into public.organization_members(organization_id,user_id,role,seat_enabled) values
('41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000002','admin',true),
('41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000003','member',false),
('41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000004','member',false);
insert into private.membership_paid_terms(organization_id,kind,unit,starts_at,ends_at,provider,payment_reference,captured_at)
values('41000000-0000-4000-8000-000000000010','cabin','month',now()-interval '1 day',now()+interval '4 days','razorpay','test-cabin',now());
select is(private.membership_level_at('41000000-0000-4000-8000-000000000003'),'premium','verified team member without seat assignment receives Premium');
select is(private.membership_level_at('41000000-0000-4000-8000-000000000004'),'basic','unverified teammate remains Basic');
select is((private.membership_level_summary('41000000-0000-4000-8000-000000000003')->>'next_status_change_at')::timestamptz,now()+interval '3 days','team membership expiration clips paid term');
update public.organization_members set removed_at=now() where user_id='41000000-0000-4000-8000-000000000003';
select is(private.membership_level_at('41000000-0000-4000-8000-000000000003'),'verified','removed teammate immediately loses team Premium');
update public.organization_memberships set status='suspended';
select is(private.membership_level_at('41000000-0000-4000-8000-000000000002'),'verified','suspended team cannot confer Premium');
update auth.users set banned_until=now()+interval '1 day' where id='41000000-0000-4000-8000-000000000001';
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),null,'banned account cannot use Basic privileges');
update auth.users set banned_until=null,email_confirmed_at=null where id='41000000-0000-4000-8000-000000000001';
select is(private.has_basic_membership('41000000-0000-4000-8000-000000000001'),false,'unconfirmed email cannot obtain Basic');
update auth.users set email_confirmed_at=now() where id='41000000-0000-4000-8000-000000000001';
update public.basic_onboarding_applications set status='revoked' where user_id='41000000-0000-4000-8000-000000000001';
select is(private.has_basic_membership('41000000-0000-4000-8000-000000000001'),false,'membership revocation is not bypassed by confirmed email');
update public.basic_onboarding_applications set status='rejected' where user_id='41000000-0000-4000-8000-000000000001';
select is(private.membership_level_at('41000000-0000-4000-8000-000000000001'),'basic','identity rejection leaves email Basic without verified privileges');
insert into public.memberships(user_id,status) values('41000000-0000-4000-8000-000000000001','suspended') on conflict(user_id) do update set status='suspended';
select is(private.has_basic_membership('41000000-0000-4000-8000-000000000001'),false,'suspended membership blocks Basic privileges');
select private.enqueue_member_notification('41000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','levels-old-event','approved','approved',1);
select is((select template_version from public.member_notifications where event_key='levels-old-event'),1,'gate change cannot rewrite or duplicate an existing notification');
select private.enqueue_member_notification('41000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','levels-new-event','approved','approved',1);
select is((select template_version from public.member_notifications where event_key='levels-new-event'),3,'new notifications select revised membership wording');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(public.get_basic_account_summary()->>'membership_level','basic','account RPC returns only caller level');
select is(public.has_verified_member_access(),false,'canonical authenticated access RPC blocks unverified account');
select throws_ok($$update private.membership_level_settings set enabled=false$$,'42501',null,'members cannot change release gate');
select throws_ok($$insert into private.member_phone_verifications values('41000000-0000-4000-8000-000000000004','+919000000004',now())$$,'42501',null,'members cannot forge phone proof');
select throws_ok($$delete from private.membership_paid_terms$$,'42501',null,'members cannot mutate real paid term evidence');
select throws_ok($$select private.membership_level_at('41000000-0000-4000-8000-000000000002')$$,'42501',null,'members cannot query arbitrary account level');
reset role;
-- Exercise the RLS helper with the same JWT while retaining schema-owner execution.
select is(private.can_read_member_avatar('41000000-0000-4000-8000-000000000003'),false,'unverified account cannot browse community avatars');
select is(private.can_read_member_avatar('41000000-0000-4000-8000-000000000004'),true,'own avatar remains manageable');
reset role;
insert into public.staff_roles(user_id,role) values('41000000-0000-4000-8000-000000000004','admin');
set local role authenticated;
select is(public.get_basic_account_summary()->>'membership_level','basic','Admin role never grants Verified');
select is((public.list_basic_members('levels-',p_membership_level=>'basic')->>'total')::integer,1,'admin can filter by tier independently of role and application');
select throws_ok($$select public.list_basic_members(p_membership_level=>'gold')$$,'22023','Invalid membership level','invalid level filter rejected');
select * from finish();
rollback;
