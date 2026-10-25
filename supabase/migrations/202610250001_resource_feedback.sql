create table private.resource_feedback (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id),
 request_id uuid not null,
 document text not null check(document in ('robotic-actuators-white-paper','actuator-specifications')),
 version text not null default '2026-10-25' check(version='2026-10-25'),
 kind text not null check(kind in ('comment','correction')),
 reference text not null default '' check(length(reference)<=200),
 body text not null check(length(trim(body)) between 1 and 4000),
 source_url text check(length(source_url)<=2000 and source_url ~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'),
 display_name text not null check(length(trim(display_name)) between 1 and 100),
 consent_version text not null check(consent_version='2026-10-25-resource-feedback-v1'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 response text not null default '' check(length(response)<=4000),
 review_note text not null default '' check(length(review_note)<=2000),
 revision integer not null default 1,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(author_id,request_id)
);
create index resource_feedback_document on private.resource_feedback(document,status,created_at desc,id);
create index resource_feedback_author on private.resource_feedback(author_id,created_at desc,id);
create index resource_feedback_queue on private.resource_feedback(status,created_at,id);
create table private.resource_feedback_history (
 id bigint generated always as identity primary key,
 feedback_id uuid not null references private.resource_feedback(id),
 actor_id uuid not null references auth.users(id),
 event text not null,
 snapshot jsonb not null,
 at timestamptz not null default clock_timestamp()
);
alter table private.resource_feedback enable row level security;
alter table private.resource_feedback_history enable row level security;
revoke all on private.resource_feedback,private.resource_feedback_history from public,anon,authenticated;

create function private.resource_feedback_card(r private.resource_feedback,with_status boolean default false) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'document',r.document,'version',r.version,'kind',r.kind,
 'reference',r.reference,'body',r.body,'source_url',r.source_url,'display_name',r.display_name,
 'response',r.response,'created_at',r.created_at,'updated_at',r.updated_at,'revision',r.revision)
 || case when with_status then jsonb_build_object('status',r.status,'review_note',r.review_note) else '{}'::jsonb end;
$$;
create function private.resource_feedback_moderator() returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_basic_membership(auth.uid()) and private.is_staff(array['admin','super_admin']::public.staff_role[]);
$$;
create function private.resource_feedback_validate_document(p_document text) returns void
language plpgsql immutable set search_path='' as $$
begin
 if p_document is null or p_document not in ('robotic-actuators-white-paper','actuator-specifications') then
  raise exception 'Unknown resource' using errcode='22023';
 end if;
end $$;
create function private.resource_feedback_page(p_page integer) returns integer
language plpgsql immutable set search_path='' as $$
begin
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return (p_page-1)*20;
end $$;
revoke all on function private.resource_feedback_card(private.resource_feedback,boolean),private.resource_feedback_moderator(),private.resource_feedback_validate_document(text),private.resource_feedback_page(integer) from public,anon,authenticated;

create function public.resource_feedback_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('can_submit',private.has_basic_membership(auth.uid()),'can_moderate',private.resource_feedback_moderator());
$$;
create function public.list_resource_feedback(p_document text,p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare skip integer:=private.resource_feedback_page(p_page); result jsonb;
begin
 perform private.resource_feedback_validate_document(p_document);
 with eligible as materialized (
  select r.* from private.resource_feedback r where r.document=p_document and r.status='approved' and private.has_basic_membership(r.author_id)
 ), page as (select * from eligible order by created_at desc,id offset skip limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(private.resource_feedback_card(page::private.resource_feedback) order by created_at desc,id) from page),'[]'::jsonb),'total',(select count(*) from eligible)) into result;
 return result;
end $$;
create function public.list_my_resource_feedback(p_document text,p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare skip integer:=private.resource_feedback_page(p_page); result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform private.resource_feedback_validate_document(p_document);
 with eligible as materialized (select r.* from private.resource_feedback r where r.document=p_document and r.author_id=auth.uid()),
 page as (select * from eligible order by created_at desc,id offset skip limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(private.resource_feedback_card(page::private.resource_feedback,true) order by created_at desc,id) from page),'[]'::jsonb),'total',(select count(*) from eligible)) into result;
 return result;
