create table public.venture_pass_settings (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false
);
insert into public.venture_pass_settings default values;
alter table public.venture_pass_settings enable row level security;
revoke all on public.venture_pass_settings from public,anon,authenticated,service_role;
grant select,update on public.venture_pass_settings to service_role;

create table private.venture_pass_applications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id),
 firm_name text not null check (length(firm_name) between 2 and 120),
 firm_type text not null check (firm_type in ('independent_vc','corporate_venture')),
 contact_name text not null check (length(contact_name) between 2 and 120),
 website text check (length(website)<=500),
 details text not null check (length(details) between 3 and 1000),
 status text not null default 'pending' check (status in ('pending','approved','declined','expired','confirmed')),
 created_at timestamptz not null default clock_timestamp(),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 payment_expires_at timestamptz,
 payment_claimed_at timestamptz,
 payment_link_id text unique check (payment_link_id ~ '^plink_[A-Za-z0-9]{1,80}$'),
 payment_url text check (payment_url ~ '^https://rzp[.]io/((i|l|rzp)/)?[A-Za-z0-9_-]{1,120}$'),
 payment_id text unique check (payment_id ~ '^pay_[A-Za-z0-9]{1,80}$'),
 paid_at timestamptz,
 confirmed_at timestamptz,
 ends_at timestamptz,
 check ((payment_expires_at is not null) = (status in ('approved','expired','confirmed'))),
 check (payment_expires_at is null or (reviewed_at is not null and payment_expires_at=reviewed_at+interval '1 hour')),
 check (payment_claimed_at is null or payment_claimed_at>=reviewed_at and payment_claimed_at<payment_expires_at),
 check ((payment_link_id is null) = (payment_url is null)),
 check (payment_link_id is null or payment_claimed_at is not null),
 check ((payment_id is not null) = (status='confirmed')),
 check (status<>'confirmed' or (payment_link_id is not null and paid_at is not null and confirmed_at is not null and ends_at is not null
  and paid_at>=reviewed_at and paid_at<payment_expires_at and confirmed_at>=paid_at and ends_at>paid_at))
);
create index venture_pass_capacity on private.venture_pass_applications(status,payment_expires_at,ends_at)
 where status in ('approved','confirmed');
alter table private.venture_pass_applications enable row level security;
revoke all on private.venture_pass_applications from public,anon,authenticated,service_role;

create function private.venture_pass_applications_open() returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.venture_pass_settings where singleton and enabled);
$$;

create function private.venture_pass_reviewer() returns uuid
language plpgsql stable set search_path='' as $$
declare reviewer uuid:=private.visit_pass_user();
begin
 if auth.jwt()->>'aal' is distinct from 'aal2'
  or not private.is_staff(array['admin','super_admin']::public.staff_role[]) then
  raise exception 'An MFA-authorised administrator is required' using errcode='42501';
 end if;
 return reviewer;
end;
$$;

create function private.venture_pass_payload(p private.venture_pass_applications) returns jsonb
language sql stable set search_path='' as $$
 select to_jsonb(p)-array['reviewed_by','payment_link_id','payment_url'] ||
  jsonb_build_object('email',(select email from auth.users where id=p.user_id),
   'status',case when p.status='approved' and p.payment_expires_at<=statement_timestamp()
     and p.payment_claimed_at is null then 'expired' else p.status end);
$$;

create function public.get_my_venture_pass_application() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare applicant uuid:=private.visit_pass_user();
begin
 return (select private.venture_pass_payload(p) from private.venture_pass_applications p where p.user_id=applicant);
end;
$$;

