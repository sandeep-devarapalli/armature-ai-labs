create function private.queue_golden_pass_welcome()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.queue_booking_notice(new.member_id,new.id,'golden','confirmed','initial',
    jsonb_build_object('startsAt',new.starts_at,'endsAt',new.ends_at,'amountPaise',new.amount_paise));
  return new;
end;
$$;

revoke all on function private.queue_golden_pass_welcome() from public,anon,authenticated,service_role;

create trigger golden_pass_welcome after update of starts_at on private.golden_pass_payments
for each row when (old.starts_at is null and new.starts_at is not null and new.ends_at is not null
  and new.refunded_amount < new.amount_paise)
execute function private.queue_golden_pass_welcome();
