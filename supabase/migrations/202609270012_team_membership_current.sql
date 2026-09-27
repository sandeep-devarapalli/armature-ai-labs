-- Identity approval and organization administration are separate from paid access.
create function private.has_approved_basic_membership(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.basic_onboarding_applications a
 join auth.users u on u.id=a.user_id
 left join public.memberships m on m.user_id=a.user_id
 where a.user_id=p_user_id and a.status='approved' and u.email_confirmed_at is not null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 and coalesce(m.status<>'suspended',true));
$$;
revoke all on function private.has_approved_basic_membership(uuid) from public,anon,authenticated;

create or replace function private.is_team_admin(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members member
    left join public.memberships personal on personal.user_id = member.user_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.role = 'admin' and member.removed_at is null
      and private.has_approved_basic_membership(member.user_id)
  );
$$;

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
      and private.has_approved_basic_membership(member.user_id)
  );
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
      and private.has_approved_basic_membership(member.user_id),
    membership.starts_at, membership.ends_at
  from public.organization_members member
  join public.organizations org on org.id = member.organization_id
  join public.organization_memberships membership on membership.organization_id = org.id
  left join public.memberships personal on personal.user_id = member.user_id
  where member.user_id = auth.uid() and member.removed_at is null;
$$;

create or replace function public.submit_team_application(
  p_organization_name text, p_contact_name text, p_summary text, p_requested_seats integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.has_approved_basic_membership(auth.uid()) then
    raise exception using errcode='42501',message='approved basic membership required';
  end if;
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

create or replace function public.team_accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.organization_invitations%rowtype;
  v_membership public.organization_memberships%rowtype;
  v_email text;
  v_organization_id uuid;
begin
  if not private.has_approved_basic_membership(auth.uid()) then
    raise exception using errcode='42501',message='approved basic membership required';
  end if;
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
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and nullif(btrim(display_name),'') is not null
  ) then
    raise exception using errcode = '22023', message = 'profile display name required';
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

