begin;
create function pg_temp.ok(v boolean,m text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'Assertion: %',m; end if; end $$;
insert into auth.users(id,email,email_confirmed_at) values('78000000-0000-4000-8000-000000000001','file-one@example.invalid',now()),('78000000-0000-4000-8000-000000000002','file-two@example.invalid',now());
insert into private.market_conversations(id,kind,status,initiator_id,recipient_id) values('78000000-0000-4000-8000-000000000003','direct','active','78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000002');
insert into private.market_attachments(id,conversation_id,uploader_id,filename,content_type,byte_size,object_path,status,created_at)
select ('78000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'78000000-0000-4000-8000-000000000003','78000000-0000-4000-8000-000000000001','fixture.txt','text/plain',10,'synthetic-cleanup/'||n,case when n=4 then 'clean' when n=5 then 'rejected' else 'quarantined' end,case when n=7 then now() else now()-interval '2 days' end from generate_series(4,7)n;
select public.market_attachment_cleanup_candidates();
select pg_temp.ok((select status='clean' from private.market_attachments where id='78000000-0000-4000-8000-000000000004'),'clean file preserved');
select pg_temp.ok((select status='rejected' from private.market_attachments where id='78000000-0000-4000-8000-000000000006'),'expired quarantine rejected before object deletion');
select public.market_attachment_scan_result('78000000-0000-4000-8000-000000000006',true);
select pg_temp.ok((select status='rejected' from private.market_attachments where id='78000000-0000-4000-8000-000000000006'),'late scan cannot make cleanup file downloadable');
select pg_temp.ok((select status='quarantined' from private.market_attachments where id='78000000-0000-4000-8000-000000000007'),'recent quarantine retained');
select public.market_attachment_cleanup_complete('78000000-0000-4000-8000-000000000006');
select pg_temp.ok((select purged_at is not null from private.market_attachments where id='78000000-0000-4000-8000-000000000006'),'successful object deletion can be recorded');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.market_attachment_cleanup_candidates()) a where a->>'id'='78000000-0000-4000-8000-000000000006'),'purged object no longer queued');
select pg_temp.ok(not has_function_privilege('authenticated','public.market_attachment_cleanup_complete(uuid)','execute'),'members cannot acknowledge purge');
rollback;
