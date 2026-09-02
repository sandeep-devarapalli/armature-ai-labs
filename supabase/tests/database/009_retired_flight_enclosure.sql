begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select is(
  (
    select count(*)::integer
    from public.resources
    where lower(concat_ws(' ', slug, name, description, metadata::text)) like '%cage%'
  ),
  0,
  'resource records do not retain retired enclosure wording'
);

select is(
  (
    select count(*)::integer
    from public.certification_types
    where lower(concat_ws(' ', slug, name, description)) like '%cage%'
  ),
  0,
  'certification records do not retain retired enclosure wording'
);

select is(
  (
    select count(*)::integer
    from public.public_resources
    where lower(concat_ws(' ', slug, name, description, zone)) like '%cage%'
  ),
  0,
  'public resources cannot expose retired enclosure wording'
);

select is(
  (
    select count(*)::integer
    from public.public_resource_certifications
    where lower(concat_ws(' ', slug, name, description)) like '%cage%'
  ),
  0,
  'public certification requirements cannot expose retired enclosure wording'
);

select is(
  (
    select count(*)::integer
    from public.bookings booking
    join public.resources resource on resource.id = booking.resource_id
    where resource.slug = 'retired-flight-resource'
  ),
  0,
  'retired resource has no booking history'
);

select is(
  (
    select count(*)::integer
    from public.member_certifications member_certification
    join public.certification_types certification
      on certification.id = member_certification.certification_type_id
    where certification.slug = 'retired-flight-authorization'
  ),
  0,
  'retired authorization has no member history'
);

select * from finish();

rollback;
