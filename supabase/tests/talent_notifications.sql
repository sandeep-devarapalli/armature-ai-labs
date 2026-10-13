begin;
-- Synthetic queue tests must never wake the external sender.
insert into public.member_notification_settings(singleton) values(true) on conflict do nothing;
update public.member_notification_settings set immediate_enabled=false,enabled=true,all_members_enabled=true,talent_notifications_enabled=true;
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect_error(query text,code text) returns void language plpgsql as $$ begin begin execute query; exception when others then if sqlstate=code then return; else raise; end if; end; raise exception 'Expected error %',code; end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('73000000-0000-4000-8000-000000000001','talent-notices@example.test',now()),
 ('73000000-0000-4000-8000-000000000002','hello@armatureailabs.com',now()),
 ('73000000-0000-4000-8000-000000000003','talent-other@example.test',now());
insert into public.staff_roles(user_id,role) values('73000000-0000-4000-8000-000000000002','admin');
insert into public.talent_profiles(id,data) values('notice-test','{"name":"Synthetic notification profile","linkedinUrl":"https://www.linkedin.com/in/notice-test"}');
insert into private.talent_requests(id,profile_id,requester_id,kind,evidence,base_revision)
 values('73000000-0000-4000-8000-000000000010','notice-test','73000000-0000-4000-8000-000000000001','claim','PRIVATE EVIDENCE NEVER IN EMAIL',1);
