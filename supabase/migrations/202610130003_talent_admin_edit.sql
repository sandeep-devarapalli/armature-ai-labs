create table private.talent_profile_edits (
 id uuid primary key default gen_random_uuid(),
 profile_id text not null references public.talent_profiles(id),
 editor_id uuid not null references auth.users(id),
 edited_at timestamptz not null default now(),
 note text not null,
 before_revision integer not null,
 after_revision integer not null,
 before_data jsonb not null,
 after_data jsonb not null
);
create index talent_profile_edits_history on private.talent_profile_edits(profile_id,edited_at);
alter table private.talent_profile_edits enable row level security;
revoke all on private.talent_profile_edits from public,anon,authenticated;

create function public.talent_admin_update_profile(profile_id text,expected_revision integer,patch jsonb,note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account(); p public.talent_profiles; updated public.talent_profiles;
begin
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Administrator required' using errcode='42501'; end if;
 if note is null or length(trim(note))<10 or length(note)>4000 then raise exception 'Supply a 10–4000 character reason for this edit' using errcode='22023'; end if;
 perform private.talent_validate_patch(patch);
 if patch='{}'::jsonb then raise exception 'Supply profile changes' using errcode='22023'; end if;
 select * into p from public.talent_profiles t where t.id=profile_id for update;
 if not found or not p.published or p.revision is distinct from expected_revision then raise exception 'Profile changed or removed; reload' using errcode='P0409'; end if;
 update public.talent_profiles set data=data||patch,revision=revision+1 where id=p.id returning * into updated;
 insert into private.talent_profile_edits(profile_id,editor_id,note,before_revision,after_revision,before_data,after_data)
 values(p.id,u,trim(note),p.revision,updated.revision,p.data,updated.data);
 return to_jsonb(updated);
end $$;
revoke all on function public.talent_admin_update_profile(text,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.talent_admin_update_profile(text,integer,jsonb,text) to authenticated;
