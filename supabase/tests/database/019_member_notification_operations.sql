begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('63000000-0000-4000-8000-000000000001','authenticated','authenticated','ops@example.test',now()),
('63000000-0000-4000-8000-000000000002','authenticated','authenticated','opsadmin@example.test',now());
insert into public.staff_roles(user_id,role) values('63000000-0000-4000-8000-000000000002','admin');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
values('63000000-0000-4000-8000-000000000001','Operations Test','ops@example.test','+919999999999','https://linkedin.com/in/test','1990-01-01','approved');
insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,created_at,completed_at,provider_id,delivery_state)
select '63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','ops@example.test','ops:'||i,'approved','approved',1,
case i when 1 then 'held' when 2 then 'accepted' when 3 then 'unknown' when 4 then 'accepted' else 'failed' end,
now()-interval '31 days',now()-interval '31 days',case when i in (2,4) then 'ops-provider-'||i end,
case when i=2 then 'delivered' else 'unconfirmed' end from generate_series(1,5) i;
insert into public.member_notification_events(event_id,provider_id,event_type,occurred_at,received_at) values
('ops-old-unmatched','ops-unmatched','email.sent',now()-interval '31 days',now()-interval '31 days'),
('ops-old-matched','ops-provider-2','email.delivered',now()-interval '31 days',now()-interval '31 days'),
('ops-old-unresolved','ops-provider-4','email.sent',now()-interval '31 days',now()-interval '31 days'),
('ops-young','ops-young','email.sent',now(),now());
select ok(not (select cleanup_enabled from public.member_notification_settings),'cleanup defaults off');
select throws_ok($$select public.maintain_member_notifications(false)$$,'42501','Notification cleanup disabled','cannot delete before database gate');
select is((public.maintain_member_notifications()->>'history')::integer,3,'dry run finds held and completed history only');
select is((public.maintain_member_notifications()->>'receipts')::integer,1,'dry run finds old unmatched receipt');
select is((select count(*)::integer from public.member_notifications),5,'dry run changes no history');
select is((select count(*)::integer from public.member_notification_tombstones),0,'dry run creates no markers');
select throws_ok($$select public.maintain_member_notifications(true,101)$$,'22023','Invalid maintenance options','batch bounded');
select ok(not has_function_privilege('authenticated','public.maintain_member_notifications(boolean,integer)','EXECUTE'),'admin browser cannot run cleanup');
select ok(not has_table_privilege('authenticated','public.member_notification_tombstones','SELECT'),'markers private');
update public.member_notification_settings set cleanup_enabled=true;
select is((public.maintain_member_notifications(false,1)->>'history')::integer,1,'execution batch bounded');
select ok((select last_cleanup_at is not null from public.member_notification_settings),'successful execution records heartbeat');
select is((public.maintain_member_notifications(false)->>'history')::integer,2,'remaining completed history removed');
select is((select count(*)::integer from public.member_notifications),2,'unknown and unconfirmed acceptance preserved');
select is((select count(*)::integer from public.member_notification_tombstones),3,'minimal deduplication markers retained');
select ok(not exists(select 1 from public.member_notification_events where event_id in ('ops-old-unmatched','ops-old-matched')),'expired receipts removed after history cleanup');
select is((select count(*)::integer from public.member_notification_events),2,'young and unresolved matched receipts preserved');
select ok(not (public.maintain_member_notifications(false)->>'remaining')::boolean,'cleanup converges');
select is((public.maintain_member_notifications(false)->>'history')::integer,0,'repeated cleanup is idempotent');
select private.enqueue_member_notification('63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','ops:1','approved','approved',1);
select ok(not exists(select 1 from public.member_notifications where event_key='ops:1'),'archived event cannot be queued again');
select ok(public.record_member_notification_event('ops-late-complaint','ops-provider-2','email.complained',now()),'late complaint accepted for archived provider');
select is((select reason from public.member_notification_suppressions where recipient_email like 'sha256:%'),'complained','late complaint stores blocked address digest only');
select ok(not exists(select 1 from public.member_notification_events where event_id='ops-late-complaint'),'archived delivery history is not recreated');
update public.member_notification_settings set enabled=true,pilot_recipients=array['ops@example.test'];
select ok(not private.member_notification_eligible(n),'digest suppression blocks future sends') from public.member_notifications n where event_key='ops:4';
select set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.member_notification_health()$$,'42501','Administrator access required','ordinary member cannot inspect health');
insert into public.staff_roles(user_id,role) values('63000000-0000-4000-8000-000000000001','membership_reviewer');
select throws_ok($$select public.member_notification_health()$$,'42501','Administrator access required','staff cannot inspect health');
select set_config('request.jwt.claim.sub','63000000-0000-4000-8000-000000000002',true);
select is((public.member_notification_health()->>'unknown')::integer,1,'unresolved outcomes monitored');
select is((public.member_notification_health()->>'delivery_unconfirmed')::integer,1,'old unconfirmed acceptance monitored');
select ok((public.list_member_notification_status()->'items'->0->>'suppressed')::boolean,'admin sees hashed suppression');
update public.member_notification_settings set last_cleanup_at=now()-interval '27 hours';
select ok((public.member_notification_health()->>'cleanup_overdue')::boolean,'missed cleanup heartbeat detected');
delete from public.staff_roles where user_id='63000000-0000-4000-8000-000000000002';
select throws_ok($$select public.member_notification_health()$$,'42501','Administrator access required','removed admin immediately loses health access');
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.member_notification_health()$$,'service monitor may inspect aggregate health');
select ok(not (public.member_notification_health()::text like '%ops@example.test%'),'health contains no recipient address');
select * from finish();
rollback;
