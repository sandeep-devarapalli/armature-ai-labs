begin;
insert into auth.users(id,email_confirmed_at) values('78000000-0000-4000-8000-000000000001',now()),('78000000-0000-4000-8000-000000000002',now());
insert into public.talent_profiles(id,data) values('photo-test','{"name":"Synthetic photo owner","claimed":true,"linkedinUrl":"https://www.linkedin.com/in/photo-test"}');
insert into private.talent_owners values('photo-test','78000000-0000-4000-8000-000000000001',now());
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Failed: %',label; end if; end $$;
create function pg_temp.error(query text,code text) returns void language plpgsql as $$ begin begin execute query; exception when others then if sqlstate=code then return; else raise; end if; end; raise exception 'Missing error %',code; end $$;
set local role anon;
select pg_temp.error($q$select public.talent_photo_read('photo-test')$q$,'42501');
reset role;
set local role authenticated;
select pg_temp.error($q$select public.talent_photo_begin('photo-test','78000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.error('select * from public.talent_photo_cleanup','42501');
select pg_temp.error('select * from public.claim_talent_photo_cleanup(100)','42501');
reset role;
select pg_temp.error($q$select public.talent_photo_begin('photo-test','78000000-0000-4000-8000-000000000002')$q$,'42501');
select pg_temp.error($q$select private.talent_validate_patch('{"photoVersion":"fake"}')$q$,'22023');
select pg_temp.ok(public.talent_photo_read('photo-test') is null,'no auto publication');
select public.talent_photo_begin('photo-test','78000000-0000-4000-8000-000000000001') as token \gset
select public.talent_photo_begin('photo-test','78000000-0000-4000-8000-000000000001') as newer \gset
select pg_temp.ok(not public.talent_photo_finish('photo-test','78000000-0000-4000-8000-000000000001',:'token','78000000-0000-4000-8000-000000000001/'||:'token','image/png','upload','2026-10-13-public-photo-v1'),'stale upload rejected');
select pg_temp.error(format('select public.talent_photo_finish(%L,%L,%L,%L,%L,%L,%L)','photo-test','78000000-0000-4000-8000-000000000001',:'newer','78000000-0000-4000-8000-000000000001/'||:'newer','image/png','upload','old-consent'),'22023');
select pg_temp.ok(not public.talent_photo_finish('photo-test','78000000-0000-4000-8000-000000000001',:'newer','78000000-0000-4000-8000-000000000001/'||:'newer','image/png','upload','2026-10-13-public-photo-v1'),'missing reservation rejected');
insert into public.talent_photo_cleanup values('78000000-0000-4000-8000-000000000001/'||:'newer',clock_timestamp()+interval '1 hour');
select pg_temp.ok(not exists(select 1 from public.claim_talent_photo_cleanup(100) where object_path='78000000-0000-4000-8000-000000000001/'||:'newer'),'future reservation not cleaned');
select pg_temp.ok(public.talent_photo_finish('photo-test','78000000-0000-4000-8000-000000000001',:'newer','78000000-0000-4000-8000-000000000001/'||:'newer','image/png','membership','2026-10-13-public-photo-v1'),'consented photo publishes');
select pg_temp.ok(public.talent_photo_read('photo-test')->>'version'=:'newer','public current version');
select pg_temp.ok((select data->>'photoVersion'=:'newer' from public.talent_profiles where id='photo-test'),'public metadata only version');
select public.talent_photo_begin('photo-test','78000000-0000-4000-8000-000000000001',true);
select pg_temp.ok(public.talent_photo_read('photo-test') is null,'removal hides immediately');
select pg_temp.ok(exists(select 1 from public.talent_photo_cleanup where object_path='78000000-0000-4000-8000-000000000001/'||:'newer'),'removed copy queued');
select pg_temp.ok(not public.talent_photo_finish('photo-test','78000000-0000-4000-8000-000000000001',:'newer','78000000-0000-4000-8000-000000000001/'||:'newer','image/png','upload','2026-10-13-public-photo-v1'),'remove invalidates in flight');
select public.talent_photo_begin('photo-test','78000000-0000-4000-8000-000000000001') as expired \gset
insert into public.talent_photo_cleanup values('78000000-0000-4000-8000-000000000001/'||:'expired',clock_timestamp()-interval '1 second');
select pg_temp.ok(not public.talent_photo_finish('photo-test','78000000-0000-4000-8000-000000000001',:'expired','78000000-0000-4000-8000-000000000001/'||:'expired','image/png','upload','2026-10-13-public-photo-v1'),'expired reservation cannot publish');
select pg_temp.ok(exists(select 1 from public.claim_talent_photo_cleanup(100) where object_path='78000000-0000-4000-8000-000000000001/'||:'expired'),'expired reservation eligible for cleanup');
select public.talent_photo_begin('photo-test','78000000-0000-4000-8000-000000000001') as final \gset
insert into public.talent_photo_cleanup values('78000000-0000-4000-8000-000000000001/'||:'final',clock_timestamp()+interval '1 hour');
select pg_temp.ok(public.talent_photo_finish('photo-test','78000000-0000-4000-8000-000000000001',:'final','78000000-0000-4000-8000-000000000001/'||:'final','image/png','upload','2026-10-13-public-photo-v1'),'republish');
update public.talent_profiles set published=false where id='photo-test';
select pg_temp.ok(public.talent_photo_read('photo-test') is null,'unlisting hides');
select pg_temp.ok((select not(data?'photoVersion') from public.talent_profiles where id='photo-test'),'unlisting clears public version');
select pg_temp.ok(exists(select 1 from public.talent_photo_cleanup where object_path='78000000-0000-4000-8000-000000000001/'||:'final'),'unlisting queues copy');
select pg_temp.ok((select count(*)=3 from private.talent_photo_audit where profile_id='photo-test'),'publish and remove audited');
rollback;
