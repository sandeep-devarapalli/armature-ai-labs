create table private.guest_passes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 reference text generated always as ('GP-' || upper(replace(id::text,'-',''))) stored unique,
 visit_date date not null,
 purpose text not null check (purpose in ('event','meeting')),
 details text not null check (length(details) between 3 and 400),
 status text not null default 'pending' check (status in ('pending','approved','declined','alternate','checked_in')),
 offered_date date,
 staff_note text,
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 checked_in_at timestamptz,
 checked_in_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create unique index guest_pass_one_per_day on private.guest_passes(user_id,visit_date) where status<>'declined';
create index guest_pass_approved_day on private.guest_passes(visit_date) where status in ('approved','checked_in');

create table private.golden_pass_applications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 details text not null check (length(details) between 3 and 400),
 created_at timestamptz not null default now()
);

alter table private.guest_passes enable row level security;
alter table private.golden_pass_applications enable row level security;
revoke all on private.guest_passes,private.golden_pass_applications from public,anon,authenticated,service_role;

create function private.visit_pass_today() returns date
language sql stable set search_path='' as $$
 select (now() at time zone 'Asia/Kolkata')::date;
$$;

create function private.visit_pass_user() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare member uuid:=auth.uid();
begin
 if not private.onboarding_update_account_active(member) or not exists (
  select 1 from auth.users where id=member and nullif(trim(email),'') is not null
 ) then
  raise exception 'Sign in with a confirmed email to continue' using errcode='42501';
 end if;
 return member;
end; $$;

create function private.visit_pass_staff() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare reviewer uuid:=private.visit_pass_user();
begin
 if not private.is_staff(array['membership_reviewer','admin','super_admin']::public.staff_role[]) then
  raise exception 'Authorised staff required' using errcode='42501';
 end if;
 return reviewer;
end; $$;

create function private.guest_pass_payload(p private.guest_passes) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'reference',p.reference,'visit_date',p.visit_date,'purpose',p.purpose,
  'details',p.details,'status',case when p.status in ('pending','approved','alternate') and
   coalesce(p.offered_date,p.visit_date)<private.visit_pass_today() then 'expired' else p.status end,
  'offered_date',p.offered_date,'staff_note',p.staff_note,'created_at',p.created_at,'checked_in_at',p.checked_in_at);
$$;

create function public.get_my_guest_passes() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare requester uuid:=private.visit_pass_user();
begin
 return coalesce((select jsonb_agg(private.guest_pass_payload(p) order by p.created_at desc,p.id)
  from private.guest_passes p where p.user_id=requester),'[]'::jsonb);
end; $$;

