begin;
insert into public.member_notification_settings(singleton) values(true) on conflict do nothing;
-- The isolated marketplace harness may omit the unrelated Atlas/Auth modules.
-- These empty correlation fixtures are transaction-local and never replace real tables.
do $$ begin
 if to_regclass('private.ecosystem_notifications') is null then create table private.ecosystem_notifications(provider_id text); end if;
 if to_regclass('private.auth_notification_sources') is null then create table private.auth_notification_sources(provider_id text); end if;
 if to_regclass('private.synthetic_notification_resolutions') is null then create table private.synthetic_notification_resolutions(provider_id text); end if;
end $$;
insert into auth.users(id,email,email_confirmed_at) values ('77000000-0000-4000-8000-000000000001','sender@example.invalid',now()),('77000000-0000-4000-8000-000000000002','recipient@example.invalid',now());
insert into public.talent_profiles(id,data) values('delivery-test','{"name":"Synthetic recipient","linkedinUrl":"https://www.linkedin.com/in/synthetic-message-delivery"}');
insert into private.talent_owners(profile_id,user_id) values('delivery-test','77000000-0000-4000-8000-000000000002');
create function pg_temp.ok(v boolean,m text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'Assertion: %',m; end if; end $$;
create function pg_temp.denied(q text) returns void language plpgsql as $$ begin begin execute q; exception when others then return; end; raise exception 'Expected denial: %',q; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000001',true);
select public.market_chat_request('delivery-test','Synthetic intro') as cid \gset
select pg_temp.denied('select public.market_claim_reminders()');
reset role;
update private.market_messages set created_at=now()-interval '20 minutes' where conversation_id=:'cid';
select pg_temp.ok(private.market_reminder_eligible('77000000-0000-4000-8000-000000000002'),'unread recipient eligible');
select public.market_claim_reminders() as claims \gset
select lease_token as lease from private.market_message_reminders where user_id='77000000-0000-4000-8000-000000000002' \gset
select pg_temp.ok(public.market_prepare_reminder('77000000-0000-4000-8000-000000000002',:'lease','recipient@example.invalid'),'leased address eligible');
select pg_temp.ok(not public.market_prepare_reminder('77000000-0000-4000-8000-000000000002',:'lease','old@example.invalid'),'old address denied');
select pg_temp.ok(jsonb_array_length(public.market_claim_reminders())=0,'concurrent claim excluded');
select public.market_finish_reminder('77000000-0000-4000-8000-000000000002',:'lease','retry');
select pg_temp.ok(jsonb_array_length(public.market_claim_reminders())=0,'retry backoff');
update private.market_message_reminders set next_attempt_at=now()-interval '1 minute' where user_id='77000000-0000-4000-8000-000000000002';
select public.market_claim_reminders();
select lease_token as lease from private.market_message_reminders where user_id='77000000-0000-4000-8000-000000000002' \gset
insert into private.market_message_preferences values('77000000-0000-4000-8000-000000000002',false);
select pg_temp.ok(not public.market_prepare_reminder('77000000-0000-4000-8000-000000000002',:'lease','recipient@example.invalid'),'optout after lease honored');
update private.market_message_preferences set email_enabled=true;
insert into public.member_notification_suppressions(recipient_email,reason) values('recipient@example.invalid','bounced');
select pg_temp.ok(not private.market_reminder_eligible('77000000-0000-4000-8000-000000000002'),'bounce suppression');
update public.member_notification_suppressions set recipient_email='sha256:'||encode(extensions.digest('recipient@example.invalid','sha256'),'hex') where recipient_email='recipient@example.invalid';
select pg_temp.ok(not private.market_reminder_eligible('77000000-0000-4000-8000-000000000002'),'hashed suppression');
delete from public.member_notification_suppressions where recipient_email='sha256:'||encode(extensions.digest('recipient@example.invalid','sha256'),'hex');
select public.market_finish_reminder('77000000-0000-4000-8000-000000000002',:'lease','accepted','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select pg_temp.ok(jsonb_array_length(public.market_claim_reminders())=0,'daily grouping');
update private.market_message_reminders set last_queued_at=now()-interval '2 days',attempts=5 where user_id='77000000-0000-4000-8000-000000000002';
-- Move queued_at backwards separately: now() is constant within this test transaction.
update private.market_message_reminders set queued_at=now()-interval '2 days' where user_id='77000000-0000-4000-8000-000000000002';
select pg_temp.ok(jsonb_array_length(public.market_claim_reminders())=1,'new daily generation resets delivery');
select id as lastmid from private.market_messages where conversation_id=:'cid' order by created_at desc,id desc limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000002',true);
select public.market_mark_read(:'cid',:'lastmid');
reset role;
select pg_temp.ok(not private.market_reminder_eligible('77000000-0000-4000-8000-000000000002'),'read cancels reminder');
select pg_temp.ok(exists(select 1 from private.market_reminder_deliveries where provider_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'accepted provider retained separately');
update private.market_message_reminders set status='sending',lease_until=now()-interval '1 minute' where user_id='77000000-0000-4000-8000-000000000002';
select public.market_claim_reminders();
select pg_temp.ok((select status='unknown' from private.market_message_reminders where user_id='77000000-0000-4000-8000-000000000002'),'expired in-flight send stays unknown, never retried');
select pg_temp.ok(not has_function_privilege('authenticated','public.market_attachment_cleanup_candidates()','execute'),'members cannot list cleanup paths');
select pg_temp.ok(not has_table_privilege('authenticated','private.market_reminder_deliveries','select'),'provider ledger private');
select set_config('request.jwt.claim.role','service_role',true);
select (public.member_notification_health()->>'unmatched_receipts')::int as baseline_unmatched \gset
select public.record_member_notification_event('market-delivered-test','cccccccc-cccc-4ccc-8ccc-cccccccccccc','email.delivered',now());
update public.member_notification_events set received_at=now()-interval '2 hours' where provider_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select pg_temp.ok((public.member_notification_health()->>'unmatched_receipts')::int=:'baseline_unmatched','delivered market ID recognized by shared monitor');
select public.record_member_notification_event('market-bounce-test','cccccccc-cccc-4ccc-8ccc-cccccccccccc','email.bounced',now());
select pg_temp.ok(exists(select 1 from public.member_notification_suppressions where recipient_email='sha256:'||encode(extensions.digest('recipient@example.invalid','sha256'),'hex')),'late market bounce suppresses hashed recipient');
update public.member_notification_events set received_at=now()-interval '2 hours' where provider_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select pg_temp.ok((public.member_notification_health()->>'unmatched_receipts')::int>:'baseline_unmatched','negative market receipt stays actionable');
rollback;
