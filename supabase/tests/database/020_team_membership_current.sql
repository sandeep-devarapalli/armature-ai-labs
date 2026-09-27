begin;
-- Enable mock activation only inside this rolled-back local fixture.
update public.booking_policy_settings set mock_grants_enabled=true;
select plan(13);
insert into auth.users(id,aud,role,email,email_confirmed_at)
select ('32000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','team-current-'||n||'@example.test',now() from generate_series(1,5) n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Test Member',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '32000000%';
insert into public.staff_roles(user_id,role) values
('32000000-0000-4000-8000-000000000004','membership_reviewer'),('32000000-0000-4000-8000-000000000005','operations');
insert into public.organizations(id,name) values('32000000-0000-4000-8000-000000000010','Test team');
insert into public.organization_memberships(organization_id,status,seat_allowance) values('32000000-0000-4000-8000-000000000010','active',3);
insert into public.organization_members(organization_id,user_id,role,seat_enabled) values
('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000001','admin',false),
('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000002','member',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.staff_create_team('Forbidden','32000000-0000-4000-8000-000000000003',1,null,null)$$,'42501','staff role required','reviewer cannot grant team access');
select is((select count(*)::integer from public.organization_memberships),0,'reviewer cannot read team operational records');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.staff_create_team('Forbidden','32000000-0000-4000-8000-000000000003',1,null,null)$$,'42501','staff role required','operations cannot grant team access');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.team_transfer_admin('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000002',false)$$,'22023','confirm team ownership transfer','explicit transfer confirmation required');
select throws_ok($$select public.team_transfer_admin('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000003',true)$$,'22023','new admin must be an approved active teammate','outsider cannot become team admin');
reset role;
update public.basic_onboarding_applications set status='revoked' where user_id='32000000-0000-4000-8000-000000000002';
select is(private.has_active_team_membership('32000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000010',now(),now()+interval '1 hour'),false,'revocation defeats active team entitlement');
set local role authenticated;
select throws_ok($$select public.team_transfer_admin('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000002',true)$$,'22023','new admin must be an approved active teammate','revoked basic member cannot receive team ownership');
reset role;
update public.basic_onboarding_applications set status='approved' where user_id='32000000-0000-4000-8000-000000000002';
set local role authenticated;
select lives_ok($$select public.team_transfer_admin('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000002',true)$$,'team admin can transfer to approved seated teammate');
select throws_ok($$select public.team_create_invitation('32000000-0000-4000-8000-000000000010','test@example.test')$$,'42501','team admin required','former admin loses management immediately');
reset role;
select is((select count(*)::integer from public.organization_members where organization_id='32000000-0000-4000-8000-000000000010' and role='admin' and removed_at is null),1,'exactly one admin remains');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.team_remove_member('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000002')$$,'P0002','active teammate not found','sole admin cannot be removed');
select lives_ok($$select public.team_remove_member('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000001')$$,'new admin can remove former admin');
select function_privs_are('public','team_create_booking',array['uuid','uuid','uuid','timestamp with time zone','timestamp with time zone','text[]','text','text'],'anon',array[]::text[],'anonymous cannot book on behalf');
select * from finish();
rollback;
