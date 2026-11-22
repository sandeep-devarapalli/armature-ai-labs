alter table private.golden_pass_applications add column profile_url text;

create or replace function private.golden_pass_payload(p private.golden_pass_applications) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'details',p.details,'profile_url',p.profile_url,'created_at',p.created_at);
$$;

drop function public.submit_golden_pass_application(text);

create function public.submit_golden_pass_application(p_details text,p_profile_url text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare requester uuid:=private.visit_pass_user(); result private.golden_pass_applications;
 profile text:=trim(coalesce(p_profile_url,''));
begin
 if not private.has_basic_membership(requester) then
  raise exception 'An active Basic membership is required' using errcode='42501';
 end if;
 if length(coalesce(trim(p_details),'')) not between 3 and 400 then
  raise exception 'Enter 3 to 400 characters about your project' using errcode='22023';
 end if;
 if length(profile)>500 or position(chr(92) in profile)>0 or
  profile !~* '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+([a-z]{2,63}|xn--[a-z0-9-]{2,59})([/?#][^[:space:][:cntrl:]]*)?$' then
  raise exception 'Enter a valid HTTPS link to your LinkedIn, portfolio, or professional profile' using errcode='22023';
 end if;
 insert into private.golden_pass_applications(user_id,details,profile_url)
 values(requester,trim(p_details),profile)
 on conflict (user_id) do nothing returning * into result;
 if not found then select * into result from private.golden_pass_applications where user_id=requester; end if;
 return private.golden_pass_payload(result);
end; $$;

revoke all on function public.submit_golden_pass_application(text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_golden_pass_application(text,text) to authenticated;

create function private.queue_golden_pass_application_alert()
returns trigger language plpgsql security definer set search_path='' as $$
declare inbox uuid;
begin
 select u.id into inbox from auth.users u where lower(u.email)='hello@armatureailabs.com'
  and u.email_confirmed_at is not null and u.deleted_at is null
 order by u.id limit 1;
 if inbox is not null then
  perform private.queue_booking_notice(inbox,new.id,'golden_application','received','staff','{}'::jsonb);
 end if;
 return new;
end;
$$;
revoke all on function private.queue_golden_pass_application_alert() from public,anon,authenticated,service_role;

create trigger golden_pass_application_alert after insert on private.golden_pass_applications
for each row execute function private.queue_golden_pass_application_alert();
