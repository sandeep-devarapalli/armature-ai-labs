-- Equipment listings carry product details for the card and item pages. Owner terms 2026-11-09:
-- Hiwonder SO-101 Advanced Kit, ThinkRobotics SO-101 (deposit INR 25,000) and the Waveshare OV5693 camera
-- (no deposit). Sale prices are listed now; the sale flow comes later. Specs and images are from the makers' pages.
alter table private.rental_catalogue
 add column category text, add column maker text, add column version text, add column summary text,
 add column images jsonb not null default '[]' check(jsonb_typeof(images)='array'),
 add column highlights jsonb not null default '[]' check(jsonb_typeof(highlights)='array'),
 add column specs jsonb not null default '[]' check(jsonb_typeof(specs)='array'),
 add column parts jsonb not null default '[]' check(jsonb_typeof(parts)='array'),
 add column parts_note text, add column source_label text, add column source_url text check(source_url ~ '^https://'),
 add column stock_note text, add column sale_paise bigint check(sale_paise>0),
 add column day_rent_paise bigint check(day_rent_paise>0),
 add constraint rental_catalogue_equipment_only check(kind='equipment' or (sale_paise is null and day_rent_paise is null)),
 drop constraint rental_catalogue_deposit_paise_check,
 add constraint rental_catalogue_deposit_rule check(deposit_paise>0 or (deposit_paise=0 and kind='equipment'));

-- A zero deposit is allowed only where the catalogue allows it; the bank-deposit steps already skip zero.
alter table private.rental_quotes drop constraint rental_quotes_deposit_rule,
 add constraint rental_quotes_deposit_rule check((parent_quote_id is null and deposit_paise>=0) or (parent_quote_id is not null and deposit_paise=0));

update private.rental_catalogue set name='LeRobot SO-101 Advanced Kit',category='Robot arm',maker='Hiwonder',version='Advanced Kit · assembled',
 summary='A leader and follower arm pair with two cameras, ready for teleoperation and imitation learning with Hugging Face LeRobot.',
 images='[{"src":"/media/equipment/hiwonder-so101-1.jpg","alt":"Hiwonder SO-101 leader and follower arms"},
  {"src":"/media/equipment/hiwonder-so101-2.jpg","alt":"Leader arm teleoperating the follower arm, training and autonomous picking"},
  {"src":"/media/equipment/hiwonder-so101-box.jpg","alt":"Advanced Kit packing list laid out"}]',
 highlights='["Arrives assembled; no build time","Leader-follower teleoperation","Gripper camera plus external camera","Trains ACT, π0 and SmolVLA policies"]',
 specs='[["Degrees of freedom","6 per arm"],["Follower servos","6 × HX-30HM bus servo, 30 kg·cm, magnetic encoder"],["Leader servos","6 × HX-10HM bus servo"],
  ["Controller","BusLinker V3.0 servo debugging board"],["Cameras","0.3 MP 480p wide-angle (gripper), 2 MP 1080p wide-angle (mount)"],
  ["Power","12 V 5 A (DC 4.0 × 1.7)"],["Connection","USB serial"],["Software","Hugging Face LeRobot, Python; Windows or Ubuntu"],["Material","PLA, 3D printed"],
  ["Leader arm","111 × 239 × 525 mm, 697 g"],["Follower arm","111 × 173 × 532 mm, 704 g"],["Camera mount","166 × 258 × 527 mm, 1,178 g"]]',
 parts='[["Leader arm, assembled","1"],["Follower arm, assembled","1"],["Camera mount arm","1"],["HD camera","2"],["4-port USB hub","1"],["USB cable","4"],
  ["12 V power adapter","2"],["Table clamp","4"],["Screwdriver","2"],["Spare servo cables, horns, cable ties and screws","1 set"]]',
 parts_note='Read from Hiwonder''s Advanced Kit packing list. Staff check every part at handover and return.',
 source_label='Hiwonder product page',source_url='https://www.hiwonder.com/products/lerobot-so-101?variant=42198960242775',sale_paise=5500000
where code='hiwonder';

insert into private.rental_catalogue(code,kind,name,week_rent_paise,month_rent_paise,day_rent_paise,deposit_paise,sale_paise,released,sort_order,
 category,maker,version,summary,images,highlights,specs,parts,parts_note,source_label,source_url,stock_note) values
