do $$
begin
  if exists (
    select 1
    from public.bookings booking
    join public.resources resource on resource.id = booking.resource_id
    where resource.slug = 'drone-cage'
  ) then
    raise exception 'Retired flight resource still has booking history; resolve it before retirement';
  end if;

  if exists (
    select 1
    from public.member_certifications member_certification
    join public.certification_types certification
      on certification.id = member_certification.certification_type_id
    where certification.slug = 'drone-cage'
  ) then
    raise exception 'Retired flight authorization is still assigned; resolve it before retirement';
  end if;
end;
$$;

update public.resources
set
  slug = 'retired-flight-resource',
  name = 'Retired flight resource',
  description = 'Retired resource retained only for historical booking records.',
  reservable = false,
  active = false,
  metadata = (metadata - 'zone' - 'spotter_required') || '{"retired":true}'::jsonb,
  updated_at = now()
where slug = 'drone-cage';

update public.certification_types
set
  slug = 'retired-flight-authorization',
  name = 'Retired flight authorization',
  description = 'Retired authorization retained only for historical member records.',
  active = false,
  updated_at = now()
where slug = 'drone-cage';
