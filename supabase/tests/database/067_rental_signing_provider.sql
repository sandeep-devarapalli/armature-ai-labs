begin;
select no_plan();
insert into auth.users(id,aud,role,email) values('97000000-0000-4000-8000-000000000001','authenticated','authenticated','provider-renter@example.test');
insert into public.locations(id,slug,name) values('97000000-0000-4000-8000-000000000010','provider-fixture','Synthetic provider lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days)
values('97000000-0000-4000-8000-000000000011','97000000-0000-4000-8000-000000000010','provider-fixture-cabin','Synthetic cabin','workspace',1,525600,366);
insert into private.rental_quotes(id,member_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,policy_version,agreement_hash,particulars)
values('97000000-0000-4000-8000-000000000020','97000000-0000-4000-8000-000000000001','cabin101','individual','97000000-0000-4000-8000-000000000011','month','2027-02-01','2027-02-28',5000,10000,'synthetic','h',null),
('97000000-0000-4000-8000-000000000021','97000000-0000-4000-8000-000000000001','cabin101','individual','97000000-0000-4000-8000-000000000011','month','2027-03-01','2027-03-31',5000,10000,'synthetic','h','{"signingProvider":"docusign"}');
select is((select signing_provider from private.rental_quotes where id='97000000-0000-4000-8000-000000000020'),'pandadoc','Existing quotes stay PandaDoc');
select is((select signing_provider from private.rental_quotes where id='97000000-0000-4000-8000-000000000021'),'docusign','DocuSign is read from the hashed particulars');
select throws_ok($$update private.rental_quotes set document_id='manualdoc123' where id='97000000-0000-4000-8000-000000000021'$$,'23514',null,'DocuSign needs an envelope id');
select lives_ok($$update private.rental_quotes set document_id='3F2A1B4C-5D6E-4F70-8A9B-0C1D2E3F4A5B' where id='97000000-0000-4000-8000-000000000021'$$,'DocuSign envelope id accepted');
select throws_ok($$update private.rental_quotes set particulars='{"signingProvider":"adobe"}' where id='97000000-0000-4000-8000-000000000020'$$,'23514',null,'Unknown providers rejected');
select * from finish();
rollback;
