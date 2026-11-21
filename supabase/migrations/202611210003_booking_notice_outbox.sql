create table private.booking_notice_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.booking_notice_settings default values;

create table private.booking_notice_outbox (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  aggregate_id uuid not null,
  kind text not null,
  stage text not null,
  dedupe_key text not null unique,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','claimed','sent','rejected','ambiguous')),
  created_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  settled_at timestamptz,
  provider_id text
);
alter table private.booking_notice_settings enable row level security;
alter table private.booking_notice_outbox enable row level security;
revoke all on private.booking_notice_settings, private.booking_notice_outbox from public,anon,authenticated,service_role;
create index booking_notice_pending on private.booking_notice_outbox(sequence) where status='queued';
create index booking_notice_aggregate on private.booking_notice_outbox(aggregate_id,sequence) where status in ('queued','claimed','ambiguous');

create function private.queue_booking_notice(p_recipient uuid,p_aggregate uuid,p_kind text,p_stage text,p_key text,p_payload jsonb)
returns void language sql set search_path='' as $$
  insert into private.booking_notice_outbox(recipient_id,aggregate_id,kind,stage,dedupe_key,payload)
    values(p_recipient,p_aggregate,p_kind,p_stage,p_aggregate::text||':'||p_stage||':'||p_key,
      jsonb_build_object('kind',p_kind,'stage',p_stage,'reference',p_aggregate::text)||p_payload)
  on conflict(dedupe_key) do nothing;
$$;

create function private.queue_booking_milestone()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  notice_stage text;
  notice_kind text;
  body jsonb := '{}'::jsonb;
begin
  if (select enabled from private.booking_notice_settings where singleton) is not true then return new; end if;
  if tg_table_name='guest_passes' then
    if tg_op='UPDATE' and new.status=old.status then return new; end if;
    notice_stage:=case new.status when 'pending' then 'received' when 'approved' then 'confirmed'
      when 'alternate' then 'alternate' when 'declined' then 'declined' end;
    if notice_stage is not null then
      perform private.queue_booking_notice(new.user_id,new.id,'guest',notice_stage,
        coalesce(new.reviewed_at,new.created_at)::text||':'||new.visit_date,
        jsonb_build_object('reference',new.reference,'guestDate',coalesce(new.offered_date,new.visit_date)));
    end if;
  elsif tg_table_name='live_desk_quotes' then
    if new.payment_id is not null and new.booking_ids is distinct from old.booking_ids
      and coalesce(cardinality(new.booking_ids),0)>0 then
      select jsonb_build_object('resource','Chair '||new.chair,'sessions',jsonb_agg(
        jsonb_build_object('id',b.id,'startsAt',b.starts_at,'endsAt',b.ends_at) order by b.starts_at,b.id))
        into body from public.bookings b where b.id=any(new.booking_ids) and b.status='confirmed';
      if body->'sessions'<>'null'::jsonb then
        perform private.queue_booking_notice(new.member_id,new.id,new.unit,'confirmed','initial',body);
      end if;
    end if;
  else
    if new.parent_quote_id is not null then return new; end if;
    select c.kind, jsonb_build_object('resource',r.name) into strict notice_kind,body
      from private.rental_catalogue c cross join public.resources r where c.code=new.product and r.id=new.resource_id;
    if tg_op='INSERT' then notice_stage:='received';
    elsif new.booking_id is not null and old.booking_id is null
      and exists(select from public.bookings where id=new.booking_id and status='confirmed') then notice_stage:='confirmed';
    elsif new.approved_at is not null and old.approved_at is null then notice_stage:='payment_due';
    elsif new.deposit_verified_at is not null and old.deposit_verified_at is null then notice_stage:='deposit_verified';
    end if;
    if notice_stage is not null then
      perform private.queue_booking_notice(new.member_id,new.id,notice_kind,notice_stage,'initial',body);
    end if;
  end if;
  return new;
end;
$$;

create trigger guest_booking_notice after insert or update of status on private.guest_passes
  for each row execute function private.queue_booking_milestone();
create trigger paid_desk_booking_notice after update of booking_ids on private.live_desk_quotes
  for each row execute function private.queue_booking_milestone();
create trigger rental_booking_notice after insert or update of approved_at, deposit_verified_at, booking_id on private.rental_quotes
  for each row execute function private.queue_booking_milestone();

-- Confirmations establish the calendar series. Later changes only affect a session already in a confirmation.
create function private.queue_booking_schedule_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  q private.booking_notice_outbox;
  event_stage text := case when new.status='cancelled' then 'cancelled' else 'updated' end;
begin
  if (select enabled from private.booking_notice_settings where singleton) is not true then return new; end if;
  if not ((new.status='cancelled' and old.status<>'cancelled')
          or (new.status='confirmed' and (new.starts_at,new.ends_at) is distinct from (old.starts_at,old.ends_at))) then
    return new;
  end if;
  select * into q from private.booking_notice_outbox n
    where n.stage='confirmed' and n.recipient_id=new.member_id and n.aggregate_id=coalesce(
      (select d.id from private.live_desk_quotes d where d.booking_ids @> array[new.id] limit 1),
      (select r.id from private.rental_quotes r where r.booking_id=new.id and r.parent_quote_id is null limit 1))
    order by n.sequence limit 1;
  if found then
    perform private.queue_booking_notice(new.member_id,q.aggregate_id,q.kind,event_stage,new.id::text||':'||txid_current(),
      q.payload||jsonb_build_object('stage',event_stage,'sessions',case when q.kind in ('day','week','month') then
        jsonb_build_array(jsonb_build_object('id',new.id,'startsAt',new.starts_at,'endsAt',new.ends_at)) else '[]'::jsonb end));
  end if;
  return new;
end;
$$;
create trigger booking_notice_schedule_change after update of status,starts_at,ends_at on public.bookings
  for each row execute function private.queue_booking_schedule_change();

create function public.claim_booking_notices(p_limit integer default 10)
returns jsonb language sql security definer set search_path='' as $$
  with next as (
    select q.id from private.booking_notice_outbox q
    where q.status='queued' and (select enabled from private.booking_notice_settings where singleton)
      and not exists (select from private.booking_notice_outbox prior where prior.aggregate_id=q.aggregate_id
        and prior.sequence<q.sequence and prior.status in ('queued','claimed','ambiguous'))
    order by q.sequence limit least(greatest(coalesce(p_limit,0),0),25) for update skip locked
  ), claimed as (
    update private.booking_notice_outbox q set status='claimed',claimed_at=clock_timestamp()
    from next where q.id=next.id returning q.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by sequence),'[]'::jsonb) from claimed;
$$;

create function public.settle_booking_notice(p_id uuid,p_status text,p_provider_id text default null)
returns boolean language sql security definer set search_path='' as $$
  with settled as (
    update private.booking_notice_outbox set status=p_status,provider_id=p_provider_id,settled_at=clock_timestamp()
    where id=p_id and status='claimed' and p_status in ('sent','rejected','ambiguous')
      and (p_status='sent')=(nullif(p_provider_id,'') is not null)
    returning id
  )
  select exists(select from settled);
$$;
revoke all on function private.queue_booking_notice(uuid,uuid,text,text,text,jsonb),private.queue_booking_milestone(),private.queue_booking_schedule_change() from public,anon,authenticated,service_role;
revoke all on function public.claim_booking_notices(integer),public.settle_booking_notice(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_booking_notices(integer),public.settle_booking_notice(uuid,text,text) to service_role;
