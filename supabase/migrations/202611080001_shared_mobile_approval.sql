-- Staff attestation reuses genuine source OTP evidence without changing Auth or paid entitlements.
-- No arbitrary expiry: explicit revocation and current-account/snapshot checks govern validity.
create table private.shared_mobile_approvals (
 id uuid primary key default extensions.gen_random_uuid(),
 target_user_id uuid not null references auth.users(id),
 source_user_id uuid not null references auth.users(id),
 phone text not null,
 source_verified_at timestamptz not null,
 source_auth_confirmed_at timestamptz not null,
 source_revision integer not null,
 target_revision integer not null,
 source_email text not null,
 target_email text not null,
 reviewer_id uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 10 and 1000),
 confirmed_same_person boolean not null check(confirmed_same_person),
 approved_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id),
 revocation_reason text,
 check(source_user_id<>target_user_id and reviewer_id<>source_user_id and reviewer_id<>target_user_id),
 check((revoked_at is null and revoked_by is null and revocation_reason is null)
   or (revoked_at is not null and revoked_by is not null and length(btrim(revocation_reason)) between 10 and 1000))
);
create unique index shared_mobile_active_target on private.shared_mobile_approvals(target_user_id) where revoked_at is null;
alter table private.shared_mobile_approvals enable row level security;
revoke all on private.shared_mobile_approvals from public,anon,authenticated;

create function private.has_otp_verified_mobile(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.member_phone_verifications p
 join auth.users u on u.id=p.user_id join public.basic_onboarding_applications a on a.user_id=p.user_id
 where p.user_id=p_user_id and p.verified_at<=now() and u.phone_confirmed_at is not null
 and p.phone=private.normalize_membership_phone('+'||ltrim(u.phone,'+'))
 and p.phone=private.normalize_membership_phone(a.phone));
$$;
create function private.has_shared_verified_mobile(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.shared_mobile_approvals link
 join private.member_phone_verifications proof on proof.user_id=link.source_user_id
 join auth.users source on source.id=link.source_user_id
 join auth.users target on target.id=link.target_user_id
 join public.basic_onboarding_applications sa on sa.user_id=source.id
 join public.basic_onboarding_applications ta on ta.user_id=target.id
 where link.target_user_id=p_user_id and link.revoked_at is null
 and private.has_basic_membership(source.id) and private.has_basic_membership(target.id)
 and sa.status='approved' and ta.status='approved'
 and sa.revision=link.source_revision and ta.revision=link.target_revision
 and source.email=link.source_email and target.email=link.target_email
 and source.phone_confirmed_at=link.source_auth_confirmed_at
 and proof.phone=link.phone and proof.verified_at=link.source_verified_at
 and private.has_otp_verified_mobile(source.id)
 and private.normalize_membership_phone(ta.phone)=link.phone);
$$;
create or replace function private.has_verified_mobile(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_otp_verified_mobile(p_user_id) or private.has_shared_verified_mobile(p_user_id);
$$;
revoke all on function private.has_otp_verified_mobile(uuid),private.has_shared_verified_mobile(uuid) from public,anon,authenticated;

create function public.approve_shared_member_phone(p_target_user_id uuid,p_source_email text,p_reason text,p_confirmed_same_person boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); source auth.users; target auth.users;
 sa public.basic_onboarding_applications; ta public.basic_onboarding_applications;
 proof private.member_phone_verifications;
begin
 if actor is null or not private.has_basic_membership(actor) or auth.role() is distinct from 'authenticated' or auth.jwt()->>'aal' is distinct from 'aal2'
   or not exists(select 1 from public.staff_roles where user_id=actor and role in ('admin','super_admin')) then
   raise exception 'Independent MFA Admin required' using errcode='42501';
 end if;
 if p_confirmed_same_person is distinct from true or coalesce(length(btrim(p_reason)),0) not between 10 and 1000
   or coalesce(length(btrim(p_source_email)),0) not between 3 and 320 then
   raise exception 'Confirm same person and record the review reason' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target_user_id::text,110801));
 select * into source from auth.users where lower(email)=lower(btrim(p_source_email)) for share;
 select * into target from auth.users where id=p_target_user_id for share;
 if source.id is null or target.id is null or source.id=target.id or actor in (source.id,target.id) then
   raise exception 'Independent accounts and reviewer required' using errcode='42501';
 end if;
 select * into sa from public.basic_onboarding_applications where user_id=source.id for share;
 select * into ta from public.basic_onboarding_applications where user_id=target.id for share;
 select * into proof from private.member_phone_verifications where user_id=source.id for share;
 if not private.has_basic_membership(source.id) or not private.has_basic_membership(target.id)
   or sa.status is distinct from 'approved' or ta.status is distinct from 'approved'
   or not private.has_otp_verified_mobile(source.id) or private.has_otp_verified_mobile(target.id)
   or private.normalize_membership_phone(ta.phone) is distinct from proof.phone then
   raise exception 'Confirmed accounts, approved identities and matching genuine mobile proof required' using errcode='22023';
 end if;
 if exists(select 1 from private.shared_mobile_approvals where target_user_id=target.id and revoked_at is null) then
   raise exception 'Revoke the existing shared mobile approval before reviewing again' using errcode='22023';
 end if;
 insert into private.shared_mobile_approvals(target_user_id,source_user_id,phone,source_verified_at,source_auth_confirmed_at,
   source_revision,target_revision,source_email,target_email,reviewer_id,reason,confirmed_same_person)
 values(target.id,source.id,proof.phone,proof.verified_at,source.phone_confirmed_at,sa.revision,ta.revision,
   source.email,target.email,actor,btrim(p_reason),true);
 return jsonb_build_object('approved',true,'method','staff_shared');
