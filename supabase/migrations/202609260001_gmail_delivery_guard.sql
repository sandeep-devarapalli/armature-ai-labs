alter table public.reminder_deliveries
  add column claim_token uuid,
  add column gmail_delivery_state text check (gmail_delivery_state in ('review_required', 'sent'));

create or replace function public.claim_due_reminders(
  p_limit integer default 50
)
returns setof public.reminder_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select reminder.id
    from public.reminder_deliveries reminder
    join public.bookings booking on booking.id = reminder.booking_id
    where reminder.status in ('pending', 'failed')
      and reminder.gmail_delivery_state is null
      and reminder.scheduled_for <= now()
      and booking.status = 'confirmed'
      and booking.starts_at > now()
    order by reminder.scheduled_for
    limit least(greatest(p_limit, 1), 200)
    for update of reminder skip locked
  )
  update public.reminder_deliveries reminder
  set
    status = 'processing',
    claim_token = extensions.gen_random_uuid(),
    attempt_count = reminder.attempt_count + 1,
    last_error = null
  from claimed
  where reminder.id = claimed.id
  returning reminder.*;
end;
$$;

create or replace function public.begin_gmail_reminder(p_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reminder_deliveries
  set gmail_delivery_state = 'review_required'
  where id = p_id and status = 'processing'
    and claim_token = p_claim_token and gmail_delivery_state is null;
  return found;
end;
$$;

create or replace function public.complete_reminder(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reminder_deliveries
  set status = 'sent', delivered_at = now(), last_error = null,
    gmail_delivery_state = case when gmail_delivery_state is not null then 'sent' end
  where id = p_id;
$$;

revoke all on function public.begin_gmail_reminder(uuid, uuid) from public;
grant execute on function public.begin_gmail_reminder(uuid, uuid) to service_role;
