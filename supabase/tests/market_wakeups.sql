begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'Failed: %',label; end if; end $$;
select pg_temp.ok((select count(*)=2 from cron.job where jobname in ('market-message-reminders-every-five-minutes','market-private-file-cleanup-daily') and not active),'both schedules installed disabled');
select pg_temp.ok((select schedule='*/5 * * * *' and command='select private.wake_market_message_reminders()' from cron.job where jobname='market-message-reminders-every-five-minutes'),'five-minute reminder schedule');
select pg_temp.ok((select schedule='23 2 * * *' and command='select private.wake_market_file_cleanup()' from cron.job where jobname='market-private-file-cleanup-daily'),'daily cleanup schedule');
select pg_temp.ok(not has_function_privilege('anon','private.wake_market_message_reminders()','EXECUTE') and not has_function_privilege('authenticated','private.wake_market_message_reminders()','EXECUTE') and not has_function_privilege('service_role','private.wake_market_message_reminders()','EXECUTE'),'reminder wake callable only by scheduler owner');
select pg_temp.ok(not has_function_privilege('anon','private.wake_market_file_cleanup()','EXECUTE') and not has_function_privilege('authenticated','private.wake_market_file_cleanup()','EXECUTE') and not has_function_privilege('service_role','private.wake_market_file_cleanup()','EXECUTE'),'cleanup wake callable only by scheduler owner');
select pg_temp.ok(not has_table_privilege('anon','vault.decrypted_secrets','SELECT') and not has_table_privilege('authenticated','vault.decrypted_secrets','SELECT'),'Vault remains private');
rollback;