create function public.request_guest_pass(p_visit_date date,p_purpose text,p_details text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare requester uuid:=private.visit_pass_user(); result private.guest_passes;
begin
 if p_visit_date is null or not isfinite(p_visit_date) or p_visit_date<private.visit_pass_today()
  or p_purpose is null or p_purpose not in ('event','meeting')
  or length(coalesce(trim(p_details),'')) not between 3 and 400 then
  raise exception 'Choose a current or future visit date and enter the event or meeting details' using errcode='22023';
 end if;
 insert into private.guest_passes(user_id,visit_date,purpose,details)
 values(requester,p_visit_date,p_purpose,trim(p_details)) returning * into result;
 return private.guest_pass_payload(result);
exception when unique_violation then
 raise exception 'You already have a request for this date' using errcode='23505';
end; $$;

create function public.accept_guest_pass_date(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare requester uuid:=private.visit_pass_user(); result private.guest_passes;
begin
 update private.guest_passes set visit_date=offered_date,offered_date=null,status='pending',staff_note=null
 where id=p_id and user_id=requester and status='alternate' and offered_date>=private.visit_pass_today()
 returning * into result;
 if not found then raise exception 'No current date offer found' using errcode='P0002'; end if;
 return private.guest_pass_payload(result);
exception when unique_violation then
 raise exception 'You already have a request for this date' using errcode='23505';
end; $$;

create function public.staff_list_guest_passes() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.visit_pass_staff();
 return coalesce((select jsonb_agg(private.guest_pass_payload(p)||jsonb_build_object('guest_email',u.email)
  order by p.created_at desc,p.id) from private.guest_passes p join auth.users u on u.id=p.user_id
  where private.onboarding_update_account_active(u.id)),'[]'::jsonb);
end; $$;

create function public.staff_update_guest_pass(
 p_id uuid,p_action text,p_offered_date date default null,p_note text default null,p_reference text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare reviewer uuid:=private.visit_pass_staff(); result private.guest_passes;
 today date:=private.visit_pass_today();
begin
 select * into result from private.guest_passes where id=p_id for update;
 if not found or not private.onboarding_update_account_active(result.user_id) then
  raise exception 'Guest request not found' using errcode='P0002';
 end if;
 if result.user_id=reviewer then raise exception 'A different staff member must review your request' using errcode='42501'; end if;

 if p_action='check_in' then
  if result.status<>'approved' or result.visit_date<>today or result.reference is distinct from upper(trim(p_reference)) then
   raise exception 'An unused approved reference for today is required' using errcode='22023';
  end if;
  update private.guest_passes set status='checked_in',checked_in_at=now(),checked_in_by=reviewer
  where id=p_id returning * into result;
  return private.guest_pass_payload(result);
 end if;

 if result.status<>'pending' or result.visit_date<today or p_action is null or
  p_action not in ('approve','decline','offer') or length(coalesce(trim(p_note),''))>250 then
  raise exception 'A current pending request and a valid decision are required' using errcode='22023';
 end if;
 if p_action='offer' and (p_offered_date is null or not isfinite(p_offered_date) or p_offered_date<today or p_offered_date=result.visit_date) then
  raise exception 'Choose a different visit date' using errcode='22023';
 end if;
 if p_action='approve' then
  -- Serialize approvals for a date so concurrent reviewers cannot exceed capacity.
  perform pg_advisory_xact_lock(20261120,result.visit_date-date '2000-01-01');
  if (select count(*) from private.guest_passes where visit_date=result.visit_date and status in ('approved','checked_in'))>=4 then
   raise exception 'This date is full. Offer another date.' using errcode='22023';
  end if;
 end if;
 update private.guest_passes set status=case p_action when 'approve' then 'approved' when 'decline' then 'declined' else 'alternate' end,
  offered_date=case when p_action='offer' then p_offered_date end,staff_note=nullif(trim(p_note),''),
  reviewed_by=reviewer,reviewed_at=now() where id=p_id returning * into result;
 return private.guest_pass_payload(result);
end; $$;

create function private.golden_pass_payload(p private.golden_pass_applications) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'details',p.details,'created_at',p.created_at);
$$;

create function public.get_my_golden_pass_application() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare requester uuid:=private.visit_pass_user();
begin
 return coalesce((select jsonb_agg(private.golden_pass_payload(p))
  from private.golden_pass_applications p where p.user_id=requester),'[]'::jsonb);
end; $$;

create function public.submit_golden_pass_application(p_details text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare requester uuid:=private.visit_pass_user(); result private.golden_pass_applications;
begin
 if length(coalesce(trim(p_details),'')) not between 3 and 400 then
  raise exception 'Enter 3 to 400 characters about your project' using errcode='22023';
 end if;
 insert into private.golden_pass_applications(user_id,details) values(requester,trim(p_details))
 on conflict (user_id) do nothing returning * into result;
 if not found then select * into result from private.golden_pass_applications where user_id=requester; end if;
 return private.golden_pass_payload(result);
end; $$;

create function public.staff_list_golden_pass_applications() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.visit_pass_staff();
 return coalesce((select jsonb_agg(private.golden_pass_payload(p)||jsonb_build_object('applicant_email',u.email)
  order by p.created_at desc,p.id) from private.golden_pass_applications p join auth.users u on u.id=p.user_id
  where private.onboarding_update_account_active(u.id)),'[]'::jsonb);
end; $$;

revoke all on function private.visit_pass_today(),private.visit_pass_user(),private.visit_pass_staff(),
 private.guest_pass_payload(private.guest_passes),private.golden_pass_payload(private.golden_pass_applications)
 from public,anon,authenticated,service_role;
revoke all on function public.get_my_guest_passes(),public.request_guest_pass(date,text,text),
 public.accept_guest_pass_date(uuid),public.staff_list_guest_passes(),public.staff_update_guest_pass(uuid,text,date,text,text),
 public.get_my_golden_pass_application(),public.submit_golden_pass_application(text),public.staff_list_golden_pass_applications()
 from public,anon,authenticated,service_role;
grant execute on function public.get_my_guest_passes(),public.request_guest_pass(date,text,text),
 public.accept_guest_pass_date(uuid),public.staff_list_guest_passes(),public.staff_update_guest_pass(uuid,text,date,text,text),
 public.get_my_golden_pass_application(),public.submit_golden_pass_application(text),public.staff_list_golden_pass_applications()
 to authenticated;
