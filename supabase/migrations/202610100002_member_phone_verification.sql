-- Intents are private, short-lived, and never store OTPs. Supabase Auth owns codes.
create table private.member_phone_intents (
 user_id uuid primary key references auth.users(id) on delete cascade,
 id uuid not null unique default gen_random_uuid(), phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 channel text not null check(channel in ('whatsapp','sms')),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 resend_available_at timestamptz not null, hook_id text unique, hook_claimed_at timestamptz,
 delivered boolean not null default false, attempts integer not null default 0,
 completed_at timestamptz
);
alter table private.member_phone_intents enable row level security;
revoke all on private.member_phone_intents from public,anon,authenticated;
create table private.member_phone_hook_receipts(hook_id text primary key, received_at timestamptz not null default now());
create index member_phone_hook_receipt_age on private.member_phone_hook_receipts(received_at);
alter table private.member_phone_hook_receipts enable row level security;
revoke all on private.member_phone_hook_receipts from public,anon,authenticated;
create table private.member_phone_limits (
 key text primary key, window_start timestamptz not null, attempts integer not null
);
alter table private.member_phone_limits enable row level security;
revoke all on private.member_phone_limits from public,anon,authenticated;

create function public.member_phone_operation(p_action text,p_user_id uuid,p_phone text default null,p_channel text default null,p_intent uuid default null,p_hook_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i private.member_phone_intents; v private.member_phone_verifications; a auth.users; k text; n integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,100102));
 select * into a from auth.users where id=p_user_id;
 if a.id is null or a.email_confirmed_at is null or coalesce(a.is_anonymous,false) then
   raise exception 'Confirmed email required' using errcode='42501'; end if;
 select * into i from private.member_phone_intents where user_id=p_user_id for update;
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
revoke all on function public.member_phone_operation(text,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.member_phone_operation(text,uuid,text,text,uuid,text) to service_role;
