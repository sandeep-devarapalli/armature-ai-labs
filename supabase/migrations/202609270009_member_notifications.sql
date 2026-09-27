-- Dedicated membership outbox. Enabling a pilot never releases historical held events.
create table public.member_notification_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 pilot_recipients text[] not null default '{}'
);
insert into public.member_notification_settings default values;
create table public.member_notifications (
 id uuid primary key default extensions.gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 recipient_email text not null,
 event_key text not null,
 kind text not null check(kind in ('registration_saved','ready','resubmission_ready','admin_ready','corrections_requested','approved','rejected','revoked','reinstated')),
 template_version integer not null default 1 check(template_version=1),
 expected_status text not null,
 application_revision integer not null,
 state text not null check(state in ('held','pending','leased','sending','accepted','failed','unknown','suppressed')),
 attempts integer not null default 0 check(attempts between 0 and 8),
 available_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 first_attempt_at timestamptz,
 provider_id text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(event_key,recipient_id,kind,template_version)
);
create index member_notifications_due on public.member_notifications(available_at,created_at)
 where state in ('pending','leased','sending');
alter table public.member_notification_settings enable row level security;
alter table public.member_notifications enable row level security;
revoke all on public.member_notification_settings,public.member_notifications from public,anon,authenticated,service_role;
grant select,update on public.member_notification_settings to service_role;
grant select on public.member_notifications to service_role;

create function private.member_notification_ready(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.basic_onboarding_applications a
 join auth.users u on u.id=a.user_id
 join public.onboarding_notice_acceptances n on n.user_id=a.user_id and n.revision=a.revision
 where a.user_id=p_user and a.status='pending' and n.notice_version='2026-09-26-release-1'
 and u.email_confirmed_at is not null and u.deleted_at is null and lower(u.email)=lower(a.email)
 and length(trim(a.full_name)) between 2 and 120 and a.phone ~ '^\+?[0-9 ()-]{7,25}$'
 and length(regexp_replace(a.phone,'[^0-9]','','g'))>=7
 and a.linkedin_url ~ '^https://(www\.)?linkedin\.com/in/[A-Za-z0-9_%_-]+/?$'
 and a.date_of_birth<=((now() at time zone 'Asia/Kolkata')::date-interval '16 years')::date
 and (select count(distinct d.kind) from public.onboarding_documents d
 join storage.objects o on o.bucket_id='onboarding-documents' and o.name=d.object_path
 where d.user_id=a.user_id and d.uploaded_at is not null and d.deleted_at is null and d.expires_at>now())=2);
$$;
create function private.enqueue_member_notification(p_user uuid,p_recipient uuid,p_event text,p_kind text,p_status text,p_revision integer) returns void
language sql security definer set search_path='' as $$
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state)
 select p_user,u.id,lower(u.email),p_event,p_kind,p_status,p_revision,
 case when s.enabled and lower(u.email)=any(s.pilot_recipients) then 'pending' else 'held' end
 from auth.users u cross join public.member_notification_settings s
 where u.id=p_recipient and u.email_confirmed_at is not null and u.deleted_at is null
 on conflict(event_key,recipient_id,kind,template_version) do nothing;
$$;
create function private.queue_member_readiness() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.basic_onboarding_applications; v_admin uuid;
begin
 select * into a from public.basic_onboarding_applications where user_id=new.user_id for update;
 if tg_table_name='onboarding_notice_acceptances' then
 if a.revision=1 and new.notice_version='2026-09-26-release-1' then
  perform private.enqueue_member_notification(a.user_id,a.user_id,'registration:'||a.user_id,'registration_saved','pending',a.revision);
 end if;
 end if;
 if private.member_notification_ready(a.user_id) then
  perform private.enqueue_member_notification(a.user_id,a.user_id,'ready:'||a.user_id||':'||a.revision,
   case when a.revision=1 then 'ready' else 'resubmission_ready' end,'pending',a.revision);
  for v_admin in select id from auth.users where lower(email)='hello@armatureailabs.com' and email_confirmed_at is not null
   and deleted_at is null and private.membership_role(id) in ('admin','super_admin') loop
   perform private.enqueue_member_notification(a.user_id,v_admin,'ready:'||a.user_id||':'||a.revision,'admin_ready','pending',a.revision);
  end loop;
 end if;
 return new;
end;
$$;
create trigger member_notice_notifications after insert on public.onboarding_notice_acceptances
 for each row execute function private.queue_member_readiness();
create trigger member_document_notifications after insert or update of uploaded_at on public.onboarding_documents
 for each row execute function private.queue_member_readiness();
create function private.queue_member_decision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.enqueue_member_notification(new.user_id,new.user_id,'review:'||new.id,new.decision,
 case when new.decision='reinstated' then 'approved' else new.decision end,
 new.application_revision+case when new.decision in ('revoked','reinstated') then 1 else 0 end);
 return new;
end;
$$;
create trigger member_decision_notifications after insert on public.onboarding_reviews
 for each row execute function private.queue_member_decision();

