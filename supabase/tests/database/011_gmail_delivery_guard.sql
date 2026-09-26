begin;
select plan(12);

insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('27000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'reminder-guard@example.test', now());
insert into public.bookings (id, resource_id, member_id, starts_at, ends_at, status)
select '27000000-0000-4000-8000-000000000002', id,
  '27000000-0000-4000-8000-000000000001', now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed'
from public.resources where slug = 'builder-pod-01';
delete from public.reminder_deliveries where booking_id = '27000000-0000-4000-8000-000000000002';
insert into public.reminder_deliveries (id, booking_id, reminder_kind, scheduled_for)
values ('27000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000002', 'one_hour', now() - interval '1 minute');

select function_privs_are('public', 'begin_gmail_reminder', array['uuid', 'uuid'], 'anon', array[]::text[], 'anonymous users cannot acquire the send guard');
select function_privs_are('public', 'begin_gmail_reminder', array['uuid', 'uuid'], 'authenticated', array[]::text[], 'members cannot acquire the send guard');
select function_privs_are('public', 'begin_gmail_reminder', array['uuid', 'uuid'], 'service_role', array['EXECUTE'], 'service worker can acquire the send guard');
create temporary table first_claim as select * from public.claim_due_reminders(50);
select is((select count(*)::integer from first_claim where id = '27000000-0000-4000-8000-000000000003'), 1, 'due reminder is claimed');
select is(public.begin_gmail_reminder('27000000-0000-4000-8000-000000000003', extensions.gen_random_uuid()), false, 'wrong worker token cannot start delivery');
-- Simulate lease recovery followed by a new worker claim.
select public.fail_reminder('27000000-0000-4000-8000-000000000003', 'pre-send failure');
create temporary table second_claim as select * from public.claim_due_reminders(50);
select is((select public.begin_gmail_reminder(id, claim_token) from first_claim where id = '27000000-0000-4000-8000-000000000003'), false, 'expired worker token cannot send after a new claim');
select is((select public.begin_gmail_reminder(id, claim_token) from second_claim where id = '27000000-0000-4000-8000-000000000003'), true, 'current worker durably records delivery boundary');
select is((select public.begin_gmail_reminder(id, claim_token) from second_claim where id = '27000000-0000-4000-8000-000000000003'), false, 'same worker cannot send twice');
select public.fail_reminder('27000000-0000-4000-8000-000000000003', 'Gmail response lost');
select is((select gmail_delivery_state from public.reminder_deliveries where id = '27000000-0000-4000-8000-000000000003'), 'review_required', 'ambiguous failure remains explicitly review-required');
select is((select count(*)::integer from public.claim_due_reminders(50) where id = '27000000-0000-4000-8000-000000000003'), 0, 'failed Gmail attempt is never automatically retried');
-- Maintenance also puts expired processing rows into failed; this must not re-enable delivery.
update public.reminder_deliveries set status = 'processing' where id = '27000000-0000-4000-8000-000000000003';
alter table public.reminder_deliveries disable trigger user;
update public.reminder_deliveries set updated_at = now() - interval '20 minutes' where id = '27000000-0000-4000-8000-000000000003';
alter table public.reminder_deliveries enable trigger user;
select public.run_attendance_maintenance();
select is((select count(*)::integer from public.claim_due_reminders(50) where id = '27000000-0000-4000-8000-000000000003'), 0, 'crash recovery does not resend a possibly accepted message');
select public.complete_reminder('27000000-0000-4000-8000-000000000003');
select is((select gmail_delivery_state from public.reminder_deliveries where id = '27000000-0000-4000-8000-000000000003'), 'sent', 'confirmed completion clears the review state but preserves the send fence');
select * from finish();
rollback;
