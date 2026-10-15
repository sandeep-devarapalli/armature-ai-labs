alter function private.talent_validate_patch(jsonb) rename to talent_validate_pre_portfolio_patch;
create function private.talent_validate_patch(patch jsonb) returns void language plpgsql set search_path='' as $$
declare project jsonb; k text; item jsonb;
begin
 perform private.talent_validate_pre_portfolio_patch(patch-'portfolioProjects');
 if octet_length(patch::text)>20000 then raise exception 'Profile too large' using errcode='22023'; end if;
 if not patch ? 'portfolioProjects' then return; end if;
 if jsonb_typeof(patch->'portfolioProjects')<>'array' or jsonb_array_length(patch->'portfolioProjects')>10 then raise exception 'Provide at most 10 projects' using errcode='22023'; end if;
 for project in select * from jsonb_array_elements(patch->'portfolioProjects') loop
  if jsonb_typeof(project)<>'object' then raise exception 'Invalid project' using errcode='22023'; end if;
  for k in select jsonb_object_keys(project) loop
   if k not in ('title','summary','contribution','skills','evidenceUrl') then raise exception 'Invalid project field' using errcode='22023'; end if;
  end loop;
  foreach k in array array['title','summary','contribution'] loop
   if not project ? k or jsonb_typeof(project->k)<>'string' or length(trim(project->>k))=0 or length(project->>k)>(case when k='title' then 200 else 1200 end) then raise exception 'Project title, summary and personal contribution are required' using errcode='22023'; end if;
  end loop;
  if not project ? 'skills' or jsonb_typeof(project->'skills')<>'array' or jsonb_array_length(project->'skills')>20 then raise exception 'Invalid project skills' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(project->'skills') loop
   if jsonb_typeof(item)<>'string' or length(trim(item#>>'{}'))=0 or length(item#>>'{}')>100 then raise exception 'Invalid project skill' using errcode='22023'; end if;
  end loop;
  if not project ? 'evidenceUrl' or jsonb_typeof(project->'evidenceUrl')<>'string' or length(project->>'evidenceUrl')>1000 then raise exception 'Invalid evidence URL' using errcode='22023'; end if;
  if project->>'evidenceUrl'<>'' and (project->>'evidenceUrl' !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?([/?#][^[:space:][:cntrl:]]*)?$' or position(chr(92) in project->>'evidenceUrl')>0) then raise exception 'Use a public HTTPS evidence URL without credentials' using errcode='22023'; end if;
 end loop;
end $$;
revoke all on function private.talent_validate_patch(jsonb),private.talent_validate_pre_portfolio_patch(jsonb) from public,anon,authenticated;
