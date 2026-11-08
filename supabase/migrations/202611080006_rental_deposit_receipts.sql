-- Refundable security deposits get their own receipts, numbered apart from Refrens rent invoices.
-- They are liabilities, not income: never invoiced, never taxed, never sent to Refrens.
create sequence private.rental_deposit_receipt_seq;
revoke all on sequence private.rental_deposit_receipt_seq from public,anon,authenticated;
alter table private.rental_bank_transfers add column receipt_number text unique;
create function private.rental_deposit_receipt_number() returns trigger language plpgsql set search_path='' as $$
begin
 new.receipt_number:=case new.direction when 'received' then 'ARM-DEP-' else 'ARM-DRF-' end
  ||to_char(new.created_at at time zone 'Asia/Kolkata','YYYYMM')||'-'||lpad(nextval('private.rental_deposit_receipt_seq')::text,6,'0');
 return new;
end $$;
create trigger rental_deposit_receipt_number before insert on private.rental_bank_transfers
 for each row execute function private.rental_deposit_receipt_number();
update private.rental_bank_transfers set receipt_number=case direction when 'received' then 'ARM-DEP-' else 'ARM-DRF-' end
 ||to_char(created_at at time zone 'Asia/Kolkata','YYYYMM')||'-'||lpad(nextval('private.rental_deposit_receipt_seq')::text,6,'0')
 where receipt_number is null;
alter table private.rental_bank_transfers alter column receipt_number set not null;
create function private.rental_bank_transfer_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='42501',message='Deposit receipts are immutable'; end $$;
create trigger rental_bank_transfer_immutable before update or delete on private.rental_bank_transfers
 for each row execute function private.rental_bank_transfer_immutable();

create or replace function private.rental_bank_state(q private.rental_quotes) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('deposit_status',case when q.deposit_paise=0 then 'not_required'
 when q.bank_deposit_refunded_paise=q.deposit_paise then 'refunded'
 when q.bank_deposit_refunded_paise>0 then 'partially_refunded'
 when q.deposit_verified_at is not null then 'verified'
 when q.deposit_reference is not null then 'submitted' else 'pending' end,
 'payment_window_at',case when q.approved_at is not null then greatest(q.approved_at,q.deposit_verified_at) end,
 'refund_account',(select jsonb_build_object('version',a.version,'bankName',a.bank_name,
 'last4',right(a.account_number,4),'verifiedAt',a.verified_at,'ownershipConfirmed',true)
 from private.rental_refund_accounts a where a.quote_id=q.id order by a.version desc limit 1),
 'deposit_receipts',coalesce((select jsonb_agg(jsonb_build_object('receiptNumber',t.receipt_number,'direction',t.direction,
 'amountPaise',t.amount_paise,'reference',t.reference,'recordedAt',t.created_at,
 'refundAccountLast4',case when t.direction='refunded' then right(a.account_number,4) end) order by t.created_at)
 from private.rental_bank_transfers t left join private.rental_refund_accounts a on a.quote_id=t.quote_id and a.version=t.refund_account_version
 where t.quote_id=q.id),'[]'::jsonb));
$$;
revoke all on function private.rental_bank_state(private.rental_quotes) from public,anon,authenticated;
