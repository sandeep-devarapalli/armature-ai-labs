insert into public.locations (
  id,
  slug,
  name,
  address,
  timezone
)
values (
  '10000000-0000-4000-8000-000000000001',
  'hsr-layout',
  'armature HSR Layout',
  'HSR Layout, Bengaluru, Karnataka, India',
  'Asia/Kolkata'
)
on conflict (slug) do update
set
  name = excluded.name,
  address = excluded.address,
  timezone = excluded.timezone,
  active = true;

insert into public.certification_types (
  slug,
  name,
  description,
  validity_days
)
values
  (
    'lab-orientation',
    'Lab orientation',
    'General floor safety, emergency procedures, access rules, and incident reporting.',
    365
  ),
  (
    'electronics-esd',
    'Electronics and ESD safety',
    'ESD controls, bench supplies, soldering, hot tools, and safe power-up procedure.',
    365
  ),
  (
    'fabrication-basic',
    'Fabrication basics',
    'FDM printing, hand tools, housekeeping, and safe material handling.',
    365
  ),
  (
    'resin-safety',
    'Resin printing safety',
    'Resin PPE, ventilation, wash and cure, spill response, and waste handling.',
    180
  ),
  (
    'laser-cutter',
    'Laser cutter operator',
    'Material approval, extraction, fire watch, focusing, and emergency shutdown.',
    180
  ),
  (
    'machine-shop',
    'Machine shop operator',
    'CNC, drill press, grinder, workholding, extraction, guarding, and emergency stop.',
    180
  ),
  (
    'robot-cell',
    'Robot cell operator',
    'Robot work envelope, payload limits, safe speeds, guarding, and emergency stop.',
    180
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  validity_days = excluded.validity_days,
  active = true;

insert into public.resources (
  location_id,
  slug,
  name,
  description,
  kind,
  risk,
  capacity,
  max_guests,
  guests_allowed,
  default_duration_minutes,
  increment_minutes,
  max_duration_minutes,
  metadata
)
select
  location.id,
  'builder-pod-' || lpad(number::text, 2, '0'),
  'Builder pod ' || lpad(number::text, 2, '0'),
  'Dedicated desk with locker, monitor, clean power, and lab network.',
  'workspace',
  'low',
  2,
  1,
  true,
  60,
  15,
  480,
  jsonb_build_object('zone', 'builder-pods', 'unit', number)
from public.locations location
cross join generate_series(1, 16) number
where location.slug = 'hsr-layout'
on conflict (location_id, slug) do update
set name = excluded.name, description = excluded.description, active = true;

insert into public.resources (
  location_id,
  slug,
  name,
  description,
  kind,
  risk,
  capacity,
  max_guests,
  guests_allowed,
  default_duration_minutes,
  increment_minutes,
  max_duration_minutes,
  metadata
)
select
  location.id,
  resource.slug,
  resource.name,
  resource.description,
  resource.kind::public.resource_kind,
  resource.risk::public.resource_risk,
  resource.capacity,
  resource.max_guests,
  resource.guests_allowed,
  resource.default_duration,
  resource.increment_minutes,
  resource.max_duration,
  resource.metadata
from public.locations location
cross join (
  values
    (
      'electronics-bench-01',
      'Electronics bench 01',
      'ESD-safe bench with soldering station, oscilloscope, and bench supplies.',
      'workspace',
      'controlled',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"electronics","unit":1}'::jsonb
    ),
    (
      'electronics-bench-02',
      'Electronics bench 02',
      'ESD-safe bench with soldering station, oscilloscope, and bench supplies.',
      'workspace',
      'controlled',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"electronics","unit":2}'::jsonb
    ),
    (
      'electronics-bench-03',
      'Electronics bench 03',
      'ESD-safe bench with soldering station and shared measurement equipment.',
      'workspace',
      'controlled',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"electronics","unit":3}'::jsonb
    ),
    (
      'electronics-bench-04',
      'Electronics bench 04',
      'ESD-safe bench with soldering station and shared measurement equipment.',
      'workspace',
      'controlled',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"electronics","unit":4}'::jsonb
    ),
    (
      'fdm-printer-01',
      'FDM printer 01',
      'Enclosed FDM printer for prototype parts and fixtures.',
      'equipment',
      'controlled',
      1,
      0,
      false,
      120,
      15,
      480,
      '{"zone":"rapid-prototyping","process":"fdm"}'::jsonb
    ),
    (
      'fdm-printer-02',
      'FDM printer 02',
      'Enclosed FDM printer for prototype parts and fixtures.',
      'equipment',
      'controlled',
      1,
      0,
      false,
      120,
      15,
      480,
      '{"zone":"rapid-prototyping","process":"fdm"}'::jsonb
    ),
    (
      'fdm-printer-03',
      'FDM printer 03',
      'Enclosed FDM printer for prototype parts and fixtures.',
      'equipment',
      'controlled',
      1,
      0,
      false,
      120,
      15,
      480,
      '{"zone":"rapid-prototyping","process":"fdm"}'::jsonb
    ),
    (
      'resin-printer',
      'Resin printer',
      'Resin printer with wash and cure station and dedicated extraction.',
      'equipment',
      'hazardous',
      1,
      0,
      false,
      120,
      15,
      480,
      '{"zone":"rapid-prototyping","process":"resin"}'::jsonb
    ),
    (
      'laser-cutter',
      'Laser cutter',
      'Laser cutting station with approved-material workflow and fume extraction.',
      'equipment',
      'hazardous',
      1,
      0,
      false,
      60,
      15,
      180,
      '{"zone":"rapid-prototyping","extraction_required":true}'::jsonb
    ),
    (
      'cnc-router',
      'CNC router',
      'Benchtop CNC routing station with workholding and dust extraction.',
      'equipment',
      'hazardous',
      1,
      0,
      false,
      120,
      15,
      240,
      '{"zone":"machine-shop","three_phase":true}'::jsonb
    ),
    (
      'drill-press',
      'Drill press',
      'Machine-shop drill press with guarded work area.',
      'equipment',
      'hazardous',
      1,
      0,
      false,
      30,
      15,
      120,
      '{"zone":"machine-shop"}'::jsonb
    ),
    (
      'bench-grinder',
      'Bench grinder',
      'Guarded bench grinder with local extraction and face-shield requirement.',
      'equipment',
      'hazardous',
      1,
      0,
      false,
      30,
      15,
      60,
      '{"zone":"machine-shop"}'::jsonb
    ),
    (
      'collaborative-arm-cell',
      'Collaborative arm cell',
      'Six-axis collaborative robot cell for manipulation, perception, and data collection.',
      'equipment',
      'controlled',
      3,
      2,
      true,
      60,
      15,
      240,
      '{"zone":"robot-cell","emergency_stop":true}'::jsonb
    ),
    (
      'so-arm-cell-01',
      'SO-ARM cell 01',
      'LeRobot leader and follower arm pair with cameras and edge-compute lane.',
      'equipment',
      'controlled',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"robot-cell","platform":"SO-ARM101"}'::jsonb
    ),
    (
      'so-arm-cell-02',
      'SO-ARM cell 02',
      'LeRobot leader and follower arm pair with cameras and edge-compute lane.',
      'equipment',
      'controlled',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"robot-cell","platform":"SO-ARM101"}'::jsonb
    ),
    (
      'gpu-autonomous-computer',
      'GPU Autonomous Computer',
      'Shared multi-GPU workstation for model training, simulation, vision, and local inference.',
      'compute',
      'low',
      1,
      0,
      false,
      60,
      15,
      240,
      '{"zone":"compute","queue":"interactive","gpu_target":"2x RTX 5090"}'::jsonb
    ),
    (
      'dgx-spark',
      'NVIDIA DGX Spark',
      'Shared local AI system for model testing, agent workflows, and robotics software.',
      'compute',
      'low',
      1,
      0,
      false,
      60,
      15,
      240,
      '{"zone":"compute","memory":"128GB unified"}'::jsonb
    ),
    (
      'vision-bench-01',
      'Vision bench 01',
      'OAK-D and RGB-D camera bench for calibration, perception, and edge deployment.',
      'sensor',
      'low',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"electronics","camera":"OAK-D"}'::jsonb
    ),
    (
      'vision-bench-02',
      'Vision bench 02',
      'OAK-D and RGB-D camera bench for calibration, perception, and edge deployment.',
      'sensor',
      'low',
      2,
      1,
      true,
      60,
      15,
      240,
      '{"zone":"electronics","camera":"OAK-D"}'::jsonb
    ),
    (
      'mobile-robot-bay',
      'Mobile robot bay',
      'Floor bay for OOMWOO, rover, LiDAR, RTK, and mobile-robot safety tests.',
      'mobile_robot',
      'controlled',
      3,
      2,
      true,
      90,
      15,
      240,
      '{"zone":"demo-floor","barriers_required":true}'::jsonb
    ),
    (
      'demo-floor',
      'Demo floor',
      'Open demonstration and event area with AV and supervised equipment access.',
      'room',
      'low',
      50,
      49,
      true,
      120,
      30,
      480,
      '{"zone":"demo-floor"}'::jsonb
    )
) as resource(
  slug,
  name,
  description,
  kind,
  risk,
  capacity,
  max_guests,
  guests_allowed,
  default_duration,
  increment_minutes,
  max_duration,
  metadata
)
where location.slug = 'hsr-layout'
on conflict (location_id, slug) do update
set
  name = excluded.name,
  description = excluded.description,
  kind = excluded.kind,
  risk = excluded.risk,
  capacity = excluded.capacity,
  max_guests = excluded.max_guests,
  guests_allowed = excluded.guests_allowed,
  default_duration_minutes = excluded.default_duration_minutes,
  increment_minutes = excluded.increment_minutes,
  max_duration_minutes = excluded.max_duration_minutes,
  metadata = excluded.metadata,
  active = true;

