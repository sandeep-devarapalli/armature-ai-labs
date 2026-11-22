create function public.list_booking_history(p_member uuid, p_quote uuid default null, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
  with history(id,kind,title,start_date,end_date,starts_at,ends_at,chair,fallback,status,amount,refunded,deposit,deposit_refunded,paid_at,deposit_paid_at) as (
    select q.id,q.unit,case q.unit when 'day' then 'Day Pass' when 'week' then 'Week Pass' else 'Month Pass' end,
      q.starts_on,q.ends_on,slots.starts_at,slots.ends_at,q.chair,slots.fallback,
      case when q.refunded_amount=q.amount_paise then 'refunded'
        when slots.confirmed then 'confirmed' when slots.completed then 'completed'
        when slots.no_show then 'no_show' when slots.cancelled then 'cancelled' else 'needs_review' end,
      q.amount_paise,q.refunded_amount,null::bigint,null::bigint,q.captured_at,null::timestamptz
    from private.live_desk_quotes q
    left join lateral (
      select min(b.starts_at) as starts_at,max(b.ends_at) as ends_at,
        bool_or(b.status='confirmed') as confirmed,bool_or(b.status='completed') as completed,
        bool_or(b.status='no_show') as no_show,bool_or(b.status='cancelled') as cancelled,
        case when count(*)=1 then max(r.fallback) end as fallback
      from public.bookings b left join private.desk_relocations r on r.booking_id=b.id
      where b.id=any(q.booking_ids) and b.member_id=p_member
    ) slots on true
    where q.member_id=p_member and q.payment_id is not null and (p_quote is null or q.id=p_quote)

    union all
    select q.id,c.kind,c.name,q.starts_on,q.ends_on,
      (q.starts_on+case when c.kind='cabin' then time '00:00' else time '09:00' end) at time zone 'Asia/Kolkata',
      (case when c.kind='cabin' then (q.ends_on+1)::timestamp else q.ends_on+time '17:00' end) at time zone 'Asia/Kolkata',
      null,null,
      case when q.payment_id is not null and q.refunded_amount=q.payment_amount_paise then 'refunded'
        when b.status in ('cancelled','completed','no_show') then b.status::text
        when q.review_reason is not null then 'needs_review' when b.id is not null then b.status::text
        when q.payment_id is not null then 'needs_review' else 'awaiting_payment' end,
      case when q.payment_id is not null then q.payment_amount_paise end,
      case when q.payment_id is not null then q.refunded_amount end,
      case when q.deposit_method='bank_transfer' and q.deposit_verified_at is not null then q.deposit_paise end,
      case when q.deposit_method='bank_transfer' and q.deposit_verified_at is not null then q.bank_deposit_refunded_paise end,
      q.captured_at,case when q.deposit_method='bank_transfer' then q.deposit_verified_at end
    from private.rental_quotes q
    join private.rental_catalogue c on c.code=q.product
    left join public.bookings b on b.id=q.booking_id and b.member_id=p_member
    where q.member_id=p_member and not q.test_fixture
      and (q.payment_id is not null or q.deposit_verified_at is not null or b.id is not null)
      and (p_quote is null or q.id=p_quote)

    union all
    select q.id,'event',r.name,
      (q.starts_at at time zone 'Asia/Kolkata')::date,(q.ends_at at time zone 'Asia/Kolkata')::date,
      q.starts_at,q.ends_at,null,null,
      case when q.payment_id is not null and q.refunded_amount=q.amount_paise then 'refunded'
        when q.cancelled_at is not null then 'cancelled' when b.id is not null then b.status::text
        when q.payment_id is not null then 'needs_review'
        when q.declined_at is not null then 'declined' when q.approved_at is not null then 'approved' else 'pending' end,
      case when q.payment_id is not null then q.amount_paise end,
      case when q.payment_id is not null then q.refunded_amount end,null,null,q.captured_at,null
    from private.event_quotes q join public.resources r on r.id=q.resource_id
    left join public.bookings b on b.id=q.booking_id and b.member_id=p_member
    where q.member_id=p_member and (p_quote is null or q.id=p_quote)

    union all
    select g.id,'guest','Guest Pass',g.visit_date,g.visit_date,
      (g.visit_date+time '09:00') at time zone 'Asia/Kolkata',
      (g.visit_date+time '22:00') at time zone 'Asia/Kolkata',null,null,
      case when g.status in ('pending','approved','alternate') and coalesce(g.offered_date,g.visit_date)<private.visit_pass_today()
        then 'expired' else g.status end,null,null,null,null,null,null
    from private.guest_passes g where g.user_id=p_member and (p_quote is null or g.id=p_quote)

    union all
    select q.id,'golden','Golden Pass',
      (q.starts_at at time zone 'Asia/Kolkata')::date,(q.ends_at at time zone 'Asia/Kolkata')::date,
      q.starts_at,q.ends_at,null,null,private.golden_pass_result(q)->>'status',
      q.amount_paise,q.refunded_amount,null,null,q.captured_at,null
    from private.golden_pass_payments q
    where q.member_id=p_member and q.payment_id is not null and (p_quote is null or q.id=p_quote)

    union all
    select b.id,'other',r.name,
      (b.starts_at at time zone 'Asia/Kolkata')::date,(b.ends_at at time zone 'Asia/Kolkata')::date,
      b.starts_at,b.ends_at,null,null,b.status::text,null,null,null,null,null,null
    from public.bookings b join public.resources r on r.id=b.resource_id
    where b.member_id=p_member and (p_quote is null or b.id=p_quote)
      and not exists(select 1 from private.live_desk_quotes q where q.member_id=p_member and b.id=any(q.booking_ids))
      and not exists(select 1 from private.rental_quotes q where q.member_id=p_member
        and (q.booking_id=b.id or b.id=any(q.workspace_booking_ids)))
      and not exists(select 1 from private.event_quotes q where q.member_id=p_member and q.booking_id=b.id)
      and not exists(select 1 from public.equipment_rental_orders o
        where o.booking_id=b.id or b.id=any(o.workspace_booking_ids))
      and not exists(select 1 from public.paid_access_entitlements e
        where e.source='local_mock' and e.resource_id=b.resource_id
          and e.starts_at<=b.starts_at and e.ends_at>=b.ends_at
          and (e.user_id=b.member_id or e.organization_id=b.organization_id))
  ), page as (
    select h.*,coalesce(h.start_date,(h.paid_at at time zone 'Asia/Kolkata')::date) as sort_date
    from history h
    order by sort_date desc nulls last,id desc
    limit 51 offset greatest(p_offset,0)
  ), visible as (
    select * from page order by sort_date desc nulls last,id desc limit 50
  )
  select jsonb_build_object(
    'bookings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'quoteId',id,'kind',kind,'title',title,'start',start_date,'end',end_date,
        'startsAt',starts_at,'endsAt',ends_at,'chair',chair,'fallback',fallback,'status',status,
        'amountPaise',amount,'refundedPaise',refunded,'depositPaise',deposit,'depositRefundedPaise',deposit_refunded,
        'paidAt',paid_at,'depositPaidAt',deposit_paid_at
      ) order by sort_date desc nulls last,id desc) from visible
    ),'[]'::jsonb),
    'nextOffset',case when (select count(*) from page)>50 and p_offset<2147483597 then p_offset+50 end
  );
$$;

revoke all on function public.list_booking_history(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_booking_history(uuid,uuid,integer) to service_role;
