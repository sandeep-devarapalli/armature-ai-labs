begin;
select no_plan();
select is((select all_members_enabled from public.member_notification_settings),false,'general sending defaults off');
select ok(not has_table_privilege('authenticated','public.member_notification_settings','UPDATE'),'members cannot enable general delivery');
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('64000000-0000-4000-8000-000000000001','authenticated','authenticated','general@example.test',now()),
('64000000-0000-4000-8000-000000000002','authenticated','authenticated','unverified@example.test',null);
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
values('64000000-0000-4000-8000-000000000001','General Test','general@example.test','+919999999999','https://linkedin.com/in/test','1990-01-01','approved');
update public.member_notification_settings set enabled=true,pilot_recipients=array['pilot@example.test'];
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','general:held','approved','approved',1);
select is((select state from public.member_notifications where event_key='general:held'),'held','default pilot mode holds nonpilot event');
update public.member_notification_settings set all_members_enabled=true;
select is((select count(*)::integer from public.claim_member_notifications()),0,'general activation cannot release held history');
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','general:new','approved','approved',1);
select is((select state from public.member_notifications where event_key='general:new'),'pending','new nonpilot member event is pending');
create temp table general_claim as select * from public.claim_member_notifications();
select is((select count(*)::integer from general_claim),1,'general mode claims new eligible nonpilot event');
update public.member_notification_settings set enabled=false;
select ok(not public.prepare_member_notification(id,lease_token),'master gate still prevents prepared send') from general_claim;
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','general:disabled','approved','approved',1);
select is((select state from public.member_notifications where event_key='general:disabled'),'held','master gate off holds new events even in general mode');
update public.member_notification_settings set enabled=true;
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002','general:unverified','approved','approved',1);
select is((select count(*)::integer from public.member_notifications where event_key='general:unverified'),0,'unverified recipient remains excluded');
insert into public.member_notification_suppressions(recipient_email,reason) values('general@example.test','bounced');
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','general:blocked','approved','approved',1);
select is((select count(*)::integer from public.claim_member_notifications()),0,'suppressed address cannot send in general mode');
select is((select state from public.member_notifications where event_key='general:blocked'),'suppressed','bounce block is retained');
delete from public.member_notification_suppressions where recipient_email='general@example.test';
insert into public.member_notification_tombstones(event_key,user_id,recipient_id,kind,template_version,recipient_hash)
values('general:archived','64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','approved',1,'synthetic');
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','general:archived','approved','approved',1);
select is((select count(*)::integer from public.member_notifications where event_key='general:archived'),0,'archived event cannot be recreated by general mode');
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','general:stale','approved','approved',2);
select is((select count(*)::integer from public.claim_member_notifications()),0,'stale application revision remains ineligible');
update public.member_notification_settings set all_members_enabled=false,pilot_recipients=array['general@example.test'];
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','general:pilot','approved','approved',1);
select is((select count(*)::integer from public.claim_member_notifications()),1,'pilot allowlist still works after general mode disabled');
select is((select count(*)::integer from public.member_notifications where state='held'),2,'original held history remains held throughout');
select * from finish();
rollback;
