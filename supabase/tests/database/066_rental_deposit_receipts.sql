begin;
select no_plan();
-- These fixtures quote Cabin 101 at its pre-2026-11-09 terms; it is now listed as occupied.
update private.rental_catalogue set occupied=false,monthly_rent_paise=4000000 where code='cabin101';
insert into auth.users(id,aud,role,email) values
('96000000-0000-4000-8000-000000000001','authenticated','authenticated','receipt-renter@example.test'),
('96000000-0000-4000-8000-000000000002','authenticated','authenticated','receipt-staff@example.test');
insert into public.locations(id,slug,name) values('96000000-0000-4000-8000-000000000010','receipt-fixture','Synthetic receipt lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days)
values('96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000010','receipt-fixture-cabin','Synthetic cabin','workspace',1,525600,366);
insert into private.rental_quotes(id,member_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,policy_version,agreement_hash,deposit_method,test_fixture)
values('96000000-0000-4000-8000-000000000020','96000000-0000-4000-8000-000000000001','cabin101','individual','96000000-0000-4000-8000-000000000011',
 'month','2027-02-01','2027-02-28',5000,10000,'synthetic','synthetic-hash','bank_transfer',true);
insert into private.rental_refund_accounts(quote_id,version,account_name,bank_name,account_number,ifsc,submitted_by)
values('96000000-0000-4000-8000-000000000020',1,'Synthetic Renter','Synthetic Bank','000000004321','TEST0000001','96000000-0000-4000-8000-000000000001');
insert into private.rental_bank_transfers(quote_id,direction,reference,amount_paise,reviewer_id,evidence)
values('96000000-0000-4000-8000-000000000020','received','SIM-IN-0001',10000,'96000000-0000-4000-8000-000000000002','Synthetic simulated credit');
insert into private.rental_bank_transfers(quote_id,direction,reference,amount_paise,reviewer_id,evidence,refund_account_version)
values('96000000-0000-4000-8000-000000000020','refunded','SIM-OUT-0001',4000,'96000000-0000-4000-8000-000000000002','Synthetic simulated refund',1);
select matches((select receipt_number from private.rental_bank_transfers where reference='SIM-IN-0001'),'^ARM-DEP-[0-9]{6}-[0-9]{6}$','Received deposits get ARM-DEP receipts');
select matches((select receipt_number from private.rental_bank_transfers where reference='SIM-OUT-0001'),'^ARM-DRF-[0-9]{6}-[0-9]{6}$','Deposit refunds get ARM-DRF receipts');
select throws_ok($$update private.rental_bank_transfers set amount_paise=1 where reference='SIM-IN-0001'$$,'42501','Deposit receipts are immutable','Receipts cannot be edited');
select throws_ok($$delete from private.rental_bank_transfers where reference='SIM-IN-0001'$$,'42501','Deposit receipts are immutable','Receipts cannot be deleted');
select set_config('r.state',private.rental_bank_state(q)::text,true) from private.rental_quotes q where id='96000000-0000-4000-8000-000000000020';
select is(jsonb_array_length(current_setting('r.state')::jsonb->'deposit_receipts'),2,'Both receipts are listed');
select is(current_setting('r.state')::jsonb->'deposit_receipts'->1->>'refundAccountLast4','4321','Refund receipt shows only the last four digits');
select ok(current_setting('r.state')::text not like '%000000004321%' and current_setting('r.state')::text not like '%TEST0000001%','Receipts never carry full account number or IFSC');
select is((select count(*)::int from private.billing_operations where source_id='96000000-0000-4000-8000-000000000020'),0,'Deposits never create billing operations');
select * from finish();
rollback;