create function private.member_notification_eligible(n public.member_notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_notification_settings s
 join auth.users r on r.id=n.recipient_id join auth.users u on u.id=n.user_id
 join public.basic_onboarding_applications a on a.user_id=u.id
 where s.enabled and n.recipient_email=any(s.pilot_recipients)
 and r.email_confirmed_at is not null and r.deleted_at is null and lower(r.email)=n.recipient_email
 and u.deleted_at is null and u.email_confirmed_at is not null
 and a.status=n.expected_status and a.revision=n.application_revision
 and (n.kind not in ('ready','resubmission_ready','admin_ready') or private.member_notification_ready(n.user_id))
 and (n.kind<>'registration_saved' or (not private.member_notification_ready(n.user_id) and exists(select 1 from public.onboarding_notice_acceptances
 where user_id=n.user_id and revision=a.revision and notice_version='2026-09-26-release-1')))
 and (n.kind<>'admin_ready' or (lower(r.email)='hello@armatureailabs.com' and private.membership_role(r.id) in ('admin','super_admin'))));
$$;
create function public.claim_member_notifications(p_limit integer default 10)
returns table(id uuid,lease_token uuid,kind text,recipient_email text,template_version integer,first_attempt_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare n public.member_notifications;
begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Limit must be 1 to 10' using errcode='22023'; end if;
 if not exists(select 1 from public.member_notification_settings where enabled) then return; end if;
 for n in select q.* from public.member_notifications q
 where (q.state='pending' and q.available_at<=now()) or (q.state in ('leased','sending') and q.lease_until<=now())
 order by q.available_at,q.created_at,q.id limit p_limit for update skip locked loop
  if not private.member_notification_eligible(n) then
   update public.member_notifications q set state='suppressed',completed_at=now(),lease_token=null,lease_until=null where q.id=n.id;
  elsif n.attempts>=8 or n.first_attempt_at<=now()-interval '23 hours' then
   update public.member_notifications q set state=case when n.first_attempt_at is null then 'failed' else 'unknown' end,
    completed_at=now(),lease_token=null,lease_until=null where q.id=n.id;
  else
   update public.member_notifications q set state='leased',attempts=q.attempts+1,
    lease_token=extensions.gen_random_uuid(),lease_until=now()+interval '2 minutes' where q.id=n.id
   returning q.id,q.lease_token,q.kind,q.recipient_email,q.template_version,q.first_attempt_at
   into id,lease_token,kind,recipient_email,template_version,first_attempt_at;
   return next;
  end if;
 end loop;
end;
$$;
create function public.prepare_member_notification(p_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare n public.member_notifications;
begin
 select * into n from public.member_notifications where id=p_id for update;
 if not found or n.state<>'leased' or n.lease_token is distinct from p_lease_token or n.lease_until<=now() then return false; end if;
 if not private.member_notification_eligible(n) or n.first_attempt_at<=now()-interval '23 hours' then
  update public.member_notifications set state=case when n.first_attempt_at<=now()-interval '23 hours' then 'unknown' else 'suppressed' end,
   completed_at=now(),lease_token=null,lease_until=null where id=p_id;
  return false;
 end if;
 update public.member_notifications set state='sending',first_attempt_at=coalesce(first_attempt_at,now()) where id=p_id;
 return true;
end;
$$;
create function public.finish_member_notification(p_id uuid,p_lease_token uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare n public.member_notifications; v_state text;
begin
 if p_outcome is null or p_outcome not in ('accepted','retry','failed','unknown') or length(p_provider_id)>200
 or (p_outcome='accepted' and coalesce(length(trim(p_provider_id)),0)=0) then
  raise exception 'Invalid delivery outcome' using errcode='22023'; end if;
 select * into n from public.member_notifications where id=p_id for update;
 if not found or n.state<>'sending' or n.lease_token is distinct from p_lease_token or n.lease_until<=now() then return false; end if;
 v_state:=case when p_outcome='retry' and (n.attempts>=8 or n.first_attempt_at<=now()-interval '23 hours') then 'unknown'
 when p_outcome='retry' then 'pending' else p_outcome end;
 update public.member_notifications set state=v_state,provider_id=case when p_outcome='accepted' then p_provider_id else null end,
  available_at=now()+make_interval(secs=>least(3600,30*power(2,n.attempts)::integer)),
  completed_at=case when v_state<>'pending' then now() end,lease_token=null,lease_until=null where id=p_id;
 return true;
end;
$$;
revoke all on function private.member_notification_ready(uuid),private.enqueue_member_notification(uuid,uuid,text,text,text,integer),
 private.queue_member_readiness(),private.queue_member_decision(),private.member_notification_eligible(public.member_notifications)
 from public,anon,authenticated,service_role;
revoke all on function public.claim_member_notifications(integer),public.prepare_member_notification(uuid,uuid),
 public.finish_member_notification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_member_notifications(integer),public.prepare_member_notification(uuid,uuid),
 public.finish_member_notification(uuid,uuid,text,text) to service_role;
