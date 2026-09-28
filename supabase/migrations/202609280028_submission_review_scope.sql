-- Submission controls both displayed review status and Staff access to drafts.
create or replace function public.can_review_basic_application(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_staff(array['admin','super_admin']::public.staff_role[]) or
 (private.is_staff(array['membership_reviewer']::public.staff_role[]) and exists
 (select 1 from public.basic_onboarding_applications where user_id=p_user_id and status='pending' and submitted_revision=revision and submitted_at is not null));
$$;

create or replace function private.basic_member_summary(p_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',u.id,'name',coalesce(a.full_name,nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1)),
 'email',u.email,'registered_at',u.created_at,'application_status',a.status,
 'status',case when a.user_id is null or (a.status='pending' and (not(d.photo and d.govid) or a.submitted_revision is distinct from a.revision or a.submitted_at is null)) then 'incomplete' else a.status end,
 'submitted_revision',a.submitted_revision,'submitted_at',a.submitted_at,
 'role',private.membership_role(u.id),'revision',a.revision,'reviewed_at',a.reviewed_at,
 'photo_available',d.photo,'id_available',d.govid,'complete',a.user_id is not null and d.photo and d.govid,
 'owner_approval_available',exists(select 1 from private.owner_membership_exception e where e.user_id=u.id and consumed_at is null))
 from auth.users u left join public.basic_onboarding_applications a on a.user_id=u.id
 cross join lateral(select coalesce(bool_or(kind='photo'),false) photo,coalesce(bool_or(kind='government_id'),false) govid
 from public.onboarding_documents d where d.user_id=u.id and uploaded_at is not null and deleted_at is null and expires_at>now()
 and exists(select 1 from storage.objects o where o.bucket_id='onboarding-documents' and o.name=d.object_path)) d
 where u.id=p_user_id and u.deleted_at is null;
$$;

create or replace function public.list_basic_members(p_search text default '',p_status text default null,p_role text default null,p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean := private.is_staff(array['admin','super_admin']::public.staff_role[]); v_result jsonb;
begin
 if not v_admin and not private.is_staff(array['membership_reviewer']::public.staff_role[]) then raise exception 'Membership reviewer required' using errcode='42501'; end if;
 if p_page is null or p_page<1 or p_page_size is null or p_page_size not between 1 and 100 or length(coalesce(p_search,''))>120 then raise exception 'Invalid pagination or search' using errcode='22023'; end if;
 with candidates as materialized (
 select private.basic_member_summary(u.id) item from auth.users u
 where u.deleted_at is null and (v_admin or public.can_review_basic_application(u.id))
 ), searched as materialized (
 select item from candidates where (coalesce(p_search,'')='' or strpos(lower(item->>'name'),lower(p_search))>0 or strpos(lower(item->>'email'),lower(p_search))>0)
 and (p_role is null or item->>'role'=p_role)
 ), filtered as materialized (select item from searched where p_status is null or item->>'status'=p_status),
 page as (select item from filtered order by item->>'registered_at' desc,item->>'user_id' limit p_page_size offset (p_page-1)::bigint*p_page_size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item) from page),'[]'::jsonb),'total',(select count(*) from filtered),
 'counts',coalesce((select jsonb_object_agg(status,n) from (select item->>'status' status,count(*) n from searched group by item->>'status') c),'{}'::jsonb)) into v_result;
 return v_result;
end;
$$;
