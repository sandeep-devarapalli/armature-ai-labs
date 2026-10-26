-- Keep the public directory paginated without transferring private or full-profile fields.
create collation private.talent_directory_order (provider = icu, locale = 'en-u-kn-true-ks-level1', deterministic = false);
create collation private.talent_directory_text (provider = icu, locale = 'und', deterministic = true);

create function private.talent_directory_normalize(value text) returns text
language sql immutable strict set search_path = '' as $$
 select regexp_replace(lower(regexp_replace(normalize(value, NFKD), U&'[\0300-\036f]', '', 'g') collate private.talent_directory_text), 'ros[[:space:]]+2\y', 'ros2', 'g')
$$;

create function private.talent_directory_strings(value jsonb) returns text[]
language sql immutable set search_path = '' as $$
 select coalesce(array_agg(item #>> '{}'), '{}') from jsonb_array_elements(case when jsonb_typeof(value) = 'array' then value else '[]' end) item where jsonb_typeof(item) = 'string'
$$;

create function private.talent_directory_tokens(value text) returns text[]
language sql immutable set search_path = '' as $$
 select coalesce(array_agg(case token when 'bangalore' then 'bengaluru' when 'firmware' then 'embedded' when 'drones' then 'drone' when 'uav' then 'drone' when 'uavs' then 'drone' when 'engineers' then 'engineer' when 'robots' then 'robot' when 'robotics' then 'robot' when 'systems' then 'system' else token end), '{}')
 from (select match[1] token from regexp_matches(private.talent_directory_normalize(coalesce(value, '')) collate private.talent_directory_text, '[[:alnum:]+#]+', 'g') match) tokens
$$;

create function private.talent_directory_linkedin(value text) returns text
language plpgsql immutable set search_path = '' as $$
declare link text; parts text[]; segment text; output bytea := ''::bytea; i integer := 1;
begin
 link := regexp_replace(trim(value), E'[\t\n\r]', '', 'g');
 link := regexp_replace(link, '^https?://', 'https://', 'i');
 if link !~* '^https://' then link := 'https://' || link; end if;
 link := replace(link, chr(92), '/');
 parts := regexp_match(link, '^https://([^/]+)(/.*)$', 'i');
 if parts is null or lower(parts[1]) !~ '^(?:www\.|[a-z]{2}\.)?linkedin\.com(?::0*443)?$' then return null; end if;
 segment := (regexp_match(parts[2], '^/in/([^/?#]+)/?(?:[?#].*)?$', 'i'))[1];
 if segment is null or segment ~* '^(\.|%2e){1,2}$' then return null; end if;
 while i <= length(segment) loop
  if substr(segment, i, 1) = '%' then
   if substr(segment, i + 1, 2) !~ '^[0-9a-fA-F]{2}$' then return null; end if;
   output := output || decode(substr(segment, i + 1, 2), 'hex'); i := i + 3;
  else
   output := output || convert_to(substr(segment, i, 1), 'UTF8'); i := i + 1;
  end if;
 end loop;
 return lower(normalize(convert_from(output, 'UTF8'), NFC) collate private.talent_directory_text);
exception when others then return null;
end $$;

create function private.talent_directory_field(label text, value text, weight integer, employer boolean default false) returns jsonb
language sql immutable set search_path = '' as $$
 select case when coalesce(value, '') = '' then null else jsonb_build_object('label', label, 'value', value, 'normalized', trim(private.talent_directory_normalize(value)), 'tokens', to_jsonb(private.talent_directory_tokens(value)), 'weight', weight, 'employer', employer) end
$$;

create table private.talent_directory_index (
 id text primary key references public.talent_profiles(id) on delete cascade,
 card jsonb not null,
 fields jsonb not null,
 name text collate private.talent_directory_order not null,
 linkedin text,
 location text not null,
 location_tokens text[] not null,
 categories text[] not null,
 company text not null,
 identity_names text[] not null,
 tokens text[] not null,
 capability_tokens text[] not null,
 weights jsonb not null,
 capability_weights jsonb not null
);
alter table private.talent_directory_index enable row level security;
revoke all on private.talent_directory_index from public, anon, authenticated;
create index talent_directory_tokens on private.talent_directory_index using gin(tokens);
create index talent_directory_capabilities on private.talent_directory_index using gin(capability_tokens);
create index talent_directory_categories on private.talent_directory_index using gin(categories);
create index talent_directory_location on private.talent_directory_index(location);
create index talent_directory_company on private.talent_directory_index(company);
create index talent_directory_linkedin on private.talent_directory_index(linkedin);
create index talent_directory_name on private.talent_directory_index(name, id collate private.talent_directory_order);

create function private.talent_directory_index_profile(profile public.talent_profiles) returns void
language plpgsql security definer set search_path = '' as $$
declare data jsonb := profile.data; fields jsonb; value text; project record; label text; all_tokens text[]; capability_tokens text[]; weights jsonb; capability_weights jsonb; identities text[]; card jsonb;
begin
 if not profile.published then delete from private.talent_directory_index where id = profile.id; return; end if;
 fields := jsonb_build_array(
  private.talent_directory_field('Name', data->>'name', 10),
  private.talent_directory_field('Title', data->>'title', 8),
  private.talent_directory_field('Headline', data->>'headline', 5),
  private.talent_directory_field('Location', data->>'location', 2));
 foreach value in array private.talent_directory_strings(data->'skills') loop
  fields := fields || jsonb_build_array(private.talent_directory_field(case when data->>'source' = 'member' then 'Member-provided skill' else 'Research-derived skill category' end, value, 3));
 end loop;
 foreach value in array private.talent_directory_strings(data->'physicalAiAreas') loop
  fields := fields || jsonb_build_array(private.talent_directory_field(case when data->>'source' = 'member' then 'Member-provided physical-AI category' else 'Research-derived physical-AI category' end, value, 3));
 end loop;
 for project in select item, ordinal from jsonb_array_elements(case when jsonb_typeof(data->'portfolioProjects') = 'array' then data->'portfolioProjects' else '[]' end) with ordinality projects(item, ordinal) where jsonb_typeof(item) = 'object' loop
  label := 'Project ' || project.ordinal || ' (self-reported)';
  fields := fields || jsonb_build_array(private.talent_directory_field(label || ' title', project.item->>'title', 4), private.talent_directory_field(label || ' summary', project.item->>'summary', 3), private.talent_directory_field(label || ' individual contribution', project.item->>'contribution', 5));
  foreach value in array private.talent_directory_strings(project.item->'skills') loop fields := fields || jsonb_build_array(private.talent_directory_field(label || ' skill', value, 3)); end loop;
 end loop;
 fields := fields || jsonb_build_array(private.talent_directory_field('Company', data->>'company', 4, true));
 foreach value in array private.talent_directory_strings(data->'previousCompanies') loop fields := fields || jsonb_build_array(private.talent_directory_field('Previous company', value, 2, true)); end loop;
 select coalesce(jsonb_agg(field), '[]') into fields from jsonb_array_elements(fields) field where field <> 'null'::jsonb;
 select coalesce(array_agg(token), '{}'), coalesce(jsonb_object_agg(token, weight), '{}') into all_tokens, weights
 from (select token, max((field->>'weight')::integer) weight from jsonb_array_elements(fields) field cross join lateral jsonb_array_elements_text(field->'tokens') token group by token) tokens;
 select coalesce(array_agg(token), '{}'), coalesce(jsonb_object_agg(token, weight), '{}') into capability_tokens, capability_weights
 from (select token, max((field->>'weight')::integer) weight from jsonb_array_elements(fields) field cross join lateral jsonb_array_elements_text(field->'tokens') token where field->>'label' <> 'Name' and not (field->>'employer')::boolean group by token) tokens;
 select coalesce(array_agg(field->>'normalized'), '{}') into identities from jsonb_array_elements(fields) field where field->>'label' = 'Name' or (field->>'employer')::boolean;
 select jsonb_strip_nulls(jsonb_object_agg(entry.key, entry.value)) into card from jsonb_each(data) entry where entry.key in ('name','title','headline','company','location','skills','physicalAiAreas','checkedAt','linkedinUrl','claimed','source','availability','photoVersion');
 card := coalesce(card, '{}') || jsonb_build_object('id', profile.id, 'revision', profile.revision);
 insert into private.talent_directory_index(id, card, fields, name, linkedin, location, location_tokens, categories, company, identity_names, tokens, capability_tokens, weights, capability_weights)
 values(profile.id, card, fields, coalesce(data->>'name', ''), private.talent_directory_linkedin(data->>'linkedinUrl'), private.talent_directory_normalize(coalesce(data->>'location', '')), private.talent_directory_tokens(data->>'location'), array(select private.talent_directory_normalize(c) from unnest(private.talent_directory_strings(data->'skills') || private.talent_directory_strings(data->'physicalAiAreas')) c), private.talent_directory_normalize(coalesce(data->>'company', '')), identities, all_tokens, capability_tokens, weights, capability_weights)
 on conflict(id) do update set card=excluded.card, fields=excluded.fields, name=excluded.name, linkedin=excluded.linkedin, location=excluded.location, location_tokens=excluded.location_tokens, categories=excluded.categories, company=excluded.company, identity_names=excluded.identity_names, tokens=excluded.tokens, capability_tokens=excluded.capability_tokens, weights=excluded.weights, capability_weights=excluded.capability_weights;
end $$;

create function private.talent_directory_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.talent_directory_index_profile(new); return new; end $$;
create trigger talent_directory_changed after insert or update of data, revision, published on public.talent_profiles for each row execute function private.talent_directory_changed();
select private.talent_directory_index_profile(profile) from public.talent_profiles profile where profile.published;

create function public.search_talent_directory(p_query text default '', p_location text default '', p_categories text[] default '{}', p_company text default '', p_sort text default 'relevance', p_page integer default 1, p_ids text[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare terms text[]; technical text[] := string_to_array('embedded drone robot perception slam control controls mechanical electrical electronics hardware software ai ml learning vision lidar camera navigation autonomy autonomous simulation manipulation actuator pcb cad ros ros2 vla vlm tinyml edge', ' '); technical_query text[]; query_normalized text := trim(private.talent_directory_normalize(coalesce(p_query, ''))); identity text := private.talent_directory_linkedin(p_query); link_query boolean := trim(coalesce(p_query, '')) ~* '^(https?://|(?:www\.|[a-z]{2}\.)?linkedin\.com/)'; place text := private.talent_directory_normalize(coalesce(p_location, '')); query_categories text[]; query_company text := private.talent_directory_normalize(coalesce(p_company, '')); result jsonb;
begin
 if length(coalesce(p_query,'')) > 1000 or length(coalesce(p_location,'')) > 250 or length(coalesce(p_company,'')) > 250 or coalesce(cardinality(p_categories), 0) > 100 or coalesce(cardinality(p_ids),0) > 10000 or exists(select 1 from unnest(p_categories) value where length(value)>250) or exists(select 1 from unnest(p_ids) value where length(value)>120) or p_sort not in ('relevance','name') then raise exception 'Invalid directory query' using errcode='22023'; end if;
 select coalesce(array_agg(token order by ordinal), '{}') into terms from (select token, min(ordinal) ordinal from unnest(private.talent_directory_tokens(p_query)) with ordinality t(token, ordinal) where token <> all(string_to_array('i want to find looking for who have has worked working work with in on at and the a an people someone experience experienced', ' ')) group by token) tokens;
 if cardinality(terms) > 1 then terms := array_remove(terms, 'engineer'); end if;
 technical_query := array(select term from unnest(terms) term where term = any(technical));
 query_categories := array(select private.talent_directory_normalize(c) from unnest(coalesce(p_categories, '{}')) c where coalesce(c, '') <> '');
 with candidates as materialized (
  select d.*, (cardinality(technical_query) > 0 and not query_normalized = any(d.identity_names)) capability_query
  from private.talent_directory_index d join public.talent_profiles p on p.id = d.id and p.published
  where (p_ids is null or d.id = any(p_ids))
  and case when identity is not null or link_query then identity is not null and d.linkedin = identity else
   d.tokens @> terms
   and (cardinality(technical_query) = 0 or query_normalized = any(d.identity_names) or d.capability_tokens @> technical_query)
   and (place = '' or case when place in ('bengaluru','bangalore') then d.location_tokens @> array['bengaluru'] else d.location = place end)
   and (cardinality(query_categories) = 0 or d.categories && query_categories)
   and (query_company = '' or d.company = query_company)
  end
 ), totals as (select count(*) total from candidates), ranked as (
  select c.*, case when coalesce(p_sort,'relevance') = 'name' or identity is not null then 0 else coalesce((select sum((case when capability_query and term = any(technical) then capability_weights else weights end ->> term)::integer) from unnest(terms) term),0) end score from candidates c
 ), selected as (
  select * from ranked order by score desc, name collate private.talent_directory_order, id collate private.talent_directory_order
  limit 25 offset (select (least(greatest(coalesce(p_page,1)::bigint,1), greatest((total+24)/25,1))-1)*25 from totals)
 ), results as (
  select jsonb_build_object('person', s.card, 'matches', case when identity is not null then jsonb_build_array('LinkedIn profile: ' || (s.card->>'linkedinUrl')) else to_jsonb(
   coalesce((select array_agg(evidence order by first_term, first_field) from (
    select (f.field->>'label') || ': ' || (f.field->>'value') evidence, min(t.ordinal) first_term, min(f.ordinal) first_field
    from unnest(terms) with ordinality t(term, ordinal) cross join jsonb_array_elements(s.fields) with ordinality f(field, ordinal)
    where f.field->'tokens' ? t.term and not (s.capability_query and t.term = any(technical) and ((f.field->>'employer')::boolean or f.field->>'label' = 'Name'))
    group by (f.field->>'label') || ': ' || (f.field->>'value')
   ) evidence), '{}')
   || array(select (case when s.card->>'source' = 'member' then 'Member-provided' else 'Research-derived' end) || ' category: ' || category from unnest(coalesce(p_categories,'{}')) category where private.talent_directory_normalize(category) = any(s.categories))
   || case when place <> '' then array['Location: ' || coalesce(s.card->>'location','')] else '{}' end
   || case when query_company <> '' then array['Company: ' || coalesce(s.card->>'company','')] else '{}' end
  ) end) value, s.score, s.name, s.id from selected s
 )
 select jsonb_build_object('results',coalesce((select jsonb_agg(value order by score desc, name collate private.talent_directory_order, id collate private.talent_directory_order) from results),'[]'), 'total',total, 'page',least(greatest(coalesce(p_page,1)::bigint,1),greatest((total+24)/25,1)), 'pageSize',25) into result from totals;
 return result;
end $$;

create function public.talent_directory_facets() returns jsonb
language sql stable security definer set search_path = '' as $$
 with cards as materialized (select d.card from private.talent_directory_index d join public.talent_profiles p on p.id=d.id and p.published), categories as materialized (
  select distinct card->>'id' id, value from cards cross join lateral unnest(private.talent_directory_strings(card->'skills') || private.talent_directory_strings(card->'physicalAiAreas')) value
 )
 select jsonb_build_object('total',(select count(*) from cards),
  'locations',coalesce((select jsonb_agg(value order by value) from (select distinct coalesce(card->>'location','') value from cards) values),'[]'),
  'companies',coalesce((select jsonb_agg(value order by value) from (select distinct card->>'company' value from cards where coalesce(card->>'company','') <> '') values),'[]'),
  'categories',coalesce((select jsonb_agg(value order by value) from (select distinct value from categories) values),'[]'),
  'specialties',coalesce((select jsonb_object_agg(value, count) from (select value,count(*) count from categories group by value) counts),'{}'))
$$;

revoke all on function private.talent_directory_normalize(text), private.talent_directory_strings(jsonb), private.talent_directory_tokens(text), private.talent_directory_linkedin(text), private.talent_directory_field(text,text,integer,boolean), private.talent_directory_index_profile(public.talent_profiles), private.talent_directory_changed() from public, anon, authenticated;
revoke all on function public.search_talent_directory(text,text,text[],text,text,integer,text[]), public.talent_directory_facets() from public;
grant execute on function public.search_talent_directory(text,text,text[],text,text,integer,text[]), public.talent_directory_facets() to anon, authenticated, service_role;
analyze private.talent_directory_index;
notify pgrst, 'reload schema';