create function public.submit_venture_pass_application(
 p_firm_name text,p_firm_type text,p_website text,p_contact_name text,p_details text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare applicant uuid:=private.visit_pass_user(); result private.venture_pass_applications;
 website_url text:=nullif(trim(p_website),'');
begin
 if not private.venture_pass_applications_open() then
  raise exception 'Venture Partner Pass applications are closed' using errcode='42501';
 end if;
 if length(coalesce(trim(p_firm_name),'')) not between 2 and 120
  or coalesce(p_firm_type,'') not in ('independent_vc','corporate_venture')
  or length(coalesce(trim(p_contact_name),'')) not between 2 and 120
  or length(coalesce(trim(p_details),'')) not between 3 and 1000 then
  raise exception 'Enter your firm, contact and application details' using errcode='22023';
 end if;
 if website_url is not null and (length(website_url)>500 or position(chr(92) in website_url)>0 or
  website_url !~* '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+([a-z]{2,63}|xn--[a-z0-9]{2,59})([/?#][^[:space:][:cntrl:]]*)?$') then
  raise exception 'Enter a valid HTTPS website' using errcode='22023';
 end if;
 insert into private.venture_pass_applications(user_id,firm_name,firm_type,website,contact_name,details)
 values(applicant,trim(p_firm_name),p_firm_type,website_url,trim(p_contact_name),trim(p_details))
 on conflict(user_id) do nothing returning * into result;
 if not found then select * into result from private.venture_pass_applications where user_id=applicant; end if;
 return private.venture_pass_payload(result);
end;
$$;

create function public.staff_list_venture_pass_applications() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.venture_pass_reviewer();
 return coalesce((select jsonb_agg(private.venture_pass_payload(p) order by p.created_at desc,p.id)
  from private.venture_pass_applications p),'[]'::jsonb);
end;
$$;

create function public.staff_review_venture_pass_application(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reviewer uuid:=private.venture_pass_reviewer(); result private.venture_pass_applications; decision_at timestamptz;
begin
 if p_action='approve' then
  if not private.venture_pass_applications_open() then
   raise exception 'Venture Partner Pass approvals are closed' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('venture-partner-pass-capacity',0));
 elsif p_action is distinct from 'decline' then
  raise exception 'Choose approve or decline' using errcode='22023';
 end if;
 select * into result from private.venture_pass_applications where id=p_id for update;
 if not found or not private.onboarding_update_account_active(result.user_id) then
  raise exception 'Application not found' using errcode='P0002';
 end if;
 if result.user_id=reviewer then
  raise exception 'A different administrator must review your application' using errcode='42501';
 end if;
 if result.status<>'pending' then
  raise exception 'Only pending applications can be reviewed' using errcode='22023';
 end if;
 decision_at:=date_trunc('second',clock_timestamp());
 if p_action='approve' and (select count(*) from private.venture_pass_applications
  where (status='approved' and (payment_expires_at>decision_at or payment_claimed_at is not null))
     or (status='confirmed' and ends_at>decision_at))>=4 then
  raise exception 'All four Venture Partner Pass places are held or confirmed' using errcode='22023';
 end if;
 update private.venture_pass_applications set
  status=case when p_action='approve' then 'approved' else 'declined' end,
  reviewed_by=reviewer,reviewed_at=decision_at,
  payment_expires_at=case when p_action='approve' then decision_at+interval '1 hour' end
 where id=p_id returning * into result;
 return private.venture_pass_payload(result);
end;
$$;

create function public.venture_pass_payment(p_action text,p_user uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 result private.venture_pass_applications;
 application_id uuid:=(p_input->>'id')::uuid;
 link_id text:=p_input->>'linkId';
 link_url text:=p_input->>'paymentUrl';
 payment_ref text:=p_input->>'paymentId';
 payment_time timestamptz;
 claimed boolean:=false;
 operation_time timestamptz;
begin
 if (p_user is null and application_id is null) or (p_user is null and p_action='claim') then
  raise exception 'A payment application is required' using errcode='22023';
 end if;
 if p_user is not null and not private.onboarding_update_account_active(p_user) then
  raise exception 'An active email-confirmed account is required' using errcode='42501';
 end if;
 -- A claim and a replacement approval must agree on whether an elapsed slot is held.
 if p_action='claim' then
  perform pg_advisory_xact_lock(hashtextextended('venture-partner-pass-capacity',0));
 end if;
 select * into result from private.venture_pass_applications
 where (p_user is null or user_id=p_user) and (application_id is null or id=application_id) for update;
 if not found then
  if p_action='lookup' then return null; end if;
  raise exception 'Application not found' using errcode='P0002';
 end if;
 operation_time:=clock_timestamp();
 case p_action
 when 'lookup' then null;
 when 'claim' then
  if result.status<>'approved' or result.payment_expires_at<=operation_time
   or p_input->'acceptedTerms' is distinct from 'true'::jsonb then
   raise exception 'An open payment window and accepted terms are required' using errcode='22023';
  end if;
  if result.payment_claimed_at is null then
   update private.venture_pass_applications set payment_claimed_at=operation_time where id=result.id returning * into result;
   claimed:=true;
  end if;
 when 'attach' then
  if result.status not in ('approved','confirmed') or application_id is null or result.payment_claimed_at is null
   or link_id is null or link_url is null or (result.payment_link_id is not null
   and (result.payment_link_id is distinct from link_id or result.payment_url is distinct from link_url)) then
   raise exception 'The provider link does not match this payment claim' using errcode='22023';
  end if;
  if result.payment_link_id is null then
   update private.venture_pass_applications set payment_link_id=link_id,payment_url=link_url
   where id=result.id returning * into result;
  end if;
 when 'confirm' then
  if application_id is null or result.status not in ('approved','confirmed') or link_id is null
   or link_id is distinct from result.payment_link_id or payment_ref is null
   or p_input->'amount' is distinct from '50000000'::jsonb or p_input->>'currency' is distinct from 'INR' then
   raise exception 'Verified payment facts do not match this application' using errcode='22023';
  end if;
  if result.status='confirmed' then
   if result.payment_id is distinct from payment_ref then
    raise exception 'Payment does not match the confirmed pass' using errcode='22023';
   end if;
  else
   payment_time:=(p_input->>'paidAt')::timestamptz;
   if payment_time is null or not isfinite(payment_time) or payment_time<result.reviewed_at
    or payment_time>=result.payment_expires_at or payment_time>operation_time then
    raise exception 'Verified payment time is outside the approved window' using errcode='22023';
   end if;
   update private.venture_pass_applications set status='confirmed',payment_id=payment_ref,paid_at=payment_time,
    confirmed_at=operation_time,ends_at=((payment_time at time zone 'Asia/Kolkata')+interval '12 months') at time zone 'Asia/Kolkata'
   where id=result.id returning * into result;
  end if;
 when 'release_unattempted' then
  if p_user is null or application_id is null or result.status<>'approved'
   or result.payment_expires_at>operation_time or result.payment_link_id is not null
   or result.payment_claimed_at is null or result.payment_claimed_at is distinct from (p_input->>'claimedAt')::timestamptz then
   raise exception 'The unattempted payment claim does not match' using errcode='22023';
  end if;
  update private.venture_pass_applications set status='expired' where id=result.id returning * into result;
 when 'expire' then
  if application_id is null or result.status not in ('approved','expired')
   or result.payment_expires_at>operation_time or link_id is null or link_id is distinct from result.payment_link_id then
   raise exception 'The provider link is not eligible for expiry' using errcode='22023';
  end if;
  if result.status='approved' then
   update private.venture_pass_applications set status='expired' where id=result.id returning * into result;
  end if;
 else raise exception 'Unknown payment action' using errcode='22023';
 end case;
 return private.venture_pass_payload(result)||jsonb_build_object('claimed',claimed,
  'payment_link_id',result.payment_link_id,'payment_url',result.payment_url);
end;
$$;

revoke all on function private.venture_pass_applications_open(),private.venture_pass_reviewer(),
 private.venture_pass_payload(private.venture_pass_applications),
 public.get_my_venture_pass_application(),public.submit_venture_pass_application(text,text,text,text,text),
 public.staff_list_venture_pass_applications(),public.staff_review_venture_pass_application(uuid,text),
 public.venture_pass_payment(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_my_venture_pass_application(),
 public.submit_venture_pass_application(text,text,text,text,text),public.staff_list_venture_pass_applications(),
 public.staff_review_venture_pass_application(uuid,text) to authenticated;
grant execute on function public.venture_pass_payment(text,uuid,jsonb) to service_role;
