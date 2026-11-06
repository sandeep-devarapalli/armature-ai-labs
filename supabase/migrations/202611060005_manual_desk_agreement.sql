create table private.manual_desk_agreements (
  quote_id uuid primary key,
  member_id uuid not null references auth.users(id),
  reviewer_id uuid not null references auth.users(id),
  document_id text not null unique,
  agreement_hash text not null,
  evidence_sha256 text not null unique,
  approved_at timestamptz not null default clock_timestamp()
);
revoke all on private.manual_desk_agreements from public, anon, authenticated;

create function public.manual_desk_agreement(
  p_member uuid, p_quote uuid, p_review jsonb default null
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  q jsonb;
  reviewed private.manual_desk_agreements;
  document_id text := p_review->>'documentId';
  reviewer uuid := (p_review->>'reviewerId')::uuid;
  payload jsonb := jsonb_build_object('quoteId',p_quote);
begin
  if p_review is null then
    return (select approved_at from private.manual_desk_agreements
      where quote_id=p_quote and member_id=p_member);
  end if;
  if reviewer is null or reviewer=p_member
    or not exists (select 1 from public.staff_roles where user_id=reviewer and role in ('admin','super_admin'))
    or coalesce(document_id,'') !~ '^[A-Za-z0-9_-]{8,80}$'
    or coalesce(p_review->>'evidenceSha256','') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='42501', message='Authorized independent reviewer and evidence required';
  end if;

  q := public.live_desk_checkout('status',p_member,payload);
  if q->>'chair' is distinct from 'S01' or q->>'unit' is distinct from 'day'
    or q->>'amount_paise' is distinct from '35000'
    or q->>'agreement_hash' is distinct from p_review->>'agreementHash'
    or q->>'order_claimed_at' is not null then
    raise exception using errcode='22023', message='Agreement does not match the owner pilot quote';
  end if;

  select * into reviewed from private.manual_desk_agreements where quote_id=p_quote;
  if found then
    if reviewed.document_id=document_id and reviewed.evidence_sha256=p_review->>'evidenceSha256' then
      return reviewed.approved_at;
    end if;
    raise exception using errcode='22023', message='Existing approval cannot be replaced';
  end if;

  payload := payload || jsonb_build_object('documentId',document_id,'revision','manual-pilot-v1');
  perform public.live_desk_checkout('seal',p_member,payload);
  insert into private.manual_desk_agreements
    (quote_id,member_id,reviewer_id,document_id,agreement_hash,evidence_sha256)
  values (p_quote,p_member,reviewer,document_id,q->>'agreement_hash',p_review->>'evidenceSha256')
  returning * into reviewed;
  return reviewed.approved_at;
exception when unique_violation then
  raise exception using errcode='22023', message='Agreement evidence has already been used';
end;
$$;
revoke all on function public.manual_desk_agreement(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.manual_desk_agreement(uuid,uuid,jsonb) to service_role;
