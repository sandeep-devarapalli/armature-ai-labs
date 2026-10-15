-- Public discovery remains anonymous; private account context requires a current account.
alter function public.market_list_projects() set schema private;
alter function public.market_project_detail(uuid) set schema private;
revoke all on function private.market_list_projects(),private.market_project_detail(uuid) from public,anon,authenticated,service_role;
create function public.market_list_projects() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is not null then perform private.talent_require_account(); end if;
 return private.market_list_projects();
end $$;
create function public.market_project_detail(project_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is not null then perform private.talent_require_account(); end if;
 return private.market_project_detail(project_id);
end $$;
revoke all on function public.market_list_projects(),public.market_project_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function public.market_list_projects(),public.market_project_detail(uuid) to anon,authenticated;

revoke all on public.market_inbox_events from public,anon,authenticated;
grant select on public.market_inbox_events to authenticated;
create function private.market_active_viewer() returns boolean language sql stable security definer set search_path='' as $$
 select private.has_basic_membership(auth.uid());
$$;
revoke all on function private.market_active_viewer() from public,anon,authenticated,service_role;
grant execute on function private.market_active_viewer() to authenticated;
drop policy market_inbox_self on public.market_inbox_events;
create policy market_inbox_self on public.market_inbox_events for select to authenticated using(user_id=(select auth.uid()) and (select private.market_active_viewer()));

create function private.market_validate_selected_provider() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.provider_id is not null and (not private.has_basic_membership(new.provider_id) or not exists(select 1 from private.talent_owners o join public.talent_profiles t on t.id=o.profile_id where o.user_id=new.provider_id and t.published)) then
  raise exception 'Selected provider must have an active account and an approved published profile' using errcode='42501';
 end if;
 return new;
end $$;
create trigger market_selected_provider_current before update of provider_id on private.market_projects for each row when(new.provider_id is distinct from old.provider_id) execute function private.market_validate_selected_provider();
revoke all on function private.market_validate_selected_provider() from public,anon,authenticated,service_role;
