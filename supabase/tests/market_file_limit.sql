begin;
insert into auth.users(id,email_confirmed_at) values('76000000-0000-4000-8000-000000000001',now()),('76000000-0000-4000-8000-000000000002',now());
insert into private.market_conversations(id,kind,status,initiator_id,recipient_id) values('76000000-0000-4000-8000-000000000090','direct','active','76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000001',true);
do $$ begin
 if public.market_prepare_attachment('76000000-0000-4000-8000-000000000090','boundary.txt','text/plain',50000000)->>'status'<>'quarantined' then raise exception 'Exact50 MB must be accepted'; end if;
 begin
  perform public.market_prepare_attachment('76000000-0000-4000-8000-000000000090','too-large.txt','text/plain',50000001);
 exception when others then return;
 end;
 raise exception '50 MB plus one byte must be rejected';
end $$;
reset role;
do $$ begin
 if (select file_size_limit from storage.buckets where id='market-files')<>50000000 then raise exception 'Bucket limit mismatch'; end if;
end $$;
rollback;
