create table public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status public.membership_status not null default 'pending',
  seat_allowance integer not null default 1 check (seat_allowance between 1 and 10000),
  starts_at timestamptz,
  ends_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  seat_enabled boolean not null default true,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (organization_id, user_id)
);

create unique index organization_members_one_active_admin
  on public.organization_members (organization_id)
  where role = 'admin' and removed_at is null;
create unique index organization_members_one_active_affiliation
  on public.organization_members (user_id)
  where removed_at is null;

create table public.organization_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  token_hash bytea not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(btrim(email)) and email ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create unique index organization_invitations_one_open_email
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create table public.team_membership_applications (
  id uuid primary key default extensions.gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete cascade,
  organization_name text not null check (char_length(btrim(organization_name)) between 2 and 160),
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 120),
  summary text not null default '' check (char_length(summary) <= 2000),
  requested_seats integer not null check (requested_seats between 1 and 10000),
  status public.membership_application_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_notes text,
  check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or status = 'withdrawn'
    or (status in ('approved', 'rejected') and decided_at is not null and decided_by is not null)
  )
);
create unique index team_membership_applications_one_pending
  on public.team_membership_applications (applicant_id)
  where status = 'pending';

alter table public.bookings
  add column access_source text not null default 'personal'
    check (access_source in ('personal', 'team')),
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add constraint bookings_access_source_pair check (
    (access_source = 'personal' and organization_id is null)
    or (access_source = 'team' and organization_id is not null)
  );
create index bookings_team_usage_idx
  on public.bookings (organization_id, starts_at desc)
  where access_source = 'team';

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.team_membership_applications enable row level security;

create or replace function private.is_team_admin(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members member
    left join public.memberships personal on personal.user_id = member.user_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.role = 'admin' and member.removed_at is null
      and coalesce(personal.status <> 'suspended', true)
  );
$$;

create policy organizations_read on public.organizations for select to authenticated
using (
  (select private.is_staff(null)) or exists (
    select 1 from public.organization_members member
    where member.organization_id = id
      and member.user_id = (select auth.uid()) and member.removed_at is null
  )
);
create policy organization_memberships_read on public.organization_memberships for select to authenticated
using (
  (select private.is_staff(null)) or exists (
    select 1 from public.organization_members member
    where member.organization_id = organization_memberships.organization_id
      and member.user_id = (select auth.uid()) and member.removed_at is null
  )
);
create policy organization_members_read on public.organization_members for select to authenticated
using (
  (select private.is_staff(null)) or user_id = (select auth.uid())
  or (select private.is_team_admin(organization_id))
);
create policy organization_invitations_read on public.organization_invitations for select to authenticated
using ((select private.is_staff(null)) or (select private.is_team_admin(organization_id)));
create policy team_membership_applications_read on public.team_membership_applications for select to authenticated
using (applicant_id = (select auth.uid()) or (select private.is_staff(null)));

grant select on public.organizations, public.organization_memberships,
  public.organization_members, public.team_membership_applications to authenticated;

revoke all on function private.is_team_admin(uuid) from public;
grant execute on function private.is_team_admin(uuid) to authenticated;

create or replace function private.has_active_team_membership(
  p_user_id uuid, p_organization_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organization_memberships membership
      on membership.organization_id = member.organization_id
    left join public.memberships personal on personal.user_id = member.user_id
    where member.user_id = p_user_id
      and member.organization_id = p_organization_id
      and member.removed_at is null and member.seat_enabled
      and membership.status = 'active'
      and (membership.starts_at is null or membership.starts_at <= p_starts_at)
      and (membership.ends_at is null or membership.ends_at >= p_ends_at)
      and coalesce(personal.status <> 'suspended', true)
  );
$$;

