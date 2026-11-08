-- Summary responses (list_own, staff_queue, status) carry only bank name and last four digits.
-- Holder name, IFSC and full number stay behind the staff get_refund_account action.
create or replace function private.rental_bank_state(q private.rental_quotes) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('deposit_status',case when q.deposit_paise=0 then 'not_required'
 when q.bank_deposit_refunded_paise=q.deposit_paise then 'refunded'
 when q.bank_deposit_refunded_paise>0 then 'partially_refunded'
 when q.deposit_verified_at is not null then 'verified'
 when q.deposit_reference is not null then 'submitted' else 'pending' end,
 'payment_window_at',case when q.approved_at is not null then greatest(q.approved_at,q.deposit_verified_at) end,
 'refund_account',(select jsonb_build_object('version',a.version,'bankName',a.bank_name,
 'last4',right(a.account_number,4),'verifiedAt',a.verified_at,'ownershipConfirmed',true)
 from private.rental_refund_accounts a where a.quote_id=q.id order by a.version desc limit 1));
$$;
revoke all on function private.rental_bank_state(private.rental_quotes) from public,anon,authenticated;

-- Bank references that differ only by punctuation or case are the same transfer.
alter table private.rental_bank_transfers add column reference_key text
 generated always as (regexp_replace(upper(reference),'[^A-Z0-9]','','g')) stored;
create unique index rental_bank_transfer_reference_key on private.rental_bank_transfers(direction,reference_key);
