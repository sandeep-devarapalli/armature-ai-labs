begin;
create function pg_temp.check_true(value boolean, message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.expect_error(query text, code text) returns void language plpgsql as $$ begin begin execute query; exception when others then if sqlstate=code then return; else raise; end if; end; raise exception 'Expected error %',code; end $$;
select pg_temp.check_true(private.talent_directory_tokens('Álvaro C++ ROS 2 हिंदी 日本語 Αθήνα')=array['alvaro','c++','ros2','ह','द','日本語','αθηνα'], 'Unicode letters, accents, symbols and ROS token normalization');
create function pg_temp.search_ids(query text default '', filters jsonb default '{}') returns jsonb language sql as $$
 select jsonb_path_query_array(public.search_talent_directory(query, coalesce(filters->>'location',''), coalesce(array(select jsonb_array_elements_text(filters->'category')),'{}'), coalesce(filters->>'company',''), coalesce(filters->>'sort','relevance'), coalesce((filters->>'page')::int,1), array['directory-search-a','directory-search-b','directory-search-c','directory-search-d']), '$.results[*].person.id')
$$;
insert into public.talent_profiles(id,data) values
 ('directory-search-a','{"name":"Sample Anya","title":"Firmware Engineer","headline":"UAV flight controllers","company":"Sample Circuits","previousCompanies":["Sample Instruments"],"location":"Bangalore, Karnataka, India","skills":["Embedded"],"physicalAiAreas":["Drones"],"linkedinUrl":"https://www.linkedin.com/in/synthetic-directory-search-a","checkedAt":"2026-10-26"}'),
 ('directory-search-b','{"name":"Sample Bharat","title":"Robotics Software Engineer","headline":"ROS 2 navigation","company":"Sample Circuits","location":"Bengaluru, Karnataka, India","skills":["SLAM"],"physicalAiAreas":["Navigation"],"linkedinUrl":"https://www.linkedin.com/in/synthetic-directory-search-b"}'),
 ('directory-search-c','{"name":"Sample Chen","title":"Account Manager","company":"Drone Robotics","previousCompanies":["Embedded Systems"],"location":"Chennai, Tamil Nadu, India","linkedinUrl":"https://www.linkedin.com/in/synthetic-directory-search-c"}'),
 ('directory-search-d','{"name":"Sample Devi","title":"Embedded Engineer","company":"Sample Devices","location":"Pune, Maharashtra, India","skills":["Embedded"],"linkedinUrl":"https://www.linkedin.com/in/synthetic-directory-search-d"}');
set local role anon;
select pg_temp.check_true(pg_temp.search_ids('sample anya') = '["directory-search-a"]', 'name search');
select pg_temp.check_true(pg_temp.search_ids('Sample Circuits') = '["directory-search-a","directory-search-b"]', 'current company search');
select pg_temp.check_true(pg_temp.search_ids('Sample Instruments') = '["directory-search-a"]', 'previous company search');
select pg_temp.check_true(pg_temp.search_ids('embedded engineers') = '["directory-search-a","directory-search-d"]', 'title aliases');
select pg_temp.check_true(pg_temp.search_ids('firmware') = '["directory-search-a","directory-search-d"]', 'firmware alias');
select pg_temp.check_true(pg_temp.search_ids('ROS2') = '["directory-search-b"]' and pg_temp.search_ids('ROS 2') = '["directory-search-b"]', 'ROS 2 spelling');
select pg_temp.check_true(pg_temp.search_ids('I want to find embedded engineers who have worked in drones') = '["directory-search-a"]', 'all natural-language capabilities required');
select pg_temp.check_true(pg_temp.search_ids('SLAM navigation') = '["directory-search-b"]' and pg_temp.search_ids('embedded SLAM') = '[]', 'all tokens required');
select pg_temp.check_true(pg_temp.search_ids('Bangalore') = '["directory-search-a","directory-search-b"]', 'Bangalore query alias');
select pg_temp.check_true(pg_temp.search_ids('', '{"location":"Bangalore"}') = '["directory-search-a","directory-search-b"]', 'Bangalore location alias');
select pg_temp.check_true(pg_temp.search_ids('', '{"location":"bengaluru"}') = '["directory-search-a","directory-search-b"]', 'Bengaluru location alias');
select pg_temp.check_true(pg_temp.search_ids('drone') = '["directory-search-a"]', 'employer is not skill evidence');
select pg_temp.check_true(pg_temp.search_ids('robotics') = '["directory-search-b"]', 'employer is not robotics evidence');
select pg_temp.check_true(pg_temp.search_ids('Drone Robotics') = '["directory-search-c"]', 'exact employer query remains supported');
select pg_temp.check_true(pg_temp.search_ids('', '{"category":["embedded"],"company":"sample circuits","location":"bengaluru"}') = '["directory-search-a"]', 'filters intersect');
select pg_temp.check_true(pg_temp.search_ids('', '{"category":["Embedded","SLAM","Drones"]}') = '["directory-search-a","directory-search-b","directory-search-d"]', 'selected categories union without duplicates');
select pg_temp.check_true(pg_temp.search_ids('', '{"company":"Sample Instruments"}') = '[]', 'company filter only current employer');
select pg_temp.check_true(pg_temp.search_ids('nonexistent-specialization') = '[]', 'missing terms have zero results');
select pg_temp.check_true(pg_temp.search_ids('linkedin.com/in/synthetic-directory-search-a/', '{"category":["SLAM"],"company":"Other","location":"Chennai"}') = '["directory-search-a"]', 'LinkedIn exact identity overrides search filters');
select pg_temp.check_true(pg_temp.search_ids('http://in.linkedin.com/in/SYNTHETIC-DIRECTORY-SEARCH-A?trk=share#about') = '["directory-search-a"]', 'LinkedIn country domain and case');
select pg_temp.check_true(pg_temp.search_ids('https://www.linkedin.com/in/synthetic-directory-search-%61') = '["directory-search-a"]', 'LinkedIn percent decode');
select pg_temp.check_true(pg_temp.search_ids('HTTPS://WWW.LINKEDIN.COM/in/synthetic-directory-search-a') = '["directory-search-a"]' and pg_temp.search_ids('https://www.linkedin.com/IN/synthetic-directory-search-a')='["directory-search-a"]', 'LinkedIn URL case handling matches the existing identity parser');
select pg_temp.check_true(pg_temp.search_ids('https://linkedin.com.evil.example/in/synthetic-directory-search-a') = '[]' and pg_temp.search_ids('https://linkedin.com/company/synthetic-directory-search-a') = '[]' and pg_temp.search_ids('https://linkedin.com/in/%XX') = '[]', 'invalid LinkedIn identities rejected');
select pg_temp.expect_error($q$select public.search_talent_directory(p_query=>repeat('a',1001))$q$, '22023');
select pg_temp.expect_error($q$select public.search_talent_directory(p_categories=>array[repeat('a',251)])$q$, '22023');
select pg_temp.expect_error($q$select public.search_talent_directory(p_ids=>array[repeat('a',121)])$q$, '22023');
select pg_temp.expect_error($q$select public.search_talent_directory(p_sort=>'unexpected')$q$, '22023');
select pg_temp.check_true((public.search_talent_directory(p_ids=>'{}')->>'total')::int = 0, 'empty shortlist means no results');
select pg_temp.check_true((public.search_talent_directory(p_ids=>array['directory-search-a'])->'results'->0->'person') ?& array['id','revision','name','headline','title','company','location','linkedinUrl'], 'compact card keys');
select pg_temp.check_true(not ((public.search_talent_directory(p_ids=>array['directory-search-a'])->'results'->0->'person') ?| array['portfolioProjects','experience','education','summary','previousCompanies']), 'full details excluded from cards');
reset role;

insert into public.talent_profiles(id,data) values
 ('directory-search-portfolio','{"name":"Portfolio","source":"member","linkedinUrl":"https://linkedin.com/in/synthetic-directory-search-portfolio","portfolioProjects":[{"title":"Board bring-up","summary":"Real-time sensor acquisition","contribution":"Wrote embedded drivers and drone telemetry","skills":["SPI"],"evidenceUrl":"https://example.org/secretkeyword"}]}'),
 ('directory-search-employer-only','{"name":"Employer only","title":"Embedded Engineer","company":"Drone Works","linkedinUrl":"https://linkedin.com/in/synthetic-directory-search-employer-only","portfolioProjects":[{"title":"Board bring-up","summary":"Real-time sensor acquisition","contribution":"Built invoice software","skills":["SPI"]}]}'),
 ('directory-search-skills','{"name":"Skills","linkedinUrl":"https://linkedin.com/in/synthetic-directory-search-skills","portfolioProjects":[{"title":"Board bring-up","summary":"Real-time sensor acquisition","contribution":"Implemented a controller","skills":["Firmware","UAV"]}]}');
set local role anon;
select pg_temp.check_true(jsonb_path_query_array(public.search_talent_directory(p_query=>'embedded drone',p_ids=>array['directory-search-portfolio','directory-search-employer-only','directory-search-skills']), '$.results[*].person.id') = '["directory-search-portfolio","directory-search-skills"]', 'portfolio capability evidence');
select pg_temp.check_true(public.search_talent_directory(p_query=>'embedded drone',p_ids=>array['directory-search-portfolio'])->'results'->0->'matches' = '["Project 1 (self-reported) individual contribution: Wrote embedded drivers and drone telemetry"]', 'precise individual contribution label');
select pg_temp.check_true(public.search_talent_directory(p_query=>'embedded drone',p_ids=>array['directory-search-skills'])->'results'->0->'matches' = '["Project 1 (self-reported) skill: Firmware","Project 1 (self-reported) skill: UAV"]', 'project skill labels and order');
select pg_temp.check_true((public.search_talent_directory(p_query=>'secretkeyword',p_ids=>array['directory-search-portfolio'])->>'total')::int = 0, 'evidence URLs are not searched');
reset role;

insert into public.talent_profiles(id,data) select 'directory-search-page-' || i, jsonb_build_object('name','Synthetic Person ' || i,'linkedinUrl','https://linkedin.com/in/synthetic-directory-search-page-' || i,'skills',jsonb_build_array('Embedded','Embedded')) from generate_series(1,31) i;
set local role anon;
select pg_temp.check_true(jsonb_array_length(public.search_talent_directory(p_query=>'Synthetic Person')->'results')=25 and (public.search_talent_directory(p_query=>'Synthetic Person')->>'total')::int=31, '25-result page with whole result count');
select pg_temp.check_true(public.search_talent_directory(p_query=>'Synthetic Person')->'results'->1->'person'->>'name'='Synthetic Person 2', 'natural numeric name ordering');
select pg_temp.check_true(jsonb_array_length(public.search_talent_directory(p_query=>'Synthetic Person',p_page=>2)->'results')=6, 'second page');
select pg_temp.check_true((public.search_talent_directory(p_query=>'Synthetic Person',p_page=>2147483647)->>'page')::int=2, 'out-of-range page clamped');
select pg_temp.check_true((public.search_talent_directory(p_query=>'Synthetic Person',p_page=>-5)->>'page')::int=1, 'negative page clamped');
select pg_temp.check_true((public.talent_directory_facets()->'specialties'->>'Embedded')::int>=33, 'facets count people rather than duplicate tags');
reset role;
update public.talent_profiles set data=jsonb_set(data,'{title}','"Photonics Engineer"'),revision=revision+1 where id='directory-search-a';
set local role anon;
select pg_temp.check_true(pg_temp.search_ids('photonics')='["directory-search-a"]', 'profile edits update search atomically');
select pg_temp.check_true(public.search_talent_directory(p_ids=>array['directory-search-a'])->'results'->0->'person'->>'revision'='2', 'profile revision updated');
reset role;
update public.talent_profiles set published=false where id='directory-search-a';
set local role anon;
select pg_temp.check_true(pg_temp.search_ids('photonics')='[]' and pg_temp.search_ids('linkedin.com/in/synthetic-directory-search-a')='[]', 'unlisted profile immediately removed from search and identity lookup');
reset role;
select pg_temp.check_true(not exists(select 1 from private.talent_directory_index where id='directory-search-a'), 'unlisted projection deleted');
delete from public.talent_profiles where id='directory-search-skills';
select pg_temp.check_true(not exists(select 1 from private.talent_directory_index where id='directory-search-skills'), 'deleted projection cascades');
select pg_temp.check_true(not has_table_privilege('anon','private.talent_directory_index','SELECT') and not has_table_privilege('authenticated','private.talent_directory_index','INSERT'), 'search projection inaccessible to clients');
select pg_temp.check_true(not has_function_privilege('anon','private.talent_directory_index_profile(public.talent_profiles)','EXECUTE'), 'clients cannot invoke projection writer');
select pg_temp.check_true(has_function_privilege('anon','public.search_talent_directory(text,text,text[],text,text,integer,text[])','EXECUTE'), 'anonymous public search enabled');
rollback;