insert into public.resources (
  location_id,
  slug,
  name,
  description,
  kind,
  risk,
  capacity,
  max_guests,
  guests_allowed,
  default_duration_minutes,
  increment_minutes,
  max_duration_minutes,
  metadata
)
select
  location.id,
  'jetson-orin-nano-' || lpad(number::text, 2, '0'),
  'Jetson Orin Nano Super ' || lpad(number::text, 2, '0'),
  'Edge AI developer kit for embedded inference, robot cameras, and physical AI.',
  'compute',
  'low',
  1,
  0,
  false,
  60,
  15,
  240,
  jsonb_build_object('zone', 'compute', 'unit', number, 'platform', 'Jetson Orin Nano Super')
from public.locations location
cross join generate_series(1, 6) number
where location.slug = 'hsr-layout'
on conflict (location_id, slug) do update
set name = excluded.name, description = excluded.description, metadata = excluded.metadata, active = true;

insert into public.resource_hours (
  resource_id,
  day_of_week,
  opens_at,
  closes_at,
  effective_from
)
select
  resource.id,
  day_number,
  time '08:00',
  time '22:00',
  date '2026-01-01'
from public.resources resource
cross join generate_series(1, 5) day_number
where resource.active and resource.reservable
on conflict (resource_id, day_of_week, opens_at, effective_from) do update
set closes_at = excluded.closes_at;

