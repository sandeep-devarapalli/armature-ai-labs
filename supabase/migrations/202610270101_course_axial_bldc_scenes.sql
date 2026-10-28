-- Robot Actuators v9 (October 2026): register two interactive scenes with the server-side block validator:
-- axial-exploded (Lesson 3.8, rotors pulled 0 to 40 mm) and bldc-rotating-field (Lesson 3.3, rotor angle 0 to 360 degrees).
-- Built from the live definition of private.course_validate_blocks fetched on 27 October 2026; only the two "when" lines are new.
CREATE OR REPLACE FUNCTION private.course_validate_blocks(p_blocks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare b jsonb; c jsonb; q jsonb; o jsonb; t text; k text; allowed text[]; low numeric; high numeric; increment numeric; v numeric;
begin
 if p_blocks is null or jsonb_typeof(p_blocks)<>'array' or octet_length(p_blocks::text)>1048576 then raise exception 'Lesson blocks must be an array under 1 MiB' using errcode='22023'; end if;
 if jsonb_array_length(p_blocks) not between 1 and 500 then raise exception 'A lesson requires 1 to 500 blocks' using errcode='22023'; end if;
 if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_blocks)x) then raise exception 'Block identifiers must be unique' using errcode='22023'; end if;
 for b in select value from jsonb_array_elements(p_blocks) loop
  c:=b->'content'; t:=b->>'type';
  if jsonb_typeof(b)<>'object' or jsonb_typeof(b->'id') is distinct from 'string' or length(b->>'id') not between 1 and 200 or jsonb_typeof(c) is distinct from 'object'
   then raise exception 'Each block needs an id and content object' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(b)x where x not in ('id','type','content')) then raise exception 'Unsupported block field' using errcode='22023'; end if;
  allowed:=case t
   when 'heading' then array['text','html','level'] when 'text' then array['html']
   when 'module_intro' then array['courseTitle','moduleObjective'] when 'definition' then array['term','definitionHtml']
   when 'callout' then array['title','bodyHtml','variant'] when 'list' then array['items','style']
   when 'table' then array['headers','rows'] when 'code' then array['code','filename','language','isConceptual']
   when 'math' then array['latex','caption'] when 'blockquote' then array['html','text']
   when 'illustration' then array['name','svgCode','caption'] when 'micro_exercise' then array['title','promptHtml','placeholder']
   when 'interactive_diagram' then array['sceneId','parameters','caption','svgCode','description']
   when 'quiz' then array['questions'] else null end;
  if allowed is null then raise exception 'Unsupported lesson block type' using errcode='22023'; end if;
  for k in select jsonb_object_keys(c) loop
   if not k=any(allowed) then raise exception 'Unsupported content field: %',k using errcode='22023'; end if;
   if k not in ('level','items','headers','rows','questions','isConceptual','parameters') and jsonb_typeof(c->k)<>'string' then raise exception 'Content % must be a string',k using errcode='22023'; end if;
  end loop;
  if (t='heading' and not (c ? 'text' or c ? 'html')) or (t='heading' and c ? 'level' and (jsonb_typeof(c->'level')<>'number' or c->>'level' !~ '^[1-6]$'))
   or (t='text' and not c ? 'html') or (t='module_intro' and not c ? 'moduleObjective')
   or (t='definition' and not c ?& array['term','definitionHtml']) or (t='callout' and not c ?& array['title','bodyHtml'])
   or (t='code' and not c ? 'code') or (t='math' and not c ? 'latex') or (t='blockquote' and not (c ? 'html' or c ? 'text'))
   or (t='illustration' and (not c ? 'svgCode' or length(btrim(c->>'svgCode'))=0))
   or (t='micro_exercise' and not c ? 'promptHtml') or (c ? 'isConceptual' and jsonb_typeof(c->'isConceptual')<>'boolean')
   then raise exception 'Missing or invalid lesson content for %',t using errcode='22023'; end if;
  if t='interactive_diagram' then
   if not c ?& array['sceneId','parameters','caption','svgCode','description']
    or jsonb_typeof(c->'parameters') is distinct from 'object'
    or length(btrim(c->>'caption'))=0 or length(btrim(c->>'svgCode'))=0 or length(btrim(c->>'description'))=0
    then raise exception 'Interactive diagram requires parameters and accessible fallback' using errcode='22023'; end if;
   if exists(select 1 from jsonb_object_keys(c->'parameters') x where x<>'value')
    or jsonb_typeof(c->'parameters'->'value') is distinct from 'number'
    then raise exception 'Invalid interactive parameters' using errcode='22023'; end if;
   case c->>'sceneId'
    when 'lathe-motion' then low:=0; high:=10; increment:=0.25;
    when 'tool-geometry' then low:=0; high:=25; increment:=1;
    when 'lathe-taper' then low:=0; high:=10; increment:=0.5;
    when 'lathe-thread' then low:=1; high:=5; increment:=0.25;
    when 'milling-motion' then low:=0; high:=360; increment:=15;
    when 'milling-index' then low:=3; high:=24; increment:=1;
    when 'milling-workholding' then low:=0.2; high:=0.8; increment:=0.1;
    when 'pic-timing' then low:=1; high:=32; increment:=1;
    when 'pic-register' then low:=0; high:=255; increment:=1;
    when 'srm-exploded' then low:=0; high:=40; increment:=5;
    when 'srm-rotation' then low:=0; high:=60; increment:=1;
    when 'srm-gap' then low:=0.1; high:=0.3; increment:=0.01;
    when 'axial-exploded' then low:=0; high:=40; increment:=5;
    when 'bldc-rotating-field' then low:=0; high:=360; increment:=5;
    else raise exception 'Unregistered interactive scene' using errcode='22023';
   end case;
   v:=(c->'parameters'->>'value')::numeric;
   if v<low or v>high or abs((v-low)/increment-round((v-low)/increment))>=0.00000001 then raise exception 'Interactive value outside scene range' using errcode='22023'; end if;
  end if;
  if t in ('list','table') then
   k:=case t when 'list' then 'items' else 'headers' end;
   if jsonb_typeof(c->k) is distinct from 'array' then raise exception 'Lesson list/header must be an array' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(c->k)x where jsonb_typeof(x)<>'string') then raise exception 'List/header values must be strings' using errcode='22023'; end if;
   if t='table' then
    if jsonb_typeof(c->'rows') is distinct from 'array' then raise exception 'Table rows must be an array' using errcode='22023'; end if;
    for q in select value from jsonb_array_elements(c->'rows') loop
     if jsonb_typeof(q)<>'array' then raise exception 'Each table row must be an array' using errcode='22023'; end if;
     if exists(select 1 from jsonb_array_elements(q)x where jsonb_typeof(x)<>'string') then raise exception 'Table cells must be strings' using errcode='22023'; end if;
    end loop;
   end if;
  end if;
  if t='quiz' then
   if jsonb_typeof(c->'questions') is distinct from 'array' then raise exception 'Practice questions must be an array' using errcode='22023'; end if;
   for q in select value from jsonb_array_elements(c->'questions') loop
    if jsonb_typeof(q)<>'object' or not q ?& array['id','question','options','explanation'] then raise exception 'Invalid practice question' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(q)x where x not in ('id','question','options','explanation','points')) or jsonb_typeof(q->'id')<>'string' or jsonb_typeof(q->'question')<>'string' or jsonb_typeof(q->'explanation')<>'string' or jsonb_typeof(q->'options')<>'array' or (q ? 'points' and jsonb_typeof(q->'points')<>'number') then raise exception 'Invalid practice question fields' using errcode='22023'; end if;
    for o in select value from jsonb_array_elements(q->'options') loop
     if jsonb_typeof(o)<>'object' or not o ?& array['id','text','isCorrect'] then raise exception 'Invalid practice answer' using errcode='22023'; end if;
     if exists(select 1 from jsonb_object_keys(o)x where x not in ('id','text','isCorrect')) or jsonb_typeof(o->'id')<>'string' or jsonb_typeof(o->'text')<>'string' or jsonb_typeof(o->'isCorrect')<>'boolean' then raise exception 'Invalid practice answer fields' using errcode='22023'; end if;
    end loop;
   end loop;
  end if;
 end loop;
end;
$function$;
