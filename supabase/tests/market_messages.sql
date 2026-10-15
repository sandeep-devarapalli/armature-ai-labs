begin;
insert into auth.users(id,email_confirmed_at) values ('76000000-0000-4000-8000-000000000001',now()),('76000000-0000-4000-8000-000000000002',now()),('76000000-0000-4000-8000-000000000003',now());
insert into public.talent_profiles(id,data) values('message-test','{"name":"Synthetic Owner","linkedinUrl":"https://www.linkedin.com/in/message-test"}');
insert into private.talent_owners(profile_id,user_id) values('message-test','76000000-0000-4000-8000-000000000002');
create function pg_temp.check_true(v boolean,m text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'Assertion: %',m; end if; end $$;
create function pg_temp.denied(q text) returns void language plpgsql as $$ begin begin execute q; exception when others then return; end; raise exception 'Expected denial: %',q; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000001',true);
select public.market_chat_request('message-test','Hello, engineering collaboration request') as cid \gset
select pg_temp.check_true(public.market_chat_request('message-test','Repeated intro')=:'cid','repeat request returns same conversation');
select pg_temp.check_true(jsonb_array_length(public.market_thread(:'cid')->'messages')=1,'exactly one intro');
select pg_temp.denied(format('select public.market_send_message(%L,''Too early'',gen_random_uuid())',:'cid'));
select pg_temp.denied(format('select public.market_chat_respond(%L,''accept'')',:'cid'));
select pg_temp.denied(format('select public.market_prepare_attachment(%L,''file.pdf'',''application/pdf'',20)',:'cid'));
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000003',true);
select pg_temp.denied(format('select public.market_thread(%L)',:'cid'));
select pg_temp.check_true(jsonb_array_length(public.market_conversations())=0,'outsider inbox empty');
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((public.market_conversations()->0->>'unread_count')::int=1,'intro unread');
select public.market_chat_respond(:'cid','accept');
select public.market_send_message(:'cid','Welcome https://example.com','76000000-0000-4000-8000-000000000099') as mid \gset
select pg_temp.check_true(public.market_send_message(:'cid','Welcome https://example.com','76000000-0000-4000-8000-000000000099')=:'mid','retry idempotent');
select pg_temp.denied(format('select public.market_send_message(%L,''Changed'',''76000000-0000-4000-8000-000000000099'')',:'cid'));
select public.market_mark_read(:'cid',:'mid');
select pg_temp.check_true((public.market_conversations()->0->>'unread_count')::int=0,'read clears count');
select pg_temp.denied(format('select public.market_prepare_attachment(%L,''bad.html'',''text/html'',20)',:'cid'));
select pg_temp.denied(format('select public.market_prepare_attachment(%L,''big.pdf'',''application/pdf'',50000001)',:'cid'));
select pg_temp.check_true(public.market_prepare_attachment(:'cid','boundary.txt','text/plain',50000000)->>'status'='quarantined','exact decimal50 MB accepted');
select (public.market_prepare_attachment(:'cid','design.step','application/octet-stream',100)->>'id') as aid \gset
select pg_temp.denied(format('select public.market_attachment_access(%L)',:'aid'));
select pg_temp.denied(format('select public.market_attachment_scan_result(%L,true)',:'aid'));
reset role;
select public.market_attachment_scan_result(:'aid',true);
set local role authenticated;
select pg_temp.check_true(public.market_attachment_access(:'aid')->>'filename'='design.step','clean file accessible');
select public.market_report(:'cid','Synthetic inappropriate message test') as rid \gset
select pg_temp.denied(format('select public.market_case_thread(%L)',:'rid'));
reset role;
insert into public.staff_roles(user_id,role) values('76000000-0000-4000-8000-000000000003','membership_reviewer');
update private.market_review_cases set reviewer_id='76000000-0000-4000-8000-000000000003',status='assigned' where report_id=:'rid';
insert into private.market_case_reviewers values(:'rid','76000000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(jsonb_array_length(public.market_case_thread(:'rid')->'messages')=2,'assigned case reviewer can inspect');
reset role;
delete from public.staff_roles where user_id='76000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.denied(format('select public.market_case_thread(%L)',:'rid'));

select pg_temp.denied(format('select public.market_attachment_access(%L)',:'aid'));
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000001',true);
select public.market_send_message(:'cid','Arrived after earlier thread fetch','76000000-0000-4000-8000-000000000088') as late_mid \gset
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000002',true);
select public.market_mark_read(:'cid',:'mid');
select pg_temp.check_true((public.market_conversations()->0->>'unread_count')::int=1,'unseen concurrent message remains unread');
select public.market_mark_read(:'cid',:'late_mid');
select public.market_mark_read(:'cid',:'mid');
select pg_temp.check_true((public.market_conversations()->0->>'unread_count')::int=0,'stale read does not move cursor backward');
select pg_temp.denied(format('select public.market_mark_read(%L,gen_random_uuid())',:'cid'));
select public.market_chat_respond(:'cid','block');
select pg_temp.denied(format('select public.market_send_message(%L,''Blocked'',gen_random_uuid())',:'cid'));
select pg_temp.denied(format('select public.market_attachment_access(%L)',:'aid'));
select pg_temp.denied('select * from private.market_messages');
reset role;
select pg_temp.check_true((select count(*)=1 from private.market_case_access where report_id=:'rid'),'case access audited');
set local role authenticated;
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000003',true);
select public.market_chat_request('message-test','Second synthetic member introduction') as declined \gset
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000002',true);
select public.market_chat_respond(:'declined','decline');
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(public.market_chat_request('message-test','Cannot bypass decline')=:'declined','decline cannot be bypassed');
select pg_temp.denied(format('select public.market_send_message(%L,''Declined'',gen_random_uuid())',:'declined'));
select public.market_message_preferences(false);
reset role;
select pg_temp.check_true((select not email_enabled from private.market_message_preferences where user_id='76000000-0000-4000-8000-000000000003'),'email optout persists');
insert into public.staff_roles(user_id,role) values('76000000-0000-4000-8000-000000000003','admin');
set local role authenticated;
select pg_temp.denied(format('select public.market_thread(%L)',:'cid'));
reset role;
select pg_temp.check_true(has_function_privilege('anon','public.market_list_projects()','EXECUTE'),'anonymous feed remains allowed');
select pg_temp.check_true(not has_function_privilege('authenticated','public.market_simulate_payment(uuid,text)','EXECUTE'),'payment simulation is service only');
select pg_temp.check_true(not has_function_privilege('authenticated','public.market_process_reminders()','EXECUTE'),'project reminder processing is service only');
select private.market_project_conversation('76000000-0000-4000-8000-000000000070','76000000-0000-4000-8000-000000000071','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002') as pcid \gset
update private.market_conversations set status='blocked' where id=:'pcid';
select pg_temp.check_true(private.market_project_conversation('76000000-0000-4000-8000-000000000070','76000000-0000-4000-8000-000000000072','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002')=:'pcid','proposal revision retains conversation');
select pg_temp.check_true((select status='blocked' from private.market_conversations where id=:'pcid'),'revision cannot unblock');
rollback;
