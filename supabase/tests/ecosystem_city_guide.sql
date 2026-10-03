begin;
create function pg_temp.validate_guide(extra jsonb) returns void language plpgsql as $$ begin
 perform private.validate_ecosystem_data('{"name":"Synthetic fixture","summary":"Synthetic public listing","primaryType":"supplier","websiteUrl":"https://example.test"}'::jsonb || extra);
end $$;
create function pg_temp.reject_guide(extra jsonb) returns void language plpgsql as $$ begin
 begin perform pg_temp.validate_guide(extra); exception when sqlstate '22023' then return; end;
 raise exception 'Expected validation rejection for %',extra;
end $$;
-- Existing stored payloads and optional empty fields remain valid.
select pg_temp.validate_guide('{}');
select pg_temp.validate_guide('{"city":"bangalore","guideCategories":[],"googleMapsUrl":""}');
select pg_temp.validate_guide('{"city":"bangalore","guideCategories":["workspaces","communities","cafes","build-source","living"]}');
select pg_temp.validate_guide(jsonb_build_object('googleMapsUrl',url)) from unnest(array[
 'https://maps.app.goo.gl/syntheticPlace',
 'https://maps.app.goo.gl/syntheticPlace?g_st=ic',
 'https://www.google.com/maps/place/Synthetic',
 'https://google.com/maps?cid=123',
 'https://maps.google.com/?q=Synthetic'
]) url;
select pg_temp.reject_guide(jsonb_build_object('googleMapsUrl',url)) from unnest(array[
 'http://maps.google.com/',
 'javascript:alert(1)',
 'https://google.com/search?q=Synthetic',
 'https://google.com/maps-redirect',
 'https://maps.app.goo.gl/',
 'https://maps.app.goo.gl.evil.test/place',
 'https://maps.google.com.evil.test/',
 'https://maps.google.com@evil.test/',
 'https://user:password@maps.google.com/',
 'https://maps.google.com:444/',
 'https://maps.google.com' || chr(92) || '@evil.test/',
 'https://maps.google.com/with space'
]) url;
select pg_temp.reject_guide('{"city":"mumbai"}');
-- PostgreSQL text/jsonb already rejects U+0000; exercise every other ASCII control and DEL.
select pg_temp.reject_guide(jsonb_build_object('googleMapsUrl','https://maps.google.com/' || chr(code)))
 from generate_series(1,31) code;
select pg_temp.reject_guide(jsonb_build_object('googleMapsUrl',chr(code) || 'https://maps.google.com/'))
 from generate_series(1,31) code;
select pg_temp.reject_guide(jsonb_build_object('googleMapsUrl','https://maps.google.com/' || chr(127)));
select pg_temp.reject_guide('{"city":null}');
select pg_temp.reject_guide('{"guideCategories":["invented"]}');
select pg_temp.reject_guide('{"guideCategories":"cafes"}');
select pg_temp.reject_guide('{"guideCategories":[null]}');
select pg_temp.reject_guide('{"googleMapsUrl":false}');
select pg_temp.reject_guide(jsonb_build_object('googleMapsUrl','https://maps.google.com/' || repeat('a',1000)));
select pg_temp.reject_guide('{"primaryType":"other","subcategory":"Housing resource","googleMapsUrl":"https://maps.google.com/?q=Synthetic"}');
select pg_temp.reject_guide('{"primaryType":"other","subcategory":"People","coordinates":[77,13],"locationPrecision":"Address-level"}');
select pg_temp.reject_guide('{"coordinates":[77,13],"locationPrecision":"City-level","googleMapsUrl":"https://maps.google.com/?q=Synthetic"}');
select pg_temp.reject_guide('{"submitterEmail":"private@example.test"}');
select pg_temp.reject_guide('{"publicPhones":[{"label":"Office","number":"8000000000"}]}');
select pg_temp.reject_guide('{"websiteUrl":"","googleMapsUrl":"https://maps.google.com/?q=Synthetic"}');
rollback;