end;
$$;
create function public.revoke_shared_member_phone(p_target_user_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); link private.shared_mobile_approvals;
begin
 if actor is null or not private.has_basic_membership(actor) or auth.role() is distinct from 'authenticated' or auth.jwt()->>'aal' is distinct from 'aal2'
   or not exists(select 1 from public.staff_roles where user_id=actor and role in ('admin','super_admin')) then
   raise exception 'Independent MFA Admin required' using errcode='42501';
 end if;
 if coalesce(length(btrim(p_reason)),0) not between 10 and 1000 then raise exception 'Record the revocation reason' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target_user_id::text,110801));
 select * into link from private.shared_mobile_approvals where target_user_id=p_target_user_id and revoked_at is null for update;
 if link.id is null or actor in (link.target_user_id,link.source_user_id) then
   raise exception 'Independent reviewer and active approval required' using errcode='42501';
 end if;
 update private.shared_mobile_approvals set revoked_at=clock_timestamp(),revoked_by=actor,revocation_reason=btrim(p_reason) where id=link.id;
 return jsonb_build_object('revoked',true);
end;
$$;
revoke all on function public.approve_shared_member_phone(uuid,text,text,boolean),public.revoke_shared_member_phone(uuid,text) from public,anon;
grant execute on function public.approve_shared_member_phone(uuid,text,text,boolean),public.revoke_shared_member_phone(uuid,text) to authenticated;

create or replace function private.membership_level_summary(p_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('membership_levels_enabled',enabled,
 'mobile_verification_method',case when private.has_otp_verified_mobile(p_user_id) then 'otp' when private.has_shared_verified_mobile(p_user_id) then 'staff_shared' end,
 'membership_level',case when enabled then private.membership_level_at(p_user_id) end,
 'verification',jsonb_build_object(
 'email',exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null and deleted_at is null),
 'mobile',private.has_verified_mobile(p_user_id),
 'identity',exists(select 1 from public.basic_onboarding_applications where user_id=p_user_id and status='approved')),
 'next_status_change_at',case when enabled and private.has_verified_membership(p_user_id) then (
 select min(boundary) from (
 select starts_at boundary from private.member_premium_periods(p_user_id)
 union select ends_at from private.member_premium_periods(p_user_id)) boundaries
 where boundary>now() and private.membership_level_at(p_user_id,boundary) is distinct from private.membership_level_at(p_user_id)) end)
 from (select private.membership_levels_enabled() enabled) settings;
$$;