create or replace function private.has_booking_access(
  p_user_id uuid, p_access_source text, p_organization_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_access_source = 'personal' and p_organization_id is null then exists (
      select 1 from public.memberships personal
      where personal.user_id = p_user_id and personal.status = 'active'
        and (personal.starts_at is null or personal.starts_at <= p_starts_at)
        and (personal.ends_at is null or personal.ends_at >= p_ends_at)
    )
    when p_access_source = 'team' and p_organization_id is not null then
      private.has_active_team_membership(p_user_id, p_organization_id, p_starts_at, p_ends_at)
    else false
  end;
$$;

revoke all on function private.has_active_team_membership(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function private.has_booking_access(uuid, text, uuid, timestamptz, timestamptz) from public;

create or replace function public.submit_team_application(
  p_organization_name text, p_contact_name text, p_summary text, p_requested_seats integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if exists (
    select 1 from public.organization_members member
    where member.user_id=auth.uid() and member.removed_at is null
  ) then
    raise exception using errcode='23505',message='person already has a team affiliation';
  end if;
  insert into public.team_membership_applications
    (applicant_id, organization_name, contact_name, summary, requested_seats)
  values (auth.uid(), btrim(p_organization_name), btrim(p_contact_name),
    btrim(coalesce(p_summary, '')), p_requested_seats)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_my_team_access()
returns table (
  organization_id uuid, organization_name text, role text, seat_enabled boolean,
  membership_active boolean, starts_at timestamptz, ends_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select org.id, org.name, member.role, member.seat_enabled,
    membership.status = 'active'
      and (membership.starts_at is null or membership.starts_at <= now())
      and (membership.ends_at is null or membership.ends_at > now())
      and coalesce(personal.status <> 'suspended', true),
    membership.starts_at, membership.ends_at
  from public.organization_members member
  join public.organizations org on org.id = member.organization_id
  join public.organization_memberships membership on membership.organization_id = org.id
  left join public.memberships personal on personal.user_id = member.user_id
  where member.user_id = auth.uid() and member.removed_at is null;
$$;

revoke all on function public.submit_team_application(text, text, text, integer) from public;
revoke all on function public.list_my_team_access() from public;
grant execute on function public.submit_team_application(text, text, text, integer) to authenticated;
grant execute on function public.list_my_team_access() to authenticated;

create or replace function private.has_active_membership(
  p_user_id uuid default auth.uid(), p_at timestamptz default now()
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships personal
    where personal.user_id = p_user_id and personal.status = 'active'
      and (personal.starts_at is null or personal.starts_at <= p_at)
      and (personal.ends_at is null or personal.ends_at > p_at)
  ) or exists (
    select 1 from public.organization_members member
    where member.user_id = p_user_id
      and private.has_active_team_membership(
        p_user_id, member.organization_id, p_at, p_at + interval '1 microsecond'
      )
  );
$$;

create or replace function private.team_seats_used(p_organization_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select (
    select count(*)::integer from public.organization_members member
    where member.organization_id = p_organization_id
      and member.removed_at is null and member.seat_enabled
  ) + (
    select count(*)::integer from public.organization_invitations invite
    where invite.organization_id = p_organization_id
      and invite.revoked_at is null and invite.accepted_at is null
      and invite.expires_at > now()
  );
$$;
revoke all on function private.team_seats_used(uuid) from public;

create or replace function public.staff_create_team(
  p_organization_name text, p_admin_user_id uuid, p_seat_allowance integer,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_staff(array['operations','admin','super_admin']::public.staff_role[]) then
    raise exception using errcode = '42501', message = 'staff role required';
  end if;
  if p_admin_user_id is null or not exists (
    select 1 from auth.users where id = p_admin_user_id and email_confirmed_at is not null
  ) then
    raise exception using errcode = '22023', message = 'verified admin account required';
  end if;
  insert into public.organizations(name) values (btrim(p_organization_name)) returning id into v_id;
  insert into public.organization_memberships
    (organization_id,status,seat_allowance,starts_at,ends_at,approved_by)
  values (v_id,'active',p_seat_allowance,p_starts_at,p_ends_at,auth.uid());
  insert into public.organization_members
    (organization_id,user_id,role,seat_enabled)
  values (v_id,p_admin_user_id,'admin',false);
  perform private.record_audit(auth.uid(),'staff','team.created','organization',v_id,
    null,jsonb_build_object('seat_allowance',p_seat_allowance));
  return v_id;
end;
$$;

create or replace function public.staff_set_team_membership(
  p_organization_id uuid, p_status public.membership_status,
  p_seat_allowance integer, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.organization_memberships%rowtype;
begin
  if not private.is_staff(array['operations','admin','super_admin']::public.staff_role[]) then
    raise exception using errcode = '42501', message = 'staff role required';
  end if;
  select * into v_old from public.organization_memberships
  where organization_id = p_organization_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team membership not found';
  end if;
  if p_seat_allowance < private.team_seats_used(p_organization_id) then
    raise exception using errcode = '22023', message = 'seat allowance below occupied seats';
  end if;
  update public.organization_memberships
  set status=p_status,seat_allowance=p_seat_allowance,starts_at=p_starts_at,
    ends_at=p_ends_at,approved_by=auth.uid(),updated_at=now()
  where organization_id=p_organization_id;
  if p_status <> 'active' or p_starts_at is not null or p_ends_at is not null then
    update public.bookings booking
    set status='cancelled',cancellation_reason='Team membership changed',
      cancelled_at=now(),cancelled_by=auth.uid()
    where booking.organization_id=p_organization_id and booking.access_source='team'
      and booking.status in ('tentative','confirmed') and booking.starts_at > now()
      and (p_status <> 'active'
        or (p_starts_at is not null and booking.starts_at < p_starts_at)
        or (p_ends_at is not null and booking.ends_at > p_ends_at));
    update public.resource_reservations reservation set released_at=now()
    from public.bookings booking where booking.id=reservation.booking_id
      and booking.organization_id=p_organization_id and booking.access_source='team'
      and booking.status='cancelled' and reservation.released_at is null;
    update public.reminder_deliveries reminder set status='skipped'
    from public.bookings booking where booking.id=reminder.booking_id
      and booking.organization_id=p_organization_id and booking.access_source='team'
      and booking.status='cancelled' and reminder.status in ('pending','failed');
  end if;
  perform private.record_audit(auth.uid(),'staff','team.membership_updated','organization',
    p_organization_id,to_jsonb(v_old),jsonb_build_object(
      'status',p_status,'seat_allowance',p_seat_allowance,
      'starts_at',p_starts_at,'ends_at',p_ends_at));
end;
$$;

create or replace function public.staff_transfer_team_admin(
  p_organization_id uuid, p_new_admin_user_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_staff(array['operations','admin','super_admin']::public.staff_role[]) then
    raise exception using errcode = '42501', message = 'staff role required';
  end if;
  perform 1 from public.organization_memberships
  where organization_id=p_organization_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team membership not found';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id=p_organization_id and user_id=p_new_admin_user_id
      and removed_at is null
  ) then
    raise exception using errcode = '22023', message = 'new admin must be an active team member';
  end if;
  update public.organization_members set role='member'
  where organization_id=p_organization_id and role='admin' and removed_at is null;
  update public.organization_members set role='admin'
  where organization_id=p_organization_id and user_id=p_new_admin_user_id;
  perform private.record_audit(auth.uid(),'staff','team.admin_transferred','organization',
    p_organization_id,null,jsonb_build_object('admin_user_id',p_new_admin_user_id));
end;
$$;

create or replace function public.team_create_invitation(
  p_organization_id uuid, p_email text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_membership public.organization_memberships%rowtype;
  v_email text := lower(btrim(p_email));
  v_token text;
  v_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode = '42501', message = 'team admin required';
  end if;
  select * into v_membership from public.organization_memberships
  where organization_id=p_organization_id for update;
  if v_membership.status <> 'active'
    or (v_membership.starts_at is not null and v_membership.starts_at > now())
    or (v_membership.ends_at is not null and v_membership.ends_at <= now()) then
    raise exception using errcode = '42501', message = 'active team membership required';
  end if;
  update public.organization_invitations set revoked_at=now()
  where organization_id=p_organization_id and email=v_email
    and accepted_at is null and revoked_at is null and expires_at <= now();
  if private.team_seats_used(p_organization_id) >= v_membership.seat_allowance then
    raise exception using errcode = '22023', message = 'no team seats available';
  end if;
  if exists (select 1 from auth.users user_account
    join public.organization_members member on member.user_id=user_account.id
    where lower(user_account.email)=v_email and member.organization_id=p_organization_id
      and member.removed_at is null) then
    raise exception using errcode = '23505', message = 'person is already on the team';
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.organization_invitations
    (organization_id,email,token_hash,invited_by,expires_at)
  values (p_organization_id,v_email,extensions.digest(v_token,'sha256'),
    auth.uid(),v_expires_at)
  returning id into v_id;
  perform private.record_audit(auth.uid(),'member','team.invitation_created','organization',
    p_organization_id,null,jsonb_build_object('invitation_id',v_id));
  return jsonb_build_object('invitation_id',v_id,'token',v_token,'expires_at',v_expires_at);
end;
$$;

create or replace function public.team_accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.organization_invitations%rowtype;
  v_membership public.organization_memberships%rowtype;
  v_email text;
  v_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  select lower(email) into v_email from auth.users
  where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    raise exception using errcode = '42501', message = 'verified email required';
  end if;
  select organization_id into v_organization_id from public.organization_invitations
  where token_hash=extensions.digest(p_token,'sha256');
  if not found then
    raise exception using errcode = '42501', message = 'invitation is unavailable';
  end if;
  select * into v_membership from public.organization_memberships
  where organization_id=v_organization_id for update;
  select * into v_invitation from public.organization_invitations
  where token_hash=extensions.digest(p_token,'sha256') for update;
  if not found or v_invitation.email <> v_email
    or v_invitation.accepted_at is not null or v_invitation.revoked_at is not null
    or v_invitation.expires_at <= now() then
    raise exception using errcode = '42501', message = 'invitation is unavailable';
  end if;
  if v_membership.status <> 'active'
    or (v_membership.starts_at is not null and v_membership.starts_at > now())
    or (v_membership.ends_at is not null and v_membership.ends_at <= now()) then
    raise exception using errcode = '42501', message = 'active team membership required';
  end if;
  if private.team_seats_used(v_invitation.organization_id) > v_membership.seat_allowance then
    raise exception using errcode = '22023', message = 'no team seats available';
  end if;
  if exists(select 1 from public.organization_members
    where user_id=auth.uid() and removed_at is null) then
    raise exception using errcode = '23505', message = 'person already has a team affiliation';
  end if;
  insert into public.organization_members(organization_id,user_id,role,seat_enabled)
  values(v_invitation.organization_id,auth.uid(),'member',true)
  on conflict (organization_id,user_id) do update
    set role='member',seat_enabled=true,joined_at=now(),removed_at=null;
  update public.organization_invitations set accepted_at=now() where id=v_invitation.id;
  perform private.record_audit(auth.uid(),'member','team.invitation_accepted','organization',
    v_invitation.organization_id,null,jsonb_build_object('invitation_id',v_invitation.id));
  return v_invitation.organization_id;
end;
$$;

create or replace function public.team_revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_invitation public.organization_invitations%rowtype;
begin
  select * into v_invitation from public.organization_invitations
  where id=p_invitation_id for update;
  if not found then
    raise exception using errcode='P0002',message='invitation not found';
  end if;
  if not private.is_team_admin(v_invitation.organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception using errcode='22023',message='accepted invitation cannot be revoked';
  end if;
  update public.organization_invitations set revoked_at=now()
  where id=p_invitation_id and revoked_at is null;
end;
$$;

create or replace function public.team_set_admin_seat(
  p_organization_id uuid, p_seat_enabled boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_membership public.organization_memberships%rowtype;
begin
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  select * into v_membership from public.organization_memberships
  where organization_id=p_organization_id for update;
  if p_seat_enabled and private.team_seats_used(p_organization_id) >= v_membership.seat_allowance
    and not exists(select 1 from public.organization_members
      where organization_id=p_organization_id and user_id=auth.uid() and seat_enabled) then
    raise exception using errcode='22023',message='no team seats available';
  end if;
  if not p_seat_enabled and exists(select 1 from public.bookings
    where organization_id=p_organization_id and member_id=auth.uid()
      and access_source='team' and status in ('tentative','confirmed')
      and ends_at > now()) then
    raise exception using errcode='22023',message='cancel active team bookings before releasing seat';
  end if;
  update public.organization_members set seat_enabled=p_seat_enabled
  where organization_id=p_organization_id and user_id=auth.uid();
end;
$$;

create or replace function public.team_remove_member(
  p_organization_id uuid, p_user_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  perform 1 from public.organization_memberships
  where organization_id=p_organization_id for update;
  if not exists(select 1 from public.organization_members
    where organization_id=p_organization_id and user_id=p_user_id
      and role='member' and removed_at is null) then
    raise exception using errcode='P0002',message='active teammate not found';
  end if;
  update public.organization_members set removed_at=now(),seat_enabled=false
  where organization_id=p_organization_id and user_id=p_user_id;
  update public.bookings set status='cancelled',cancellation_reason='Team seat removed',
    cancelled_at=now(),cancelled_by=auth.uid()
  where organization_id=p_organization_id and member_id=p_user_id
    and access_source='team' and status in ('tentative','confirmed')
    and starts_at > now();
  update public.resource_reservations reservation set released_at=now()
  from public.bookings booking where booking.id=reservation.booking_id
    and booking.organization_id=p_organization_id and booking.member_id=p_user_id
    and booking.status='cancelled' and reservation.released_at is null;
  update public.reminder_deliveries reminder set status='skipped'
  from public.bookings booking where booking.id=reminder.booking_id
    and booking.organization_id=p_organization_id and booking.member_id=p_user_id
    and booking.status='cancelled' and reminder.status in ('pending','failed');
  perform private.record_audit(auth.uid(),'member','team.member_removed','organization',
    p_organization_id,null,jsonb_build_object('user_id',p_user_id));
end;
$$;

create or replace function public.get_team_capacity(p_organization_id uuid)
returns table(seat_allowance integer, occupied_seats integer, pending_invitations integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team_admin(p_organization_id) and not private.is_staff(null) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  return query
  select membership.seat_allowance,
    (select count(*)::integer from public.organization_members member
      where member.organization_id=p_organization_id
        and member.removed_at is null and member.seat_enabled),
    (select count(*)::integer from public.organization_invitations invite
      where invite.organization_id=p_organization_id
        and invite.accepted_at is null and invite.revoked_at is null
        and invite.expires_at > now())
  from public.organization_memberships membership
  where membership.organization_id=p_organization_id;
end;
$$;

create or replace function public.list_team_roster(p_organization_id uuid)
returns table(user_id uuid, display_name text, role text, seat_enabled boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team_admin(p_organization_id) and not private.is_staff(null) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  return query select member.user_id, profile.display_name, member.role,
    member.seat_enabled, member.joined_at
  from public.organization_members member
  join public.profiles profile on profile.id=member.user_id
  where member.organization_id=p_organization_id and member.removed_at is null
  order by member.role, profile.display_name;
end;
$$;

create or replace function public.list_team_invitations(p_organization_id uuid)
returns table(invitation_id uuid, email text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team_admin(p_organization_id) and not private.is_staff(null) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  return query select invite.id, invite.email, invite.expires_at
  from public.organization_invitations invite
  where invite.organization_id=p_organization_id
    and invite.revoked_at is null and invite.accepted_at is null
    and invite.expires_at > now()
  order by invite.created_at;
end;
$$;

create or replace function public.list_team_usage(p_organization_id uuid)
returns table(member_id uuid, display_name text, resource_name text,
  starts_at timestamptz, ends_at timestamptz, usage_hours numeric,
  attended_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team_admin(p_organization_id) and not private.is_staff(null) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  return query select booking.member_id, profile.display_name, resource.name,
    booking.starts_at, booking.ends_at,
    round((extract(epoch from booking.ends_at-booking.starts_at)/3600)::numeric,2),
    coalesce(attendance.attended_hours,0::numeric)
  from public.bookings booking
  join public.profiles profile on profile.id=booking.member_id
  join public.resources resource on resource.id=booking.resource_id
  left join lateral (
    select round(coalesce(sum(extract(epoch from
      (coalesce(session.checked_out_at,now())-session.checked_in_at))),0)::numeric / 3600,2)
      as attended_hours
    from public.attendance_sessions session
    where session.booking_id=booking.id and session.user_id=booking.member_id
  ) attendance on true
  where booking.organization_id=p_organization_id and booking.access_source='team'
    and booking.status in ('confirmed','completed','no_show')
  order by booking.starts_at desc;
end;
$$;

revoke all on function public.staff_create_team(text, uuid, integer, timestamptz, timestamptz) from public;
revoke all on function public.staff_set_team_membership(uuid, public.membership_status, integer, timestamptz, timestamptz) from public;
revoke all on function public.staff_transfer_team_admin(uuid, uuid) from public;
revoke all on function public.team_create_invitation(uuid, text) from public;
revoke all on function public.team_accept_invitation(text) from public;
revoke all on function public.team_revoke_invitation(uuid) from public;
revoke all on function public.team_set_admin_seat(uuid, boolean) from public;
revoke all on function public.team_remove_member(uuid, uuid) from public;
revoke all on function public.get_team_capacity(uuid) from public;
revoke all on function public.list_team_roster(uuid) from public;
revoke all on function public.list_team_invitations(uuid) from public;
revoke all on function public.list_team_usage(uuid) from public;
grant execute on function public.staff_create_team(text, uuid, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.staff_set_team_membership(uuid, public.membership_status, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.staff_transfer_team_admin(uuid, uuid) to authenticated;
grant execute on function public.team_create_invitation(uuid, text) to authenticated;
grant execute on function public.team_accept_invitation(text) to authenticated;
grant execute on function public.team_revoke_invitation(uuid) to authenticated;
grant execute on function public.team_set_admin_seat(uuid, boolean) to authenticated;
grant execute on function public.team_remove_member(uuid, uuid) to authenticated;
grant execute on function public.get_team_capacity(uuid) to authenticated;
grant execute on function public.list_team_roster(uuid) to authenticated;
grant execute on function public.list_team_invitations(uuid) to authenticated;
grant execute on function public.list_team_usage(uuid) to authenticated;

create or replace function public.staff_decide_team_application(
  p_application_id uuid, p_approve boolean, p_notes text,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_application public.team_membership_applications%rowtype;
  v_organization_id uuid;
begin
  if not private.is_staff(array['operations','admin','super_admin']::public.staff_role[]) then
    raise exception using errcode='42501',message='staff role required';
  end if;
  select * into v_application from public.team_membership_applications
  where id=p_application_id for update;
  if not found then
    raise exception using errcode='P0002',message='team application not found';
  end if;
  if v_application.status <> 'pending' then
    raise exception using errcode='22023',message='application has already been decided';
  end if;
  if p_approve then
    if not exists (
      select 1 from auth.users
      where id=v_application.applicant_id and email_confirmed_at is not null
    ) then
      raise exception using errcode='22023',message='verified admin account required';
    end if;
    insert into public.organizations(name)
    values (v_application.organization_name) returning id into v_organization_id;
    insert into public.organization_memberships
      (organization_id,status,seat_allowance,starts_at,ends_at,approved_by)
    values (v_organization_id,'pending',v_application.requested_seats,
      p_starts_at,p_ends_at,auth.uid());
    insert into public.organization_members
      (organization_id,user_id,role,seat_enabled)
    values (v_organization_id,v_application.applicant_id,'admin',false);
  end if;
  update public.team_membership_applications
  set status=case when p_approve then 'approved'::public.membership_application_status
    else 'rejected'::public.membership_application_status end,
    decided_at=now(),decided_by=auth.uid(),decision_notes=nullif(btrim(p_notes),'')
  where id=p_application_id;
  perform private.record_audit(auth.uid(),'staff','team.application_decided',
    'team_membership_application',p_application_id,
    jsonb_build_object('status','pending'),jsonb_build_object(
      'status',case when p_approve then 'approved' else 'rejected' end,
      'organization_id',v_organization_id));
  return v_organization_id;
end;
$$;
revoke all on function public.staff_decide_team_application(uuid, boolean, text, timestamptz, timestamptz) from public;
grant execute on function public.staff_decide_team_application(uuid, boolean, text, timestamptz, timestamptz) to authenticated;


-- Team bookings use the same capacity, hours, certification, audit, and reservation rules.
create or replace function private.validate_booking_request_with_access(
  p_user_id uuid,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_guest_count integer,
  p_access_source text,
  p_organization_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_resource public.resources%rowtype;
  v_duration_minutes integer;
  v_start_minute bigint;
begin
  if p_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  select *
  into v_resource
  from public.resources
  where id = p_resource_id
  for share;

  if not found or not v_resource.active or not v_resource.reservable then
    raise exception using errcode = '22023', message = 'resource is not reservable';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'booking end must be after start';
  end if;

  if p_starts_at <= now() then
    raise exception using errcode = '22023', message = 'booking must start in the future';
  end if;

  if p_starts_at > now() + make_interval(days => v_resource.booking_horizon_days) then
    raise exception using errcode = '22023', message = 'booking exceeds the resource horizon';
  end if;

  v_duration_minutes := floor(extract(epoch from (p_ends_at - p_starts_at)) / 60)::integer;
  v_start_minute := floor(extract(epoch from p_starts_at) / 60)::bigint;

  if v_duration_minutes <= 0
    or v_duration_minutes > v_resource.max_duration_minutes
    or mod(v_duration_minutes, v_resource.increment_minutes) <> 0
    or mod(v_start_minute, v_resource.increment_minutes) <> 0
  then
    raise exception using errcode = '22023', message = 'booking violates duration or increment rules';
  end if;

  if p_guest_count < 0
    or p_guest_count > v_resource.max_guests
    or p_guest_count + 1 > v_resource.capacity
    or (p_guest_count > 0 and not v_resource.guests_allowed)
  then
    raise exception using errcode = '22023', message = 'guest count exceeds resource policy';
  end if;

  if p_access_source = 'team' then
    perform 1 from public.organization_memberships
    where organization_id = p_organization_id for share;
  end if;

  if not private.has_booking_access(
    p_user_id, p_access_source, p_organization_id, p_starts_at, p_ends_at
  ) then
    raise exception using errcode = '42501', message = 'active membership is required';
  end if;

  if not private.has_valid_resource_certifications(
    p_user_id,
    p_resource_id,
    p_starts_at,
    p_ends_at
  ) then
    raise exception using errcode = '42501', message = 'required certification is missing or expired';
  end if;

  if not private.within_resource_hours(p_resource_id, p_starts_at, p_ends_at) then
    raise exception using errcode = '22023', message = 'booking falls outside operating hours';
  end if;
end;
$$;

create or replace function public.create_booking_with_access(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_guest_names text[],
  p_notes text,
  p_idempotency_key text,
  p_access_source text,
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking_id uuid;
  v_guest_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if p_idempotency_key is not null then
    select booking.id
    into v_booking_id
    from public.bookings booking
    where booking.member_id = v_user_id
      and booking.idempotency_key = p_idempotency_key;

    if found then
      if not exists (
        select 1 from public.bookings booking
        where booking.id = v_booking_id
          and booking.access_source = p_access_source
          and booking.organization_id is not distinct from p_organization_id
      ) then
        raise exception using errcode = '22023',
          message = 'idempotency key belongs to a different access source';
      end if;
      return v_booking_id;
    end if;
  end if;

  select count(*)::integer
  into v_guest_count
  from unnest(coalesce(p_guest_names, '{}')) guest_name
  where btrim(guest_name) <> '';

  perform private.validate_booking_request_with_access(
    v_user_id,
    p_resource_id,
    p_starts_at,
    p_ends_at,
    v_guest_count,
    p_access_source,
    p_organization_id
  );

  insert into public.bookings (
    resource_id,
    member_id,
    status,
    starts_at,
    ends_at,
    notes,
    idempotency_key,
    access_source,
    organization_id
  )
  values (
    p_resource_id,
    v_user_id,
    'confirmed',
    p_starts_at,
    p_ends_at,
    p_notes,
    p_idempotency_key,
    p_access_source,
    p_organization_id
  )
  returning id into v_booking_id;

  insert into public.booking_guests (booking_id, name)
  select v_booking_id, btrim(guest_name)
  from unnest(coalesce(p_guest_names, '{}')) guest_name
  where btrim(guest_name) <> '';

  insert into public.resource_reservations (
    resource_id,
    kind,
    booking_id,
    starts_at,
    ends_at
  )
  values (
    p_resource_id,
    'booking',
    v_booking_id,
    p_starts_at,
    p_ends_at
  );

  perform private.record_audit(
    v_user_id,
    'member',
    'booking.created',
    'booking',
    v_booking_id,
    null,
    jsonb_build_object(
      'resource_id', p_resource_id,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'guest_count', v_guest_count,
      'access_source', p_access_source,
      'organization_id', p_organization_id
    )
  );

  return v_booking_id;
exception
  when exclusion_violation then
    raise exception using
      errcode = '23P01',
      message = 'resource is no longer available for that time';
end;
$$;

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_expected_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_guest_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'booking not found';
  end if;

  if v_booking.member_id <> v_user_id and not private.is_staff(null) then
    raise exception using errcode = '42501', message = 'booking access denied';
  end if;

  if v_booking.status not in ('tentative', 'confirmed') then
    raise exception using errcode = '22023', message = 'booking cannot be rescheduled';
  end if;

  if p_expected_updated_at is not null and v_booking.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'booking changed; reload before rescheduling';
  end if;

  select count(*)::integer
  into v_guest_count
  from public.booking_guests guest
  where guest.booking_id = p_booking_id;

  perform private.validate_booking_request_with_access(
    v_booking.member_id,
    v_booking.resource_id,
    p_starts_at,
    p_ends_at,
    v_guest_count,
    v_booking.access_source,
    v_booking.organization_id
  );

  update public.resource_reservations
  set starts_at = p_starts_at, ends_at = p_ends_at
  where booking_id = p_booking_id and released_at is null;

  update public.bookings
  set starts_at = p_starts_at, ends_at = p_ends_at
  where id = p_booking_id;

  perform private.record_audit(
    v_user_id,
    case
      when v_user_id = v_booking.member_id then 'member'::public.audit_actor_type
      else 'staff'::public.audit_actor_type
    end,
    'booking.rescheduled',
    'booking',
    p_booking_id,
    jsonb_build_object('starts_at', v_booking.starts_at, 'ends_at', v_booking.ends_at),
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at)
  );

  return p_booking_id;
exception
  when exclusion_violation then
    raise exception using
      errcode = '23P01',
      message = 'resource is no longer available for that time';
end;
$$;

revoke all on function private.validate_booking_request_with_access(uuid, uuid, timestamptz, timestamptz, integer, text, uuid) from public;
revoke all on function public.create_booking_with_access(uuid, timestamptz, timestamptz, text[], text, text, text, uuid) from public;
grant execute on function public.create_booking_with_access(uuid, timestamptz, timestamptz, text[], text, text, text, uuid) to authenticated;


-- Checkout remains available after a team seat is removed.
create or replace function public.create_checkin_intent(
  p_booking_id uuid default null,
  p_action public.checkin_action default 'check_in'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_resource public.resources%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_token text;
  v_intent_id uuid;
  v_expires_at timestamptz := now() + interval '60 seconds';
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if p_action = 'check_in' then
    if p_booking_id is null then
      raise exception using errcode = '22023', message = 'a booking is required for check-in';
    end if;

    select *
    into v_booking
    from public.bookings
    where id = p_booking_id and member_id = v_user_id and status = 'confirmed';

    if not found then
      raise exception using errcode = '42501', message = 'confirmed booking not found';
    end if;

    if v_booking.access_source = 'team' then
      perform 1 from public.organization_memberships
      where organization_id=v_booking.organization_id for share;
    end if;

    if not private.has_booking_access(
      v_user_id, v_booking.access_source, v_booking.organization_id,
      now(), v_booking.ends_at
    ) then
      raise exception using errcode = '42501', message = 'active membership is required';
    end if;

    select *
    into v_resource
    from public.resources
    where id = v_booking.resource_id;

    if now() < v_booking.starts_at - make_interval(mins => v_resource.checkin_early_minutes)
      or now() > v_booking.starts_at + make_interval(mins => v_resource.checkin_late_minutes)
    then
      raise exception using errcode = '22023', message = 'check-in window is closed';
    end if;

    if not private.has_valid_resource_certifications(
      v_user_id,
      v_booking.resource_id,
      now(),
      v_booking.ends_at
    ) then
      raise exception using errcode = '42501', message = 'required certification is missing or expired';
    end if;
  else
    select *
    into v_session
    from public.attendance_sessions
    where user_id = v_user_id
      and status = 'active'
      and (p_booking_id is null or booking_id = p_booking_id)
    order by checked_in_at desc
    limit 1;

    if not found then
      raise exception using errcode = 'P0002', message = 'active attendance session not found';
    end if;

    p_booking_id := v_session.booking_id;
  end if;

  update public.checkin_intents
  set status = 'cancelled'
  where user_id = v_user_id and status = 'pending';

  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    E'+/=\\n',
    '-_'
  );

  insert into public.checkin_intents (
    user_id,
    booking_id,
    action,
    token_hash,
    expires_at
  )
  values (
    v_user_id,
    p_booking_id,
    p_action,
    extensions.digest(convert_to(v_token, 'utf8'), 'sha256'),
    v_expires_at
  )
  returning id into v_intent_id;

  return jsonb_build_object(
    'intent_id', v_intent_id,
    'token', v_token,
    'action', p_action,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.redeem_checkin_intent(
  p_token_hash_hex text,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.kiosk_devices%rowtype;
  v_intent public.checkin_intents%rowtype;
  v_booking public.bookings%rowtype;
  v_resource public.resources%rowtype;
  v_session_id uuid;
begin
  select *
  into v_device
  from public.kiosk_devices
  where id = p_device_id and status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'kiosk device is not active';
  end if;

  update public.checkin_intents
  set status = 'expired'
  where token_hash = decode(p_token_hash_hex, 'hex')
    and status = 'pending'
    and expires_at <= now();

  update public.checkin_intents
  set
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_by_device = p_device_id
  where id = (
    select intent.id
    from public.checkin_intents intent
    where intent.token_hash = decode(p_token_hash_hex, 'hex')
      and intent.status = 'pending'
      and intent.expires_at > now()
    for update skip locked
  )
  returning * into v_intent;

  if not found then
    raise exception using errcode = '22023', message = 'check-in token is expired, invalid, or already used';
  end if;

  if v_intent.action = 'check_in' then
    select *
    into v_booking
    from public.bookings
    where id = v_intent.booking_id
      and member_id = v_intent.user_id
      and status = 'confirmed'
    for update;

    if not found then
      raise exception using errcode = '42501', message = 'confirmed booking not found';
    end if;

    if v_booking.access_source = 'team' then
      perform 1 from public.organization_memberships
      where organization_id=v_booking.organization_id for share;
    end if;

    if not private.has_booking_access(
      v_intent.user_id, v_booking.access_source, v_booking.organization_id,
      now(), v_booking.ends_at
    ) then
      raise exception using errcode = '42501', message = 'membership is not active';
    end if;

    select *
    into v_resource
    from public.resources
    where id = v_booking.resource_id;

    if v_resource.location_id <> v_device.location_id then
      raise exception using errcode = '42501', message = 'booking belongs to another location';
    end if;

    if now() < v_booking.starts_at - make_interval(mins => v_resource.checkin_early_minutes)
      or now() > v_booking.starts_at + make_interval(mins => v_resource.checkin_late_minutes)
    then
      raise exception using errcode = '22023', message = 'check-in window is closed';
    end if;

    if not private.has_valid_resource_certifications(
      v_intent.user_id,
      v_booking.resource_id,
      now(),
      v_booking.ends_at
    ) then
      raise exception using errcode = '42501', message = 'required certification is missing or expired';
    end if;

    insert into public.attendance_sessions (
      user_id,
      booking_id,
      resource_id,
      location_id,
      checked_in_by_device
    )
    values (
      v_intent.user_id,
      v_booking.id,
      v_booking.resource_id,
      v_device.location_id,
      p_device_id
    )
    returning id into v_session_id;

    insert into public.access_events (
      user_id,
      session_id,
      booking_id,
      device_id,
      event_type
    )
    values (
      v_intent.user_id,
      v_session_id,
      v_booking.id,
      p_device_id,
      'check_in'
    );
  else
    update public.attendance_sessions
    set
      status = 'closed',
      checked_out_at = now(),
      checked_out_by_device = p_device_id
    where id = (
      select session.id
      from public.attendance_sessions session
      where session.user_id = v_intent.user_id
        and session.location_id = v_device.location_id
        and session.status = 'active'
        and (v_intent.booking_id is null or session.booking_id = v_intent.booking_id)
      order by session.checked_in_at desc
      limit 1
      for update
    )
    returning id into v_session_id;

    if v_session_id is null then
      raise exception using errcode = 'P0002', message = 'active attendance session not found';
    end if;

    insert into public.access_events (
      user_id,
      session_id,
      booking_id,
      device_id,
      event_type
    )
    values (
      v_intent.user_id,
      v_session_id,
      v_intent.booking_id,
      p_device_id,
      'check_out'
    );
  end if;

  update public.kiosk_devices
  set last_seen_at = now()
  where id = p_device_id;

  perform private.record_audit(
    null,
    'kiosk',
    'attendance.' || v_intent.action::text,
    'attendance_session',
    v_session_id,
    null,
    jsonb_build_object(
      'member_id', v_intent.user_id,
      'booking_id', v_intent.booking_id,
      'device_id', p_device_id
    )
  );

  return jsonb_build_object(
    'session_id', v_session_id,
    'action', v_intent.action,
    'member_id', v_intent.user_id,
    'booking_id', v_intent.booking_id,
    'processed_at', now()
  );
end;
$$;
