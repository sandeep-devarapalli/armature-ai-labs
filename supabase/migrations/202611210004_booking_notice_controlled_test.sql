-- The release test can claim notices for one internal member while customer delivery is disabled.
alter table private.booking_notice_settings
  add column test_recipient_id uuid references auth.users(id) on delete set null;

create or replace function public.claim_booking_notices(p_limit integer default 10)
returns jsonb language sql security definer set search_path='' as $$
  with next as (
    select q.id from private.booking_notice_outbox q
    where q.status='queued' and exists (
      select from private.booking_notice_settings settings where settings.singleton
        and (settings.enabled or settings.test_recipient_id=q.recipient_id))
      and not exists (select from private.booking_notice_outbox prior where prior.aggregate_id=q.aggregate_id
        and prior.sequence<q.sequence and prior.status in ('queued','claimed','ambiguous'))
    order by q.sequence limit least(greatest(coalesce(p_limit,0),0),25) for update skip locked
  ), claimed as (
    update private.booking_notice_outbox q set status='claimed',claimed_at=clock_timestamp()
    from next where q.id=next.id returning q.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by sequence),'[]'::jsonb) from claimed;
$$;