create or replace function public.staff_create_team(
  p_organization_name text, p_admin_user_id uuid, p_seat_allowance integer,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
    raise exception using errcode = '42501', message = 'staff role required';
  end if;
  if not private.has_approved_basic_membership(p_admin_user_id) or not exists (
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
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
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
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
    raise exception using errcode = '42501', message = 'staff role required';
  end if;
  perform 1 from public.organization_memberships
  where organization_id=p_organization_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'team membership not found';
  end if;
  if not private.has_approved_basic_membership(p_new_admin_user_id) or not exists (
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

create or replace function public.staff_decide_team_application(
  p_application_id uuid, p_approve boolean, p_notes text,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_application public.team_membership_applications%rowtype;
  v_organization_id uuid;
begin
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
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
    if not private.has_approved_basic_membership(v_application.applicant_id) or not exists (
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

create or replace function public.get_team_capacity(p_organization_id uuid)
returns table(seat_allowance integer, occupied_seats integer, pending_invitations integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_team_admin(p_organization_id) and not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
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
  if not private.is_team_admin(p_organization_id) and not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
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
  if not private.is_team_admin(p_organization_id) and not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
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
  if not private.is_team_admin(p_organization_id) and not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
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
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
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
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
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
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
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

drop policy organizations_read on public.organizations;
create policy organizations_read on public.organizations for select to authenticated
using (
  (select private.is_staff(array['admin','super_admin']::public.staff_role[])) or exists (
    select 1 from public.organization_members member
    where member.organization_id = id
      and member.user_id = (select auth.uid()) and member.removed_at is null
  )
);
drop policy organization_memberships_read on public.organization_memberships;
create policy organization_memberships_read on public.organization_memberships for select to authenticated
using (
  (select private.is_staff(array['admin','super_admin']::public.staff_role[])) or exists (
    select 1 from public.organization_members member
    where member.organization_id = organization_memberships.organization_id
      and member.user_id = (select auth.uid()) and member.removed_at is null
  )
);
drop policy organization_members_read on public.organization_members;
create policy organization_members_read on public.organization_members for select to authenticated
using (
  (select private.is_staff(array['admin','super_admin']::public.staff_role[])) or user_id = (select auth.uid())
  or (select private.is_team_admin(organization_id))
);
drop policy organization_invitations_read on public.organization_invitations;
create policy organization_invitations_read on public.organization_invitations for select to authenticated
using ((select private.is_staff(array['admin','super_admin']::public.staff_role[])) or (select private.is_team_admin(organization_id)));
drop policy team_membership_applications_read on public.team_membership_applications;
create policy team_membership_applications_read on public.team_membership_applications for select to authenticated
using (applicant_id = (select auth.uid()) or (select private.is_staff(array['admin','super_admin']::public.staff_role[])));

create function public.team_transfer_admin(p_organization_id uuid,p_new_admin_user_id uuid,p_confirm boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_previous uuid;
begin
  if p_confirm is distinct from true then
    raise exception using errcode='22023',message='confirm team ownership transfer';
  end if;
  perform 1 from public.organization_memberships where organization_id=p_organization_id for update;
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  if p_new_admin_user_id=auth.uid() or not private.has_approved_basic_membership(p_new_admin_user_id)
    or not exists(select 1 from public.organization_members
      where organization_id=p_organization_id and user_id=p_new_admin_user_id
        and role='member' and removed_at is null and seat_enabled) then
    raise exception using errcode='22023',message='new admin must be an approved active teammate';
  end if;
  v_previous:=auth.uid();
  update public.organization_members set role='member'
    where organization_id=p_organization_id and user_id=v_previous;
  update public.organization_members set role='admin'
    where organization_id=p_organization_id and user_id=p_new_admin_user_id;
  perform private.record_audit(auth.uid(),'member','team.admin_transferred','organization',
    p_organization_id,jsonb_build_object('admin_user_id',v_previous),
    jsonb_build_object('admin_user_id',p_new_admin_user_id));
end;
$$;
revoke all on function public.team_transfer_admin(uuid,uuid,boolean) from public,anon;
grant execute on function public.team_transfer_admin(uuid,uuid,boolean) to authenticated;

alter table public.bookings add column booked_by uuid references auth.users(id) on delete set null;

create function public.team_create_booking(
  p_organization_id uuid,p_member_id uuid,p_resource_id uuid,
  p_starts_at timestamptz,p_ends_at timestamptz,p_guest_names text[],
  p_notes text,p_idempotency_key text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_booking_id uuid; v_guest_count integer;
begin
  perform 1 from public.organization_memberships where organization_id=p_organization_id for update;
  if not private.is_team_admin(p_organization_id) then
    raise exception using errcode='42501',message='team admin required';
  end if;
  if not private.has_active_team_membership(p_member_id,p_organization_id,p_starts_at,p_ends_at) then
    raise exception using errcode='42501',message='approved active teammate with a seat required';
  end if;
  if p_idempotency_key is not null then
    select id into v_booking_id from public.bookings where member_id=p_member_id
      and idempotency_key=p_idempotency_key;
    if found then
      if not exists(select 1 from public.bookings where id=v_booking_id
        and access_source='team' and organization_id=p_organization_id
        and booked_by=auth.uid() and resource_id=p_resource_id
        and starts_at=p_starts_at and ends_at=p_ends_at) then
        raise exception using errcode='22023',message='idempotency key belongs to a different booking';
      end if;
      return v_booking_id;
    end if;
  end if;
  select count(*)::integer into v_guest_count
    from unnest(coalesce(p_guest_names,'{}')) name where btrim(name)<>'';
  perform private.validate_booking_request_with_access(p_member_id,p_resource_id,
    p_starts_at,p_ends_at,v_guest_count,'team',p_organization_id);
  insert into public.bookings(resource_id,member_id,booked_by,status,starts_at,ends_at,
    notes,idempotency_key,access_source,organization_id)
  values(p_resource_id,p_member_id,auth.uid(),'confirmed',p_starts_at,p_ends_at,
    p_notes,p_idempotency_key,'team',p_organization_id) returning id into v_booking_id;
  insert into public.booking_guests(booking_id,name)
    select v_booking_id,btrim(name) from unnest(coalesce(p_guest_names,'{}')) name where btrim(name)<>'';
  insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at)
    values(p_resource_id,'booking',v_booking_id,p_starts_at,p_ends_at);
  perform private.record_audit(auth.uid(),'member','booking.created','booking',v_booking_id,null,
    jsonb_build_object('member_id',p_member_id,'booked_by',auth.uid(),
      'resource_id',p_resource_id,'organization_id',p_organization_id,'access_source','team',
      'starts_at',p_starts_at,'ends_at',p_ends_at,'guest_count',v_guest_count));
  return v_booking_id;
exception when exclusion_violation then
  raise exception using errcode='23P01',message='resource is no longer available for that time';
end;
$$;
revoke all on function public.team_create_booking(uuid,uuid,uuid,timestamptz,timestamptz,text[],text,text) from public,anon;
grant execute on function public.team_create_booking(uuid,uuid,uuid,timestamptz,timestamptz,text[],text,text) to authenticated;