insert into public.resource_hours (
  resource_id,
  day_of_week,
  opens_at,
  closes_at,
  effective_from
)
select
  resource.id,
  day_number,
  time '09:00',
  time '20:00',
  date '2026-01-01'
from public.resources resource
cross join (values (0), (6)) weekend(day_number)
where resource.active and resource.reservable
on conflict (resource_id, day_of_week, opens_at, effective_from) do update
set closes_at = excluded.closes_at;

insert into public.resource_certification_requirements (
  resource_id,
  certification_type_id
)
select resource.id, certification.id
from public.resources resource
join public.certification_types certification on certification.slug = 'lab-orientation'
where resource.active
on conflict do nothing;

insert into public.resource_certification_requirements (
  resource_id,
  certification_type_id
)
select resource.id, certification.id
from public.resources resource
join (
  values
    ('electronics-bench-01', 'electronics-esd'),
    ('electronics-bench-02', 'electronics-esd'),
    ('electronics-bench-03', 'electronics-esd'),
    ('electronics-bench-04', 'electronics-esd'),
    ('fdm-printer-01', 'fabrication-basic'),
    ('fdm-printer-02', 'fabrication-basic'),
    ('fdm-printer-03', 'fabrication-basic'),
    ('resin-printer', 'resin-safety'),
    ('laser-cutter', 'laser-cutter'),
    ('cnc-router', 'machine-shop'),
    ('drill-press', 'machine-shop'),
    ('bench-grinder', 'machine-shop'),
    ('collaborative-arm-cell', 'robot-cell'),
    ('so-arm-cell-01', 'robot-cell'),
    ('so-arm-cell-02', 'robot-cell'),
    ('mobile-robot-bay', 'robot-cell')
) mapping(resource_slug, certification_slug) on mapping.resource_slug = resource.slug
join public.certification_types certification
  on certification.slug = mapping.certification_slug
on conflict do nothing;