create or replace function public.member_phone_operation(p_action text,p_user_id uuid,p_phone text default null,p_channel text default null,p_intent uuid default null,p_hook_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i private.member_phone_intents; v private.member_phone_verifications; a auth.users; k text; n integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,100102));
 select * into a from auth.users where id=p_user_id;
 if a.id is null or a.email_confirmed_at is null or coalesce(a.is_anonymous,false) then
   raise exception 'Confirmed email required' using errcode='42501'; end if;
 select * into i from private.member_phone_intents where user_id=p_user_id for update;
 if p_action='status' and not private.has_otp_verified_mobile(p_user_id) and private.has_shared_verified_mobile(p_user_id)
   and not (i.id is not null and i.completed_at is null and i.expires_at>now()) then
   return jsonb_build_object('verified',true,'method','staff_shared','phone',null);
 end if;
 if p_action='start' then
   if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' or p_channel not in ('whatsapp','sms') then raise exception 'Invalid request'; end if;
   if i.resend_available_at > now() then return jsonb_build_object('error','rate_limited'); end if;
   -- Bound both account abuse and many accounts targeting the same destination.
   foreach k in array array['account:'||p_user_id::text,'phone:'||encode(extensions.digest(p_phone,'sha256'),'hex')] loop
     insert into private.member_phone_limits values(k,now(),1) on conflict(key) do update
      set window_start=case when member_phone_limits.window_start<=now()-interval '1 hour' then now() else member_phone_limits.window_start end,
      attempts=case when member_phone_limits.window_start<=now()-interval '1 hour' then 1 else member_phone_limits.attempts+1 end returning attempts into n;
     if n>5 then return jsonb_build_object('error','rate_limited'); end if;
   end loop;
   if exists(select 1 from private.member_phone_verifications where phone=p_phone and user_id<>p_user_id)
     or exists(select 1 from private.member_phone_intents where phone=p_phone and user_id<>p_user_id and completed_at is null and expires_at>now()) then return jsonb_build_object('error','unavailable'); end if;
   insert into private.member_phone_intents(user_id,phone,channel,expires_at,resend_available_at)
    values(p_user_id,p_phone,p_channel,now()+interval '5 minutes',now()+interval '60 seconds')
    on conflict(user_id) do update set id=gen_random_uuid(),phone=excluded.phone,channel=excluded.channel,
    created_at=now(),expires_at=excluded.expires_at,resend_available_at=excluded.resend_available_at,
    hook_id=null,hook_claimed_at=null,delivered=false,attempts=0,completed_at=null returning * into i;
 elsif p_action='claim_hook' then
   if i.id is null or i.phone is distinct from p_phone or i.expires_at<=now() or i.created_at<now()-interval '60 seconds' or i.hook_id is not null or i.completed_at is not null or p_hook_id is null then return jsonb_build_object('error','verification_changed'); end if;
   delete from private.member_phone_hook_receipts where received_at<now()-interval '1 day';
   insert into private.member_phone_hook_receipts(hook_id) values(p_hook_id) on conflict do nothing;
   if not found then return jsonb_build_object('error','verification_changed'); end if;
   update private.member_phone_intents set hook_id=p_hook_id,hook_claimed_at=now() where user_id=p_user_id returning * into i;
 elsif p_action='sent' then
   if i.id is distinct from p_intent or i.hook_id is distinct from p_hook_id then return jsonb_build_object('error','verification_changed'); end if;
   update private.member_phone_intents set delivered=true where user_id=p_user_id returning * into i;
 elsif p_action='verify' then
   if i.id is null or i.expires_at<=now() or not i.delivered or i.completed_at is not null or '+'||ltrim(a.phone_change,'+') is distinct from i.phone then return jsonb_build_object('error','verification_changed'); end if;
   if i.attempts>=5 then return jsonb_build_object('error','rate_limited'); end if;
   update private.member_phone_intents set attempts=attempts+1 where user_id=p_user_id returning * into i;
 elsif p_action='complete' then
   if i.id is distinct from p_intent or i.completed_at is not null or i.expires_at<=now() or not i.delivered or i.attempts<1
     or '+'||ltrim(a.phone,'+') is distinct from i.phone or a.phone_confirmed_at is null or a.phone_confirmed_at<i.created_at
   then return jsonb_build_object('error','verification_changed'); end if;
   insert into private.member_phone_verifications(user_id,phone,verified_at) values(p_user_id,i.phone,now())
    on conflict(user_id) do update set phone=excluded.phone,verified_at=excluded.verified_at;
   update public.basic_onboarding_applications set phone=i.phone where user_id=p_user_id;
   update private.member_phone_intents set completed_at=now() where user_id=p_user_id returning * into i;
 elsif p_action <> 'status' then raise exception 'Invalid action'; end if;
 select * into v from private.member_phone_verifications where user_id=p_user_id;
 return jsonb_build_object('id',i.id,'delivered',i.delivered,'phone',case when i.completed_at is null and i.expires_at>now() then i.phone else v.phone end,
  'channel',i.channel,'expires_at',case when i.completed_at is null then i.expires_at end,'resend_available_at',i.resend_available_at,
  'verified',v.user_id is not null and '+'||ltrim(a.phone,'+')=v.phone and a.phone_confirmed_at is not null
    and (i.completed_at is not null or i.expires_at is null or i.expires_at<=now() or i.phone=v.phone));
end; $$;
