-- Run only against an isolated test database. Fixtures are rolled back.
begin;
insert into public.courses(id,slug,cover_url,requires_verified_membership) values
 ('79700000-0000-4000-8000-000000000001','catalogue-test-published','https://media.armatureailabs.com/covers/test-1600.webp',true),
 ('79700000-0000-4000-8000-000000000002','catalogue-test-hidden',null,false);
insert into public.course_versions(id,course_id,version,title,description,source_reference,source_sha256,status,access_tier)
select ('79800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('79700000-0000-4000-8000-'||lpad((case when n=5 then 2 else 1 end)::text,12,'0'))::uuid,
 n,'Catalogue test '||n,'Public summary','synthetic',repeat('a',64),
 case n when 3 then 'draft' when 4 then 'withdrawn' when 5 then 'withdrawn' else 'published' end,'free'
from generate_series(1,5)n;
insert into public.course_modules(id,course_version_id,source_id,title,position) values
 ('79900000-0000-4000-8000-000000000001','79800000-0000-4000-8000-000000000002','m1','Module',0);
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position) values
 ('79910000-0000-4000-8000-000000000001','79800000-0000-4000-8000-000000000002','79900000-0000-4000-8000-000000000001','l1','Lesson one',0),
 ('79910000-0000-4000-8000-000000000002','79800000-0000-4000-8000-000000000002','79900000-0000-4000-8000-000000000001','l2','Lesson two',1);
set local role anon;
do $$
declare catalog jsonb; row jsonb; fields text[];
begin
 catalog := public.get_public_course_catalog();
 if (select count(*) from jsonb_array_elements(catalog) c where c->>'id'='catalogue-test-published') <> 1 then raise exception 'Published course must appear exactly once'; end if;
 select c into row from jsonb_array_elements(catalog) c where c->>'id'='catalogue-test-published';
 if row->>'versionId' <> '79800000-0000-4000-8000-000000000002' then raise exception 'Wrong published version'; end if;
 if exists(select 1 from jsonb_array_elements(catalog) c where c->>'id'='catalogue-test-hidden') then raise exception 'Withdrawn-only course exposed'; end if;
 if row->>'moduleCount' <> '1' or row->>'lessonCount' <> '2' then raise exception 'Wrong counts'; end if;
 if row->>'requiresVerifiedMembership' <> 'true' then raise exception 'Membership requirement changed'; end if;
 if row->>'coverUrl' <> 'https://media.armatureailabs.com/covers/test-1600.webp' then raise exception 'Cover lost'; end if;
 select array_agg(key order by key) into fields from jsonb_object_keys(row) key;
 if fields <> array['accessTier','coverUrl','description','id','lessonCount','moduleCount','requiresVerifiedMembership','title','versionId'] then raise exception 'Unexpected public fields: %',fields; end if;
 if has_table_privilege('anon','public.course_versions','select') then raise exception 'Direct version access expanded'; end if;
 if has_function_privilege('anon','public.get_my_course_catalog()','execute') or has_function_privilege('anon','public.get_course_lesson(uuid)','execute') then raise exception 'Private course access expanded'; end if;
 raise notice 'PASS: anonymous metadata; latest published only; drafts/withdrawals hidden; counts/covers/access flags; exact field allowlist; existing grants unchanged';
end $$;
reset role;
set local role authenticated;
do $$begin
 if not exists(select 1 from jsonb_array_elements(public.get_public_course_catalog()) c where c->>'id'='catalogue-test-published') then raise exception 'Authenticated public discovery failed'; end if;
end $$;
reset role;
rollback;
