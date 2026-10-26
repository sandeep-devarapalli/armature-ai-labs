-- Run only on a disposable local database. All synthetic rows are rolled back.
\timing on
begin;
insert into public.talent_profiles(id,data)
select 'directory-benchmark-' || i, jsonb_build_object('name','Synthetic Person ' || i,'title',case when i % 3=0 then 'Firmware Engineer' else 'Robotics Software Engineer' end,'headline','Synthetic embedded drone benchmark','company','Synthetic Devices ' || i % 40,'location',case when i % 2=0 then 'Bangalore, Karnataka, India' else 'Bengaluru, Karnataka, India' end,'skills',jsonb_build_array('Embedded','SLAM'),'physicalAiAreas',jsonb_build_array('Drones'),'linkedinUrl','https://linkedin.com/in/directory-benchmark-' || i,'portfolioProjects',jsonb_build_array(jsonb_build_object('title','Synthetic controller','summary','Sensor acquisition','contribution','Implemented embedded drone telemetry','skills',jsonb_build_array('SPI','UAV'))))
from generate_series(1,8025) i;
analyze private.talent_directory_index;
set local role anon;
select public.search_talent_directory()->>'total' as total;
select public.search_talent_directory()->>'total' as total;
select public.search_talent_directory(p_query=>'embedded drone')->>'total' as total;
select public.search_talent_directory(p_query=>'embedded drone')->>'total' as total;
select public.search_talent_directory(p_query=>'embedded drone',p_location=>'bengaluru',p_categories=>array['SLAM'],p_company=>'Synthetic Devices 3')->>'total' as total;
select public.search_talent_directory(p_query=>'linkedin.com/in/directory-benchmark-8025')->>'total' as total;
select public.talent_directory_facets()->>'total' as total;
select public.talent_directory_facets()->>'total' as total;
reset role;
explain (analyze,buffers) select id from private.talent_directory_index where tokens @> array['embedded','drone'];
explain (analyze,buffers) select id from private.talent_directory_index where linkedin='directory-benchmark-8025';
rollback;