end $$;
create function public.submit_resource_feedback(p_document text,p_kind text,p_reference text,p_body text,p_source_url text,p_display_name text,p_consent_version text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r private.resource_feedback; v_now timestamptz:=clock_timestamp();
 v_reference text:=trim(coalesce(p_reference,'')); v_body text:=trim(p_body);
 v_source text:=nullif(trim(p_source_url),''); v_name text:=trim(p_display_name);
begin
 if not private.has_basic_membership(u) then raise exception 'Active Basic membership required' using errcode='42501'; end if;
 perform private.resource_feedback_validate_document(p_document);
 if p_kind is null or p_kind not in ('comment','correction') or p_request_id is null
 or v_name is null or length(v_name) not between 1 and 100 or v_body is null or length(v_body) not between 1 and 4000
 or length(v_reference)>200 or (v_source is not null and (length(v_source)>2000 or v_source !~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'))
 or p_consent_version is distinct from '2026-10-25-resource-feedback-v1' then
  raise exception 'Invalid feedback or publication consent' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,20261025));
 select * into r from private.resource_feedback where author_id=u and request_id=p_request_id;
 if found then
  if r.document is distinct from p_document or r.kind is distinct from p_kind or r.reference is distinct from v_reference
  or r.body is distinct from v_body or r.source_url is distinct from v_source or r.display_name is distinct from v_name
  or r.consent_version is distinct from p_consent_version then raise exception 'Request key already used for different feedback' using errcode='P0409'; end if;
  return private.resource_feedback_card(r,true);
 end if;
 if (select count(*) from private.resource_feedback where author_id=u and created_at>v_now-interval '1 hour')>=5
 or (select count(*) from private.resource_feedback where author_id=u and created_at>v_now-interval '24 hours')>=20 then
  raise exception 'Feedback limit reached. Please try again later.' using errcode='P0429';
 end if;
 insert into private.resource_feedback(author_id,request_id,document,kind,reference,body,source_url,display_name,consent_version)
 values(u,p_request_id,p_document,p_kind,v_reference,v_body,v_source,v_name,p_consent_version) returning * into r;
 insert into private.resource_feedback_history(feedback_id,actor_id,event,snapshot) values(r.id,u,'submitted',to_jsonb(r));
 return private.resource_feedback_card(r,true);
end $$;
create function public.withdraw_resource_feedback(p_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r private.resource_feedback;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into r from private.resource_feedback where id=p_id and author_id=u for update;
 if not found then raise exception 'Feedback unavailable' using errcode='42501'; end if;
 if r.revision is distinct from p_expected_revision then raise exception 'Feedback changed. Reload and retry.' using errcode='P0409'; end if;
 if r.status='withdrawn' then return private.resource_feedback_card(r,true); end if;
 update private.resource_feedback set status='withdrawn',revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 insert into private.resource_feedback_history(feedback_id,actor_id,event,snapshot) values(r.id,u,'withdrawn',to_jsonb(r));
 return private.resource_feedback_card(r,true);
end $$;
create function public.list_resource_feedback_queue(p_status text default 'pending',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare skip integer:=private.resource_feedback_page(p_page); result jsonb;
begin
 if not private.resource_feedback_moderator() then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('all','pending','approved','rejected','withdrawn') then raise exception 'Invalid feedback status' using errcode='22023'; end if;
 with eligible as materialized (select r.* from private.resource_feedback r where p_status='all' or r.status=p_status),
 page as (select * from eligible order by created_at,id offset skip limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(private.resource_feedback_card(page::private.resource_feedback,true) order by created_at,id) from page),'[]'::jsonb),'total',(select count(*) from eligible)) into result;
 return result;
end $$;
create function public.review_resource_feedback(p_id uuid,p_expected_revision integer,p_status text,p_response text,p_review_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r private.resource_feedback;
begin
 if not private.resource_feedback_moderator() then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('approved','rejected','withdrawn') or length(coalesce(p_response,''))>4000 or length(coalesce(p_review_note,''))>2000
 or (p_status in ('rejected','withdrawn') and length(trim(coalesce(p_review_note,'')))=0) then raise exception 'Invalid review; rejection or withdrawal requires a note' using errcode='22023'; end if;
 select * into r from private.resource_feedback where id=p_id for update;
 if not found then raise exception 'Feedback unavailable' using errcode='42501'; end if;
 if r.revision is distinct from p_expected_revision or r.status='withdrawn' then raise exception 'Feedback changed. Reload and retry.' using errcode='P0409'; end if;
 if p_status='approved' and not private.has_basic_membership(r.author_id) then raise exception 'Author must retain Basic membership' using errcode='42501'; end if;
 update private.resource_feedback set status=p_status,response=trim(coalesce(p_response,'')),review_note=trim(coalesce(p_review_note,'')),revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 insert into private.resource_feedback_history(feedback_id,actor_id,event,snapshot) values(r.id,u,'reviewed',to_jsonb(r));
 return private.resource_feedback_card(r,true);
end $$;
revoke all on function public.resource_feedback_access(),public.list_resource_feedback(text,integer),public.list_my_resource_feedback(text,integer),public.submit_resource_feedback(text,text,text,text,text,text,text,uuid),public.withdraw_resource_feedback(uuid,integer),public.list_resource_feedback_queue(text,integer),public.review_resource_feedback(uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.resource_feedback_access(),public.list_resource_feedback(text,integer) to anon,authenticated;
grant execute on function public.list_my_resource_feedback(text,integer),public.submit_resource_feedback(text,text,text,text,text,text,text,uuid),public.withdraw_resource_feedback(uuid,integer),public.list_resource_feedback_queue(text,integer),public.review_resource_feedback(uuid,integer,text,text,text) to authenticated;