select pg_temp.check_true((select count(*)=1 from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000010' and kind='talent_admin_claim' and template_version=4 and recipient_id='73000000-0000-4000-8000-000000000002'),'new claim notifies authorized hello admin');
select pg_temp.check_true(not exists(select 1 from public.basic_onboarding_applications where user_id='73000000-0000-4000-8000-000000000001'),'requester has no membership application');
select pg_temp.check_true(private.member_notification_eligible(n),'talent admin eligible without requester membership') from public.member_notifications n where talent_request_id='73000000-0000-4000-8000-000000000010';
update public.member_notification_settings set enabled=false;
select pg_temp.check_true(not private.member_notification_eligible(n),'global delivery gate still applies') from public.member_notifications n where talent_request_id='73000000-0000-4000-8000-000000000010';
update public.member_notification_settings set enabled=true,all_members_enabled=false,pilot_recipients='{}';
select pg_temp.check_true(not private.member_notification_eligible(n),'pilot allowlist still applies') from public.member_notifications n where talent_request_id='73000000-0000-4000-8000-000000000010';
update public.member_notification_settings set all_members_enabled=true;
do $$ declare uid uuid; n public.member_notifications; begin
 foreach uid in array array['73000000-0000-4000-8000-000000000001'::uuid,'73000000-0000-4000-8000-000000000002'::uuid] loop
  update auth.users set banned_until=now()+interval '1 day' where id=uid;
  select * into n from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000010';
  perform pg_temp.check_true(not private.member_notification_eligible(n),'banned subject/recipient denied');
  update auth.users set banned_until=null where id=uid;
  insert into public.memberships(user_id,status) values(uid,'suspended') on conflict(user_id) do update set status='suspended';
  perform pg_temp.check_true(not private.member_notification_eligible(n),'suspended subject/recipient denied');
  update public.memberships set status='pending' where user_id=uid;
  insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
   values(uid,'Synthetic notice account','fixture@example.test','+919999999999','https://www.linkedin.com/in/fixture','1990-01-01','revoked');
  perform pg_temp.check_true(not private.member_notification_eligible(n),'revoked subject/recipient denied');
  delete from public.basic_onboarding_applications where user_id=uid;
 end loop;
end $$;
select private.enqueue_talent_notification('73000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000002','talent_admin_claim');
select pg_temp.check_true((select count(*)=1 from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000010'),'duplicate event is idempotent');
select pg_temp.check_true((select bool_and(position('PRIVATE EVIDENCE' in row_to_json(n)::text)=0) from public.member_notifications n where talent_request_id='73000000-0000-4000-8000-000000000010'),'queue carries no private request evidence');
-- Role is checked again when the sender prepares delivery, not just at enqueue.
update public.member_notifications set state='leased',lease_token='73000000-0000-4000-8000-000000000099',lease_until=now()+interval '2 minutes' where talent_request_id='73000000-0000-4000-8000-000000000010';
delete from public.staff_roles where user_id='73000000-0000-4000-8000-000000000002';
select pg_temp.check_true(not public.prepare_member_notification(id,lease_token),'admin role revocation blocks prepared send') from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000010';
insert into public.staff_roles(user_id,role) values('73000000-0000-4000-8000-000000000002','admin');
update private.talent_requests set status='approved',review_note='Verified outside email',reviewed_at=now() where id='73000000-0000-4000-8000-000000000010';
select pg_temp.check_true((select count(*)=1 from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000010' and kind='talent_claim_approved' and recipient_id='73000000-0000-4000-8000-000000000001'),'decision reaches requester');
select pg_temp.check_true(private.member_notification_eligible(n),'requester decision eligible without membership') from public.member_notifications n where talent_request_id='73000000-0000-4000-8000-000000000010' and kind='talent_claim_approved';
select pg_temp.check_true(not private.member_notification_eligible(n),'resolved request makes pending reviewer mail stale') from public.member_notifications n where talent_request_id='73000000-0000-4000-8000-000000000010' and kind='talent_admin_claim';
update private.talent_requests set status='approved',review_note='A note-only update must not email' where id='73000000-0000-4000-8000-000000000010';
select pg_temp.check_true((select count(*)=2 from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000010'),'repeated terminal status does not resend');
update public.member_notifications set state='leased',lease_token='73000000-0000-4000-8000-000000000099',lease_until=now()+interval '2 minutes' where talent_request_id='73000000-0000-4000-8000-000000000010' and kind='talent_claim_approved';
update auth.users set email='changed@example.test' where id='73000000-0000-4000-8000-000000000001';
select pg_temp.check_true(not public.prepare_member_notification(id,lease_token),'changed email blocks prepared send') from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000010' and kind='talent_claim_approved';
update auth.users set email='talent-notices@example.test' where id='73000000-0000-4000-8000-000000000001';
-- All nine templates are emitted from fresh transitions, with no replay of terminal inserts.
do $$ declare k text; d text; rid uuid; begin
 foreach k in array array['claim','correction','removal'] loop
  foreach d in array array['approved','rejected'] loop
   insert into private.talent_requests(profile_id,requester_id,kind,evidence,base_revision)
   values('notice-test','73000000-0000-4000-8000-000000000001',k,'Synthetic evidence',1) returning id into rid;
   update private.talent_requests set status=d where id=rid;
  end loop;
 end loop;
end $$;
select pg_temp.check_true((select count(distinct kind)=9 from public.member_notifications where user_id='73000000-0000-4000-8000-000000000001' and template_version=4),'all nine talent template kinds emitted');
insert into private.talent_requests(id,profile_id,requester_id,kind,evidence,base_revision,status) values('73000000-0000-4000-8000-000000000011','notice-test','73000000-0000-4000-8000-000000000001','claim','Historical import',1,'approved');
select pg_temp.check_true(not exists(select 1 from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000011'),'terminal history insert never replays');
update public.member_notification_settings set talent_notifications_enabled=false;
insert into private.talent_requests(id,profile_id,requester_id,kind,evidence,base_revision) values('73000000-0000-4000-8000-000000000012','notice-test','73000000-0000-4000-8000-000000000001','removal','Held synthetic example',1);
select pg_temp.check_true((select state='held' from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000012'),'disabled talent gate holds new event');
update public.member_notification_settings set talent_notifications_enabled=true;
select private.enqueue_talent_notification('73000000-0000-4000-8000-000000000012','73000000-0000-4000-8000-000000000002','talent_admin_removal');
select pg_temp.check_true((select state='held' from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000012'),'activation and duplicate enqueue cannot release held history');
insert into public.member_notification_suppressions(recipient_email,reason) values('talent-notices@example.test','bounced');
select pg_temp.check_true((select bool_and(not private.member_notification_eligible(n)) from public.member_notifications n where recipient_id='73000000-0000-4000-8000-000000000001'),'existing bounce suppression applies to talent');
delete from public.member_notification_suppressions where recipient_email='talent-notices@example.test';
insert into public.member_notification_tombstones(event_key,user_id,recipient_id,kind,template_version,recipient_hash)
select event_key,user_id,recipient_id,kind,template_version,'synthetic' from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000012';
delete from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000012';
select private.enqueue_talent_notification('73000000-0000-4000-8000-000000000012','73000000-0000-4000-8000-000000000002','talent_admin_removal');
select pg_temp.check_true(not exists(select 1 from public.member_notifications where talent_request_id='73000000-0000-4000-8000-000000000012'),'retained tombstone prevents archived event replay');
update public.talent_profiles set published=false where id='notice-test';
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true(jsonb_array_length(public.talent_my_requests())=9,'requester sees own history including removed profile');
select pg_temp.check_true((public.talent_my_requests()->0->>'published')::boolean=false,'removed profile remains clearly unpublished');
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(public.talent_my_requests()='[]'::jsonb,'other member cannot read request history');
select pg_temp.expect_error($q$select private.enqueue_talent_notification('73000000-0000-4000-8000-000000000012','73000000-0000-4000-8000-000000000002','talent_admin_removal')$q$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error('select public.talent_my_requests()','42501');
reset role;
rollback;