('thinkrobotics-so101','equipment','LeRobot SO-101 6-Axis Robotic Arm',80000,250000,null,2500000,3100000,true,110,
 'Robot arm','ThinkRobotics','12 V follower upgrade · SKU LERO0001',
 'The official open-source SO-101 leader and follower pair, with higher-torque 12 V servos on the follower arm.',
 '[{"src":"/media/equipment/thinkrobotics-so101-1.jpg","alt":"ThinkRobotics SO-101 follower arm"},
  {"src":"/media/equipment/thinkrobotics-so101-3.jpg","alt":"ThinkRobotics SO-101 arm, second view"},
  {"src":"/media/equipment/thinkrobotics-so101-colours.jpg","alt":"SO-101 printed parts come in red or black"}]',
 '["Follower arm up to 30 kg·cm stall torque","Leader-follower teleoperation","Stays in sync with the Hugging Face SO-101 project","No camera included"]',
 '[["Degrees of freedom","6 per arm"],["Follower servos","6 × STS3215 12 V, 1/345 gear, up to 30 kg·cm"],["Leader servos","6 × STS3215 7.4 V: 1 × 1/345, 2 × 1/191, 3 × 1/147"],
  ["Controller","2 × motor control board"],["Power","12 V 7.5 A (follower), 5 V 6 A (leader)"],["Connection","USB-C"],["Software","Hugging Face LeRobot, Python"],
  ["Camera","Not included"],["Printed parts","Red or black, as supplied"]]',
 '[["3D-printed arm parts (no camera mount)","1 set"],["STS3215 servo 12 V, 1/345 gear","6"],["STS3215 servo 7.4 V, 1/345 gear","1"],["STS3215 servo 7.4 V, 1/191 gear","2"],
  ["STS3215 servo 7.4 V, 1/147 gear","3"],["Motor control board","2"],["USB-C to USB-C cable, 2 m","2"],["Power supply 5 V 6 A","1"],["Power supply 12 V 7.5 A","1"],["Table clamp","4"]]',
 'From ThinkRobotics'' parts list. Staff check every part at handover and return.',
 'ThinkRobotics product page','https://thinkrobotics.com/products/so-arm101-hugging-face-lerobot',null),
('waveshare-ov5693','equipment','OV5693 5MP USB Camera (A)',100000,200000,20000,0,400000,true,120,
 'Camera','Waveshare','Auto-focus · SKU 24710',
 'A 5 MP auto-focus USB camera with dual microphones, for recording LeRobot episodes alongside an arm.',
 '[{"src":"/media/equipment/waveshare-ov5693-1.jpg","alt":"Waveshare OV5693 5MP USB camera module"},
  {"src":"/media/equipment/waveshare-ov5693-2.jpg","alt":"OV5693 camera module features"},
  {"src":"/media/equipment/waveshare-ov5693-size.jpg","alt":"OV5693 camera outline dimensions"}]',
 '["5 MP OV5693 sensor, auto-focus","135° diagonal field of view","USB 2.0, no driver needed","Onboard dual microphones"]',
 '[["Sensor","OV5693, 1/4 inch, 5 MP"],["Interface","USB 2.0"],["Focus","Auto-focus"],["Lens","f/2.1, 2.5 mm focal length"],
  ["Field of view","135° diagonal, 95° horizontal, 70° vertical"],["Still image","2592 × 1944"],
  ["Video (MJPG)","Up to 2592 × 1944 at 15 fps; 1080p, 720p and 480p at 15 fps"],["Video (YUY2)","1080p at 5 fps, 720p at 10 fps, 480p at 15 fps"],
  ["Audio","Onboard dual microphones"],["Power","5 V ± 5%, 500 mA"],["Size","Camera 18 × 18 × 19.69 mm; module 18 × 40 mm"]]',
 '[["OV5693 5MP USB Camera (A)","1"]]',
 'Full box contents are checked when the stock arrives.',
 'Waveshare product page','https://www.waveshare.com/ov5693-5mp-usb-camera-a.htm','2 on order');

-- Units free right now: linked, usable for rental, and not held or reserved at this moment.
create function private.rental_free_units(p_code text) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from private.rental_catalogue_resources r join private.rental_catalogue c on c.code=r.code
 join public.resources res on res.id=r.resource_id and res.active and res.reservable
 where r.code=p_code and exists(select 1 from public.resource_booking_policies p where p.resource_id=r.resource_id and p.kind=c.kind)
 and (c.kind='cabin' or exists(select 1 from public.equipment_rental_units u join public.asset_units a on a.id=u.asset_unit_id
  where u.resource_id=r.resource_id and u.commissioned and a.status='available'))
 and private.rental_range_available(r.resource_id,tstzrange(now(),now()+interval '1 minute'));
$$;

create or replace function private.rental_products() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_agg(jsonb_build_object('product',c.code,'kind',c.kind,'name',c.name,'floor',c.floor,
 'billableSeats',c.billable_seats,'extraSeats',c.extra_seats,'monthlyRentPaise',c.monthly_rent_paise,'weekRentPaise',c.week_rent_paise,
 'monthRentPaise',c.month_rent_paise,'dayRentPaise',c.day_rent_paise,'depositPaise',c.deposit_paise,'salePaise',c.sale_paise,
 'availableFrom',c.available_from,'status',case when private.rental_item_quotable(c) then 'available' else 'coming_soon' end,
 'quantity',(select count(*) from private.rental_catalogue_resources r where r.code=c.code),'freeUnits',private.rental_free_units(c.code),
 'workspaceRequired',c.kind='equipment','staffConfirmationRequired',true,'configured',private.rental_resource(c.code,null) is not null,
 'category',c.category,'maker',c.maker,'version',c.version,'summary',c.summary,'images',c.images,'highlights',c.highlights,
 'specs',c.specs,'parts',c.parts,'partsNote',c.parts_note,'sourceLabel',c.source_label,'sourceUrl',c.source_url,'stockNote',c.stock_note)
 order by c.sort_order,c.code) from private.rental_catalogue c),'[]'::jsonb);
$$;
revoke all on function private.rental_free_units(text) from public,anon,authenticated;
