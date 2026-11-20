begin;
select no_plan();

insert into auth.users (id,aud,role,email,email_confirmed_at)
select ('97077000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'visit-pass-'||n||'@example.test',case when n<>8 then now() end
from generate_series(1,8) n;
insert into public.staff_roles (user_id,role) values
 ('97077000-0000-4000-8000-000000000007','membership_reviewer');
select set_config('visit.today',private.visit_pass_today()::text,true);
select ok(not has_function_privilege('anon','public.request_guest_pass(date,text,text)','EXECUTE'),
 'Anonymous users cannot submit a guest request');
select ok(not has_table_privilege('authenticated','private.guest_passes','SELECT'),
 'Authenticated clients cannot access the private guest table');

set local role authenticated;
select set_config('request.jwt.claim.sub','97077000-0000-4000-8000-000000000008',true);
select throws_ok($$select public.get_my_guest_passes()$$,'42501','Sign in with a confirmed email to continue',
 'Unconfirmed email cannot read pass data');
select throws_ok($$select public.submit_golden_pass_application('Synthetic request')$$,'42501',null,
 'Unconfirmed email cannot apply for the Golden Pass');
select set_config('request.jwt.claim.sub','97077000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.request_guest_pass(current_setting('visit.today')::date,'work','Work sample')$$,'22023',null,
 'Desk work cannot be requested as a guest visit');
select throws_ok($$select public.request_guest_pass(current_setting('visit.today')::date-1,'event','Past event')$$,'22023',null,
 'Guests cannot request past dates');
select set_config('visit.first',public.request_guest_pass(current_setting('visit.today')::date,'event','Synthetic demo')::text,true);
select is(current_setting('visit.first')::jsonb->>'status','pending','Email-confirmed non-member can request a free visit');
select throws_ok($$select public.request_guest_pass(current_setting('visit.today')::date,'meeting','Synthetic duplicate')$$,'23505',null,
 'Duplicate date requests do not create additional active passes');
select is(jsonb_array_length(public.get_my_guest_passes()),1,'Guest can read their own request');
select set_config('golden.first',public.submit_golden_pass_application('Synthetic robot build')::text,true);
select is(public.submit_golden_pass_application('Retry fixture')->>'id',current_setting('golden.first')::jsonb->>'id',
 'Golden Pass application retries return the original application');
select is(jsonb_array_length(public.get_my_golden_pass_application()),1,'Applicant can read their own application');
select throws_ok($$select public.staff_update_guest_pass((current_setting('visit.first')::jsonb->>'id')::uuid,'approve')$$,
 '42501','Authorised staff required','Applicant cannot approve their own pass');
select throws_ok($$select public.staff_list_golden_pass_applications()$$,'42501',null,
 'Member cannot read the staff application queue');

select set_config('request.jwt.claim.sub','97077000-0000-4000-8000-000000000002',true);
select is(public.get_my_guest_passes(),'[]'::jsonb,'Another guest cannot read a pass by account');
select is(public.get_my_golden_pass_application(),'[]'::jsonb,'Another applicant cannot read the application');
select throws_ok($$select public.accept_guest_pass_date((current_setting('visit.first')::jsonb->>'id')::uuid)$$,
 'P0002',null,'Guest cannot change another user’s request');

reset role;
insert into private.guest_passes(user_id,visit_date,purpose,details,status) values
 ('97077000-0000-4000-8000-000000000005',current_setting('visit.today')::date,'meeting','Reschedule fixture','pending'),
 ('97077000-0000-4000-8000-000000000006',current_setting('visit.today')::date-1,'event','Expired fixture','approved');
set local role authenticated;
select set_config('request.jwt.claim.sub','97077000-0000-4000-8000-000000000007',true);
select ok(exists(select 1 from jsonb_array_elements(public.staff_list_guest_passes()) v where v->>'status'='expired'),
 'Staff sees past unredeemed approvals as expired');
select ok(exists(select 1 from jsonb_array_elements(public.staff_list_golden_pass_applications()) a
 where a->>'applicant_email'='visit-pass-1@example.test'),'Staff can follow up with a Golden Pass applicant');
select is(public.staff_update_guest_pass((current_setting('visit.first')::jsonb->>'id')::uuid,'approve')->>'status',
 'approved','Staff can approve a pending visitor after reviewing availability');
select throws_ok($$select public.staff_update_guest_pass((current_setting('visit.first')::jsonb->>'id')::uuid,
 'check_in',null,null,'GP-BAD')$$,'22023',null,'Staff cannot redeem the wrong reference');
select is(public.staff_update_guest_pass((current_setting('visit.first')::jsonb->>'id')::uuid,'check_in',
 null,null,current_setting('visit.first')::jsonb->>'reference')->>'status','checked_in','Staff can redeem today’s approval');
select throws_ok($$select public.staff_update_guest_pass((current_setting('visit.first')::jsonb->>'id')::uuid,
 'check_in',null,null,current_setting('visit.first')::jsonb->>'reference')$$,'22023',null,'Staff cannot redeem the same pass twice');
select set_config('visit.offer',public.staff_update_guest_pass((select (v->>'id')::uuid from
 jsonb_array_elements(public.staff_list_guest_passes()) v where v->>'guest_email'='visit-pass-5@example.test'),
 'offer',current_setting('visit.today')::date+2,'Please visit on this date.')::text,true);
select is(current_setting('visit.offer')::jsonb->>'status','alternate','Staff can propose a different date');
select set_config('request.jwt.claim.sub','97077000-0000-4000-8000-000000000005',true);
select is(public.accept_guest_pass_date((current_setting('visit.offer')::jsonb->>'id')::uuid)->>'status',
 'pending','Accepting a new date goes back to the staff queue');
select is(public.get_my_guest_passes()->0->>'visit_date',(current_setting('visit.today')::date+2)::text,
 'Visitor sees their new requested date');
reset role;

select is((select count(*) from public.paid_access_entitlements
 where user_id='97077000-0000-4000-8000-000000000001'),0::bigint,
 'Golden Pass submission creates no paid access entitlement');
select * from finish();
rollback;
