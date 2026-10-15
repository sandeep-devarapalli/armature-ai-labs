-- Match the hosted Storage 50 MB decimal ceiling without raising project-wide limits.
begin;
create or replace function public.market_prepare_attachment(conversation_id uuid,filename text,content_type text,byte_size bigint) returns jsonb language plpgsql security definer set search_path='' as $$ declare c private.market_conversations:=private.market_conversation_access(conversation_id); aid uuid:=gen_random_uuid(); path text; ext text; begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,6010));
 perform 1 from private.market_conversations where id=c.id for update; select * into c from private.market_conversations where id=c.id;
 if c.status<>'active' then raise exception 'Accepted conversation required'; end if;
 if (select count(*) from private.market_attachments where uploader_id=auth.uid() and created_at>now()-interval '1 day')>=100 then raise exception 'Daily file limit reached'; end if;
 ext:=lower(substring(filename from '\.([^.]+)$'));
 if filename is null or filename ~ '[[:cntrl:]]' or length(filename) not between 1 and 200 or filename ~ '[/\\]' or ext is null or ext not in('png','jpg','jpeg','webp','pdf','txt','csv','docx','xlsx','pptx','step','stp','stl','iges','igs','dxf','dwg','fcstd','kicad_pcb','kicad_sch','zip') or byte_size is null or byte_size not between 1 and 50000000 or content_type is null or content_type not in ('image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv','application/zip','application/octet-stream','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation') then raise exception 'Unsupported file or exceeds 50 MB'; end if;
 path:=c.id::text||'/'||aid::text;
 insert into private.market_attachments(id,conversation_id,uploader_id,filename,content_type,byte_size,object_path) values(aid,c.id,auth.uid(),filename,content_type,byte_size,path);
 return jsonb_build_object('id',aid,'object_path',path,'status','quarantined'); end $$;

update storage.buckets set file_size_limit=50000000 where id='market-files';
commit;
