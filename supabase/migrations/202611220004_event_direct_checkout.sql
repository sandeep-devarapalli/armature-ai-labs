alter table private.event_quotes
  add column direct_checkout boolean not null default false,
  add column policy_accepted_at timestamptz,
  add constraint event_direct_checkout_consent
    check (not direct_checkout or order_claimed_at is null or policy_accepted_at is not null);

update private.event_quotes set direct_checkout=true
where approved_at is null and order_claimed_at is null and order_id is null and payment_id is null
  and document_id is null and evidence_path is null and booking_id is null
  and declined_at is null and cancelled_at is null;
alter table private.event_quotes alter column direct_checkout set default true;

create or replace function private.event_status(q private.event_quotes) returns text
language sql stable security definer set search_path='' as $$
 select case when q.declined_at is not null then 'declined'
  when q.cancelled_at is not null then 'cancelled'
  when q.refunded_amount=q.amount_paise and q.payment_id is not null then 'refunded'
  when q.review_reason is not null then 'needs_review'
  when q.booking_id is not null then case when q.ends_at<=clock_timestamp() then 'completed' else 'confirmed' end
  when q.order_id is not null then 'awaiting_payment'
  when q.approved_at is not null then 'approved'
  when q.prepared_at is not null and not q.direct_checkout then 'awaiting_signatures'
  else 'awaiting_staff' end;
$$;

alter function public.event_checkout(text,uuid,jsonb) set schema private;
alter function private.event_checkout(text,uuid,jsonb) rename to event_checkout_ledger;
revoke all on function private.event_checkout_ledger(text,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.event_checkout(p_action text,p_member uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  cfg private.event_checkout_settings;
  q private.event_quotes;
  reviewer uuid;
  details jsonb;
begin
  if p_action in ('approve_setup','claim_order','prepare','approve_manual') then
    select * into strict cfg from private.event_checkout_settings where singleton for share;
    select * into q from private.event_quotes where id=(p_input->>'quoteId')::uuid for update;
    if not found or p_member is null or q.member_id<>p_member then
      raise exception using errcode='42501',message='Event request unavailable';
    end if;

    if p_action='approve_setup' then
      reviewer:=private.rental_staff(q.member_id,p_input);
      if not cfg.enabled or not cfg.release_ready or cfg.event_resource is distinct from q.resource_id
        or not private.has_verified_membership(p_member)
        or exists(select 1 from public.booking_policy_settings where mock_grants_enabled) then
        raise exception using errcode='42501',message='Event checkout unavailable';
      end if;
      if not q.direct_checkout or q.approved_at is not null or q.order_claimed_at is not null
        or q.cancelled_at is not null or q.declined_at is not null or q.starts_at<=clock_timestamp()
        or q.policy_version<>cfg.policy_version then
        raise exception using errcode='22023',message='Event request is no longer open for approval';
      end if;
      details:=p_input->'particulars';
      if jsonb_typeof(details) is distinct from 'object'
        or details->>'availabilityConfirmed' is distinct from 'true'
        or details->>'eventDetailsReviewed' is distinct from 'true'
        or details->>'termsVersion' is distinct from cfg.policy_version
        or length(btrim(coalesce(details->>'setupNotes',''))) not between 10 and 1000 then
        raise exception using errcode='22023',message='Slot, event details and setup review required';
      end if;
      if not private.event_slot_available(q.resource_id,q.starts_at,q.ends_at,q.id) then
        raise exception using errcode='23P01',message='Event slot is no longer available';
      end if;
      update private.event_quotes
        set particulars=details,prepared_by=reviewer,prepared_at=clock_timestamp(),reviewer_id=reviewer,
          approved_at=clock_timestamp(),payment_window_at=clock_timestamp()
        where id=q.id returning * into q;
      return to_jsonb(q)||jsonb_build_object('status',private.event_status(q),'bookingId',q.booking_id);
    end if;

    if q.direct_checkout and p_action in ('prepare','approve_manual') then
      raise exception using errcode='22023',message='Use event setup approval';
    end if;
    if q.direct_checkout and p_action='claim_order' then
      if q.approved_at is null or p_input->>'acceptedPolicies' is distinct from 'true'
        or p_input->>'policyVersion' is distinct from cfg.policy_version or q.policy_version<>cfg.policy_version then
        raise exception using errcode='22023',message='Staff approval and current website policies required';
      end if;
      update private.event_quotes set policy_accepted_at=coalesce(policy_accepted_at,clock_timestamp()) where id=q.id;
    end if;
  end if;
  return private.event_checkout_ledger(p_action,p_member,p_input);
end;
$$;
revoke all on function public.event_checkout(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.event_checkout(text,uuid,jsonb) to service_role;
