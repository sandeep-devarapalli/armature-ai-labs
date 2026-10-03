-- Optional editorial metadata follows the existing private submission/review path.
-- No listing, pin, or pending proposal is changed by this migration.
create or replace function private.validate_ecosystem_data(d jsonb) returns void language plpgsql set search_path='' as $$
declare k text; phone jsonb; item jsonb; maps_url text := coalesce(d->>'googleMapsUrl','');
begin
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>24000 or length(coalesce(d->>'name','')) not between 2 and 160
 or length(coalesce(d->>'summary','')) not between 10 and 2000 or coalesce(d->>'primaryType','') not in ('startup','research-ecosystem','supplier','vendor','other') then
 raise exception 'Invalid listing data' using errcode='22023'; end if;
 for k in select jsonb_object_keys(d) loop
 if k not in ('slug','name','entityType','sectors','summary','locality','coordinates','locationPrecision','confidence','locationConfidence','websiteUrl','sourceUrl','founders','provenance','verifiedAt','primaryType','alsoListedAs','needs','subcategory','publicPhones','publicEmail','accessNote','tips','engageHow','salesChannel','priceLevel','minOrder','pricingModel','turnaround','credit','city','guideCategories','googleMapsUrl') then
 raise exception 'Unsupported public field' using errcode='22023'; end if;
 if k not in ('sectors','coordinates','alsoListedAs','needs','publicPhones','credit','guideCategories') and (jsonb_typeof(d->k)<>'string' or length(d->>k)>2000) then raise exception 'Invalid public text' using errcode='22023'; end if;
 end loop;
 if (d ? 'entityType' and d->>'entityType' not in ('Startup','Company','Research & ecosystem'))
 or (d ? 'locationPrecision' and d->>'locationPrecision' not in ('Address-level','Locality-level','City-level','Metro presence'))
 or (d ? 'confidence' and d->>'confidence' not in ('High','Medium'))
 or (d ? 'locationConfidence' and d->>'locationConfidence' not in ('High','Medium'))
 or (d ? 'city' and d->>'city'<>'bangalore') then raise exception 'Invalid listing metadata' using errcode='22023'; end if;
 if coalesce(d->>'websiteUrl','')='' and coalesce(d->>'sourceUrl','')='' and coalesce(d->>'publicEmail','')='' and jsonb_array_length(coalesce(d->'publicPhones','[]'))=0 then raise exception 'Public link or contact required' using errcode='22023'; end if;
 if d->>'primaryType'='startup' and coalesce(d->>'sourceUrl','')='' then raise exception 'Source required' using errcode='22023'; end if;
 if coalesce(d->>'publicEmail','')<>'' and (length(d->>'publicEmail')>254 or d->>'publicEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid public email' using errcode='22023'; end if;
 foreach k in array array['websiteUrl','sourceUrl'] loop
 if coalesce(d->>k,'')<>'' and (d->>k !~ '^https?://[^[:space:]]+$' or d->>k ~ '^https?://[^/]*@') then raise exception 'Invalid public URL' using errcode='22023'; end if;
 end loop;
 if maps_url<>'' and (length(maps_url)>1000 or maps_url ~ '[[:space:][:cntrl:]]' or position(chr(92) in maps_url)>0
 or maps_url !~ '^https://(maps\.app\.goo\.gl/[^/?#]+([/?#].*)?|(www\.)?google\.com/maps([/?#].*)?|maps\.google\.com(/.*|[?#].*)?)$') then
 raise exception 'Invalid Google Maps URL' using errcode='22023'; end if;
 foreach k in array array['sectors','alsoListedAs','needs','guideCategories'] loop
 if d ? k then
 if jsonb_typeof(d->k)<>'array' or jsonb_array_length(d->k)>12 then raise exception 'Invalid listing categories' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(d->k) loop
 if jsonb_typeof(item)<>'string' or (k='needs' and item#>>'{}' not in ('build','source','manufacture','test','learn','fund','pilot'))
 or (k='alsoListedAs' and item#>>'{}' not in ('startup','research-ecosystem','supplier','vendor','other'))
 or (k='guideCategories' and item#>>'{}' not in ('workspaces','communities','cafes','build-source','living'))
 or (k='sectors' and item#>>'{}' not in ('Robotics','Physical AI','Drones & aerospace','Space hardware','Industrial automation','Hardware & sensing','Edge & embedded systems','Learning & training','Research & ecosystem')) then raise exception 'Invalid listing category' using errcode='22023'; end if;
 end loop;
 end if;
 end loop;
 if d ? 'coordinates' then
 if coalesce(d->>'locationPrecision','') not in ('Address-level','Locality-level') then raise exception 'Unconfirmed locations must remain unpinned' using errcode='22023'; end if;
 if jsonb_typeof(d->'coordinates')<>'array' or jsonb_array_length(d->'coordinates')<>2 or jsonb_typeof(d->'coordinates'->0)<>'number' or jsonb_typeof(d->'coordinates'->1)<>'number' then raise exception 'Invalid coordinates' using errcode='22023'; end if;
 if abs((d->'coordinates'->>0)::numeric)>180 or abs((d->'coordinates'->>1)::numeric)>90 then raise exception 'Invalid coordinates' using errcode='22023'; end if;
 end if;
 if d ? 'publicPhones' then
 if jsonb_typeof(d->'publicPhones')<>'array' or jsonb_array_length(d->'publicPhones')>5 then raise exception 'Invalid public phones' using errcode='22023'; end if;
 for phone in select * from jsonb_array_elements(d->'publicPhones') loop
 if jsonb_typeof(phone)<>'object' or phone - array['label','number'] <> '{}'::jsonb then raise exception 'Invalid phone details' using errcode='22023'; end if;
 if jsonb_typeof(phone->'label') is distinct from 'string' or jsonb_typeof(phone->'number') is distinct from 'string' or coalesce(phone->>'label','')='' or length(phone->>'label')>60 or coalesce(phone->>'number','') !~ '^\+[1-9][0-9 ()-]{6,24}$' then raise exception 'Invalid phone' using errcode='22023'; end if;
 end loop;
 end if;
 if d ? 'credit' and d->'credit'<>'null'::jsonb then
 if jsonb_typeof(d->'credit')<>'object' or (d->'credit') - array['name','link'] <> '{}'::jsonb or jsonb_typeof(d->'credit'->'name') is distinct from 'string' or ((d->'credit') ? 'link' and jsonb_typeof(d->'credit'->'link') is distinct from 'string') or length(coalesce(d->'credit'->>'name','')) not between 1 and 120
 or (coalesce(d->'credit'->>'link','')<>'' and (d->'credit'->>'link' !~ '^https?://[^[:space:]]+$' or d->'credit'->>'link' ~ '^https?://[^/]*@')) then raise exception 'Invalid public credit' using errcode='22023'; end if;
 end if;
 if d->>'primaryType'='other' and coalesce(d->>'subcategory','') ~* '(people|person|housing)' and (d ? 'coordinates' or maps_url<>'') then raise exception 'Private locations must remain unpinned' using errcode='22023'; end if;
end; $$;
