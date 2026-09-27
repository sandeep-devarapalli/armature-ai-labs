begin;
select no_plan();
select is((select immediate_enabled from public.member_notification_settings),false,'immediate sending defaults off');
select ok(not has_table_privilege('authenticated','vault.decrypted_secrets','SELECT'),'members cannot read signing key');
select ok(not has_table_privilege('anon','vault.decrypted_secrets','SELECT'),'anonymous cannot read Vault');
select ok(not has_function_privilege('authenticated','private.wake_member_notification_sender()','EXECUTE'),'members cannot invoke wakeup');
create temp table queue_baseline as select count(*) n from net.http_request_queue;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('64000000-0000-4000-8000-000000000001','authenticated','authenticated','general@example.test',now()),
('64000000-0000-4000-8000-000000000002','authenticated','authenticated','unverified@example.test',null);
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
values('64000000-0000-4000-8000-000000000001','General Test','general@example.test','+919999999999','https://linkedin.com/in/test','1990-01-01','approved');

update public.member_notification_settings set enabled=true,all_members_enabled=true;
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','instant:disabled','approved','approved',1);
select is((select count(*) from net.http_request_queue),(select n from queue_baseline),'disabled wakeup queues no request');
update public.member_notification_settings set immediate_enabled=true;
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','instant:no-secret','approved','approved',1);
select is((select count(*) from member_notifications where event_key='instant:no-secret'),1::bigint,'missing secret preserves notification');
select is((select count(*) from net.http_request_queue),(select n from queue_baseline),'missing secret queues no request');
select vault.create_secret(repeat('x',40),'member_notifications_wakeup_key');
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','instant:send','approved','approved',1);
select is((select count(*) from net.http_request_queue),(select n+1 from queue_baseline),'pending insert queues wakeup inside transaction');
select ok(exists(select 1 from net.http_request_queue where url='https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/member-notifications' and convert_from(body,'UTF8')='{}' and timeout_milliseconds=120000),'fixed endpoint receives empty payload and bounded timeout');
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','instant:send','approved','approved',1);
select is((select count(*) from net.http_request_queue),(select n+1 from queue_baseline),'duplicate inserts do not wake sender');
update public.member_notification_settings set enabled=false;
select private.enqueue_member_notification('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','instant:held','approved','approved',1);
select is((select count(*) from net.http_request_queue),(select n+1 from queue_baseline),'held insert does not wake sender');
update public.member_notification_settings set enabled=true;
select ok(not exists(select 1 from net.http_request_queue where headers ? 'x-armature-job-secret'),'HTTP queue never contains reusable worker credential');
select ok(not exists(select 1 from net.http_request_queue where headers::text like '%'||repeat('x',40)||'%'),'HTTP queue never contains signing key');
select * from finish();
rollback;
