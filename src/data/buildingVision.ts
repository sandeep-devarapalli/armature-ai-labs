export type BuildingVisionFloor = "Frontage" | "Ground floor" | "First floor";

export type BuildingVisionItem = {
  id: string;
  sequence: string;
  floor: BuildingVisionFloor;
  title: string;
  proposedUse: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  alt: string;
  caption: string;
  designIntent: string;
  keyElements: string;
  preserve: string;
  modelNote?: string;
  modelImage?: { src: string; alt: string; caption: string; width: number; height: number };
};

const imageRoot = "/building-vision/rework-v2";

export const buildingVisionItems: BuildingVisionItem[] = [
  {
    id: "exterior-building-frontage",
    sequence: "00",
    floor: "Frontage",
    title: "Exterior building frontage",
    proposedUse: "Primary arrival, outdoor café seating and Armature AI Labs identity",
    image: `${imageRoot}/00 - Exterior Building Frontage.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "Cream-white Armature AI Labs building frontage with updated identity, umbrella café seating, planters and a clear entrance route",
    caption: "Street-facing exterior concept",
    designIntent: "Give the existing building a calm cream-white finish and a clear, premium arrival without changing its architectural profile.",
    keyElements: "Updated Armature AI Labs identity, weighted café umbrellas, loose tables and chairs, and planted pots; remove visual clutter and cycles from this presentation view.",
    preserve: "Façade geometry, curved balcony, entrance steps, railings, gate, trees, drainage and the unobstructed route to the door."
  },
  {
    id: "ground-floor-entrance-reception",
    sequence: "01",
    floor: "Ground floor",
    title: "Ground floor entrance and reception",
    proposedUse: "Visitor welcome, check-in and a compact Armature AI Labs goodies display",
    image: `${imageRoot}/01 - Ground Floor Entrance and Reception.png`,
    imageWidth: 1050,
    imageHeight: 1400,
    alt: "Ground-floor entrance arranged as a warm reception and visitor check-in area with compact display furniture",
    caption: "Arrival and reception concept",
    designIntent: "Make the first room inside the entrance legible as reception while keeping the intervention compact and welcoming.",
    keyElements: "A movable reception desk, small merchandise display, visitor perch, warm task lighting and restrained Armature AI Labs graphics.",
    preserve: "Entrance door, side window, stepped opening, raised threshold, arched frame and every existing door swing."
  },
  {
    id: "ground-floor-coworking-commons-wide-view",
    modelImage: {
      src: "/building-vision/model-aligned-r01/gf10-layout.png",
      alt: "R01 Blender cutaway showing nine square table modules in three banks, perimeter workbar seating and the GF09 presentation area",
      caption: "R01 GF10/GF09 cutaway; this retained arrangement uses square tables instead of the earlier round-table concept.",
      width: 2100, height: 1550
    },
    sequence: "02",
    floor: "Ground floor",
    title: "Ground floor coworking commons — wide view",
    proposedUse: "Everyday coworking with clear sightlines to the presentation area",
    image: `${imageRoot}/02 - Ground Floor Coworking Commons - Wide View.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "Wide view of the ground-floor coworking commons with powered round tables, compact chairs and a continuous wall workbar",
    caption: "Coworking commons overview",
    designIntent: "Support laptop work and viewing GF09, with seat-turning and movement constraints checked separately.",
    modelNote: "GF10 in issued R01: nine 2 ft 6 in square T01 modules, 17 counter chairs and 21 table chairs (38 selected positions). The round tables in the expandable earlier concept are superseded. Occupied-chair conflicts and movement restrictions remain; this is not an approved occupancy capacity.",
    keyElements: "Nine square T01 modules, a 17 in-deep perimeter counter and 52 planned receptacles across 26 dual-socket plates. Three additional end-seat sockets remain optional and unapproved.",
    preserve: "Existing walls, windows, doors, floor levels, the two-step platform and an open audience route toward the screen."
  },
  {
    id: "ground-floor-coworking-curved-workbar-overview",
    modelImage: {
      src: "/building-vision/model-aligned-r01/gf10-workbar.png",
      alt: "R01 Blender workbar cutaway showing the straight run, limited curved section and selected counter and square-table seating",
      caption: "R01 view of nine square modules joined in three banks; the workbar and chair arrangement is retained.",
      width: 1200, height: 1000
    },
    sequence: "03",
    floor: "Ground floor",
    title: "Ground floor coworking — curved workbar overview",
    proposedUse: "Continuous powered laptop and monitor seating along the curved wall",
    image: `${imageRoot}/03 - Ground Floor Coworking - Curved Workbar Overview.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "Curved ground-floor coworking wall fitted with a continuous timber workbar, power points and task chairs",
    caption: "Continuous curved workbar concept",
    designIntent: "Use the curved perimeter as productive work frontage rather than interrupting it with isolated furniture.",
    modelNote: "GF10's selected counter is 17 in deep, continuing along the straight, short curved and side-wall runs with 17 counter chairs. The expandable earlier concept predates this layout; monitor fit and chair movement still need checking.",
    keyElements: "A 17 in-deep timber worktop, planned dual-socket plates, cable control and task lighting subject to fixture and electrical design.",
    preserve: "The model's straight-to-curve transition, windows, sill levels, room footprint and door reserves; do not treat narrow chair-back gaps as verified circulation."
  },
  {
    id: "ground-floor-coworking-curved-workbar-window-run",
    sequence: "04",
    floor: "Ground floor",
    title: "Ground floor coworking — curved workbar window run",
    proposedUse: "Window-facing individual work seats connected to the curved workbar",
    image: `${imageRoot}/04 - Ground Floor Coworking - Curved Workbar Window Run.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "Window-side view of the continuous curved timber workbar with powered work seats and space for a laptop or monitor",
    caption: "Window workbar detail",
    designIntent: "Keep the worktop visually and functionally continuous through the window side of the room.",
    modelNote: "GF10 uses a 17 in-deep counter, not an assumed monitor-ready depth. Check the actual monitor/base, laptop and cable space. Counter users must turn or relocate to watch GF09; the earlier image is not a seating-count reference.",
    keyElements: "Window-facing counter chairs, planned desk-level sockets, cable control and task lighting; confirm equipment fit before procurement.",
    preserve: "Window frames and openings, the curved wall, daylight, sill lines and the walking route behind the work seats."
  },
  {
    id: "ground-floor-coworking-straight-workbar-wall-run",
    sequence: "05",
    floor: "Ground floor",
    title: "Ground floor coworking — straight workbar wall run",
    proposedUse: "Additional powered work seats continuing the same perimeter system",
    image: `${imageRoot}/05 - Ground Floor Coworking - Straight Workbar Wall Run.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "Straight wall section of the ground-floor coworking room with the timber workbar and chairs continuing toward the window side",
    caption: "Straight workbar continuation",
    designIntent: "Make the straight and curved wall runs read as one uninterrupted coworking installation.",
    keyElements: "The same worktop height, depth, timber, socket rhythm, task chairs and cable management used on the curved run.",
    modelNote: "Continue the 17 in-deep GF10 counter around the approved wall runs. The central furniture is nine 2 ft 6 in square modules, not the earlier round-table concept; retain the recorded occupied-chair restrictions.",
    preserve: "Doors, windows, wall returns, service points and the approved square-table positions; verify practical access with chairs occupied."
  },
  {
    id: "ground-floor-presentation-area-audience-view",
    modelImage: {
      src: "/building-vision/model-aligned-r01/gf09-presentation.png",
      alt: "R01 Blender cutaway of four individual GF09 lounge chairs, coffee table, lectern and AV equipment in front of the selected curved stair partition",
      caption: "R01 GF09 cutaway, including the retained 1 ft forward furniture shift.",
      width: 1200, height: 1000
    },
    sequence: "06",
    floor: "Ground floor",
    title: "Ground floor presentation area — audience view",
    proposedUse: "Product launches, demonstrations, talks, panels and live streaming",
    image: `${imageRoot}/06 - Ground Floor Presentation Area - Audience View.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "Audience view of a compact presentation area with a large projection screen, slim seating, podium, microphones and camera position",
    caption: "Presentation and demo concept",
    modelNote: "GF09 in issued R01 has four individual lounge chairs, not a couch. The furniture and AV arrangement was moved together 1 ft toward GF10. The selected curved stair partition is A01 with a left flat access door; its kitchen-door approach restriction remains.",
    designIntent: "Keep the approved lounge and AV arrangement coordinated with the GF10 audience and the distinct stair enclosure; verify sightlines and door operation on site.",
    keyElements: "Four individual lounge chairs, a low coffee table, mobile lectern, laptop, projection screen, projector, microphones and two speakers.",
    preserve: "The approved relative furniture and AV positions, staircase, side doors, pillars and level change; do not portray the constrained side approaches as certified clear routes."
  },
  {
    id: "ground-floor-two-person-video-meeting-room",
    sequence: "07",
    floor: "Ground floor",
    title: "Ground floor two-person video meeting room",
    proposedUse: "Private calls and focused two-person meetings",
    image: `${imageRoot}/07 - Ground Floor Two-Person Video Meeting Room.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "Compact two-person meeting room with a glass access door, slim desk, upholstered seating and a smooth timber video-call background",
    caption: "Two-person meeting-room concept",
    designIntent: "Turn the compact enclosure into a comfortable call room with a clean camera background and a visually flat seating platform.",
    modelNote: "GF07's selected R01 booth uses a two-cushion bench, rounded pedestal table and glass access door. This earlier image is an appearance reference, not authority to introduce a different desk or platform.",
    keyElements: "Selected bench and rounded pedestal table, glass door and timber backdrop; power, acoustics and lighting remain fit-out design items.",
    preserve: "The approved booth and existing enclosure, surrounding walls, openings, services and access; do not infer floor-level changes from this image."
  },
  {
    id: "ground-floor-open-workspace-attached-washroom",
    sequence: "08",
    floor: "Ground floor",
    title: "Ground floor open workspace with attached washroom",
    proposedUse: "GF01 four-person cabin A — selected P01 layout",
    image: `${imageRoot}/08 - Ground Floor Open Workspace with Attached Washroom.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "Ground-floor workspace arranged around an eight-seat meeting table while its attached washroom and polished marble floor remain accessible",
    caption: "Open workspace concept",
    modelNote: "GF01 cabin A is included in R03: four 2 ft 6 in square tables, four chairs, opposed desk pairs, grid-framed glazing and a recessed outward door. The earlier eight-seat concept is superseded. GF03 remains shared; the GF01–GF08 connection is cabin-only, while GF08 retains its separate GF10 door. Occupied-chair, pull-back and door-operation restrictions are not resolved by selection.",
    designIntent: "Use selected P01 with retained storage already accounted for; do not deduct the cupboard allowance a second time or restore the pictured eight-seat table.",
    keyElements: "Four tables and chairs, the selected glazed enclosure and recessed door. Retain the existing marble and dark border; final frame material, hardware and installation details remain provisional.",
    preserve: "Existing marble and border pattern, attached washroom, all room doors, windows, cupboards and cabinets, walls, ceiling and service locations."
  },
  {
    id: "ground-floor-enclosed-balcony-doorway-view",
    sequence: "09",
    floor: "Ground floor",
    title: "Ground floor enclosed balcony — doorway view",
    proposedUse: "GF08 enclosed balcony café and work seating — AC undecided",
    image: `${imageRoot}/09 - Ground Floor Enclosed Balcony - Doorway View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "Doorway view into the curved ground-floor balcony enclosed with glass and furnished with coordinated round tables, chairs and plants",
    caption: "Enclosed balcony doorway view",
    modelNote: "GF08's selected R01 layout has two round tables, four chairs and a bar with two stools, plus the retained guard, steps and GF10 access door. This earlier image is not the exact issued arrangement; AC remains undecided.",
    designIntent: "Keep the selected enclosure, balcony edge and approach doors legible while checking weather protection, ventilation and thermal comfort before installation.",
    keyElements: "Selected glazing, two round tables, four chairs, a bar with two stools and plants; glazing specification and services require technical design.",
    preserve: "Existing doorway, curved balcony footprint, both side corners, railings, floor drainage and access back to the coworking workbar."
  },
  {
    id: "ground-floor-enclosed-balcony-long-view",
    modelImage: {
      src: "/building-vision/model-aligned-r01/gf08-balcony.png",
      alt: "R01 Blender cutaway of the GF08 balcony with its dark grid enclosure, GF10 timber door, GF01-side steps and selected café seating",
      caption: "R01 GF08 cutaway; the retained GF10 door and approximate bounded steps remain visible.",
      width: 1200, height: 1000
    },
    sequence: "10",
    floor: "Ground floor",
    title: "Ground floor enclosed balcony — long view",
    proposedUse: "GF08 café and work seating following the existing balcony shape",
    image: `${imageRoot}/10 - Ground Floor Enclosed Balcony - Long View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "Long view of the ground-floor curved balcony with glass enclosure, coordinated work tables and chairs, planters and visible access doors",
    caption: "Enclosed balcony long view",
    designIntent: "Show the complete curved enclosure and its side bays as one continuous, weather-protected workspace.",
    modelNote: "Use the approved GF08 model for the stepped-and-curved contour, enclosure, door and furniture positions. The expandable earlier concept is retained only for comparison; neither an AC system nor its capacity has been selected.",
    keyElements: "Two round tables, four chairs, two bar stools, plants and the selected glazed enclosure; ventilation and any AC provision remain unresolved.",
    preserve: "Both doors, wall returns, balcony curve, corner areas, existing railings, drainage falls and the continuous walking path."
  },
  {
    id: "ground-floor-glass-stair-partition",
    modelImage: {
      src: "/building-vision/model-aligned-r01/gf09-stair.png",
      alt: "R01 Blender view of the curved GF09 A01 dark grid stair partition with a left flat access door and rear wall returns",
      caption: "R01 view of the retained GF09 A01 curved partition, not the older straight-front concept.",
      width: 2100, height: 1550
    },
    sequence: "11",
    floor: "Ground floor",
    title: "Ground floor glass stair partition",
    proposedUse: "Access-controlled separation between the shared stair and Armature AI Labs space",
    image: `${imageRoot}/11 - Ground Floor Glass Stair Partition.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "Ground-floor staircase enclosed by a full-height U-shaped glass partition with a controlled access door and clear routes to side rooms",
    caption: "Ground-floor stair separation concept",
    designIntent: "Secure the workspace without blocking people who use the stair or the doors beside it.",
    modelNote: "GF09 A01 is the selected curved stair partition with a left flat nominal 3 ft access door, replacing the expandable earlier U-shaped concept. The model's approximately 30.39 in near-frame passage is a planning check, not an as-built clearance or compliance certificate; the door temporarily occupies the kitchen approach.",
    keyElements: "Curved clear glazing and slim framing following selected A01, with a left flat door. Final height, glass, hardware and access control need installation design.",
    preserve: "Stair width and turn, white stair finish, landing, top pillar, side walls, adjacent doors, windows, railings and required egress."
  },
  {
    id: "ground-floor-kitchen",
    sequence: "12",
    floor: "Ground floor",
    title: "Ground floor kitchen",
    proposedUse: "Café preparation, service and wash-up",
    image: `${imageRoot}/12 - Ground Floor Kitchen.png`,
    imageWidth: 1050,
    imageHeight: 1400,
    alt: "Ground-floor kitchen refreshed for café preparation with its original marble floor retained and polished",
    caption: "Kitchen fit-out concept",
    designIntent: "Make the existing kitchen operational and orderly while retaining the character and pattern of its marble floor.",
    keyElements: "Polished marble, cleanable work surfaces, organised storage, stainless mobile prep bench and bright task lighting.",
    preserve: "Existing marble and border pattern, plumbing wall, counters, cupboards, windows, doors, ceiling and service points."
  },
  {
    id: "first-floor-glass-stair-partition",
    modelImage: {
      src: "/building-vision/model-aligned-r01/ff04-stair.png",
      alt: "R01 Blender view of the curved FF04 P01 dark grid stair partition with a central flat access door and the stair void retained",
      caption: "Historical R01 FF04 partition: its central door is superseded by R03's left curved stair slider.",
      width: 2100, height: 1550
    },
    sequence: "13",
    floor: "First floor",
    title: "First floor glass stair partition",
    proposedUse: "FF04 twin cabins and selected left curved stair access — R03 proposal",
    image: `${imageRoot}/13 - First Floor Glass Stair Partition.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    alt: "First-floor stair landing with a full-height U-shaped glass partition stopping at the stair turn and leaving the adjacent doorway clear",
    caption: "First-floor stair separation concept",
    designIntent: "Coordinate the enlarged twin cabins with the selected left stair opening, separate gallery and existing room access.",
    modelNote: "R03 models the selected FF04 enlargement with two four-table islands and sliding cabin entrances. P03 replaces the right outward door with a left-parking slider. A custom two-leaf curved slider replaces the stair enclosure's former central door, which is now glazed. The R01 render and older U-shaped concept are historical. Occupied island access and hardware engineering still need review; eight modeled positions are not verified capacity or installation approval.",
    keyElements: "Eight 2 ft 6 in square tables, eight chair proxies, dark grid glazing, sliding cabin entrances and separate-radius curved stair leaves; preserve the gallery and void.",
    preserve: "Original wall proportions, stair turn, white stairs, railings, landing void, windows, services and clear access to the door beside the stair."
  },
  {
    id: "first-floor-enclosed-right-balcony-door-view",
    sequence: "14",
    floor: "First floor",
    title: "First floor enclosed right balcony — door view",
    proposedUse: "FF02 electronics workshop — P01 modeled fit-out and cover proposal",
    image: `${imageRoot}/14 - First Floor Enclosed Right Balcony - Door View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "Door view of the first-floor right balcony enclosed with glass walls and a glass roof while retaining its curved perimeter",
    caption: "First-floor balcony doorway view",
    modelNote: "R03 retains FF02 workshop P01: two square tables, four chairs, a separate 4 ft × 3 ft bench, glazing, outward door and proposed cover. This is a saved model, not installed work. Roof material, structure, extraction, occupied access and services remain unresolved; the earlier pictured glass roof and AC are not specifications.",
    designIntent: "Develop the proposed workshop and cover around the retained balcony contour and adjoining doors, with ventilation and solder-fume extraction reviewed before equipment is chosen.",
    keyElements: "Two 2 ft 6 in square tables, four chairs, a custom 4 ft × 3 ft workbench and modeled enclosure/cover proposal; no settled HVAC or roof specification.",
    preserve: "Door, wall counters and returns, balcony curve, corners, floor levels, drainage and all existing structural edges."
  },
  {
    id: "first-floor-enclosed-right-balcony-curved-perimeter",
    sequence: "15",
    floor: "First floor",
    title: "First floor enclosed right balcony — curved perimeter view",
    proposedUse: "FF02 workshop enclosure and new cover — retained R03 proposal",
    image: `${imageRoot}/15 - First Floor Enclosed Right Balcony - Curved Perimeter View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "Curved-perimeter view of the first-floor right balcony with segmented curved glass walls, glass roof and coordinated furniture",
    caption: "Curved glass perimeter concept",
    modelNote: "This earlier lounge image does not show FF02 workshop P01 retained in R03. Its revised 9 ft 9 in approximate enclosure run is parallel to the opposite side, with a separate inset glass path and unenclosed balcony tip. Use the current floor model and room CAD, not this picture, for furniture, door and cover positions.",
    designIntent: "Review the separate glass line and new cover without altering the existing straight, stepped and curved balcony perimeter.",
    keyElements: "Selected workshop furniture and provisional glazing/cover geometry; extraction and installation design remain pending. Do not procure a glass roof or AC from this concept image.",
    preserve: "The complete balcony contour, both corners, wall turns, door clearances, drainage paths and the visual connection outdoors."
  },
  {
    id: "first-floor-workspace-window-wall-glass-door",
    sequence: "16",
    floor: "First floor",
    title: "First floor workspace — window wall and glass door view",
    proposedUse: "Historical first-floor office reference — image-to-room registration pending",
    image: `${imageRoot}/16 - First Floor Workspace - Window Wall and Glass Door View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "First-floor workspace with acoustic carpet, desks placed toward the window wall and a solid brown door replaced by a glass access door",
    caption: "Window-wall workspace concept",
    modelNote: "Do not assign this earlier image a permanent room ID before registration. R04 updates the FF03 four-person entrance to sliding while retaining both cabins and the R03 FF04/FF06 twin cabins. FF06's former four-desk proposal is superseded; its cupboard, dresser and mirror remain. Use current native views and room CAD for positions, not this historical concept. Occupied access and services remain unresolved.",
    designIntent: "Create a bright, minimal work room while improving visibility and access through the new glass door.",
    keyElements: "Acoustic carpet, wall-oriented desks, ergonomic chairs, power access, warm task lights and a clear glass access door.",
    preserve: "Windows, room footprint, existing fixed storage, wall lines, ceiling and the original doorway opening."
  },
  {
    id: "first-floor-workspace-three-desks-dresser",
    sequence: "17",
    floor: "First floor",
    title: "First floor workspace — three-desk and dresser view",
    proposedUse: "FF06 selected twin cabins — dresser retained, lower cabin has balcony access",
    image: `${imageRoot}/17 - First Floor Workspace - Three-Desk and Dresser View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "First-floor room arranged with three work desks, ergonomic chairs, acoustic carpet and its existing dresser retained",
    caption: "Three-desk workspace concept",
    modelNote: "R03 models FF06 revised A: two cabins with eight square tables and eight chairs, an enlarged upper cabin and dedicated lower-cabin balcony access. P03 replaces the outward entrances with inside-parking sliding doors. The dresser and mirror must stay; their approximate dimensions, the cupboard and corrected B02 balcony are retained. This older three-desk picture and the former four-desk proposal are superseded. Upper-chair pull-back, occupied routes and hardware engineering still need review; modeled positions are not verified simultaneous capacity.",
    designIntent: "Retain the accepted dresser/mirror approximation and cupboard around the selected cabins, keeping lower-cabin balcony access distinct from the shared west route.",
    keyElements: "Eight full-size square tables, eight chair proxies, two glazed cabins and inside-parking sliders, retained storage and B02 balcony. Hardware, occupied routes and services still require review.",
    preserve: "Existing dresser, cupboards, windows, doors, washroom access, wall geometry and service locations."
  },
  {
    id: "first-floor-workspace-cabinet-desk",
    sequence: "18",
    floor: "First floor",
    title: "First floor workspace — cabinet and desk view",
    proposedUse: "Focused desk positions integrated around the retained cabinets",
    image: `${imageRoot}/18 - First Floor Workspace - Cabinet and Desk View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "First-floor office view with minimal work desks and task chairs arranged around the retained built-in cabinets",
    caption: "Cabinet-side workspace concept",
    modelNote: "R03 includes FF06's selected twin cabins with P03 sliding entrances and the approximate retained dresser/mirror. The long cupboard and shared west access remain; storage operation and occupied chair routes still need checks. The lower cabin has dedicated access to the corrected B02 balcony. Do not remove storage or change furniture from this earlier image.",
    designIntent: "Let the existing storage remain the fixed element and keep all new work furniture simple and movable.",
    keyElements: "Compact desks, ergonomic chairs, acoustic carpet, low-glare lighting, cable management and uncluttered styling.",
    preserve: "All owner-retained cabinets and cupboards, doors, windows, walls, ceiling, floor levels and service points."
  },
  {
    id: "first-floor-workspace-storage-wall-entry",
    sequence: "19",
    floor: "First floor",
    title: "First floor workspace — storage wall entry view",
    proposedUse: "Clear entry circulation into the storage-led workspace",
    image: `${imageRoot}/19 - First Floor Workspace - Storage Wall Entry View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "Entry view of the first-floor workspace through a glass access door, with acoustic carpet and the original storage wall intact",
    caption: "Storage-wall entry concept",
    modelNote: "Image-to-room registration is pending; do not use this view to assign a room ID or approve a new glass door. R04 changes only the FF03 four-person cabin entrance to sliding; its two-person cabin and the R03 FF04/FF06 twin cabins are retained. Use current native views and room CAD for doors, storage and access limitations; this concept does not establish a clear occupied route.",
    designIntent: "Make the room feel organised from the entrance while keeping the furniture outside every door swing and access route.",
    keyElements: "Glass access door, quiet carpet, retained storage, warm-white walls and a completely open route along the storage wall.",
    preserve: "Storage wall, fixed cupboards, original doorway size, adjacent doors, windows, washroom access and central circulation."
  },
  {
    id: "first-floor-workspace-storage-wall-balcony",
    sequence: "20",
    floor: "First floor",
    title: "First floor workspace — storage wall and balcony view",
    proposedUse: "Retained storage with open circulation to the balcony",
    image: `${imageRoot}/20 - First Floor Workspace - Storage Wall and Balcony View.png`,
    imageWidth: 1086,
    imageHeight: 1448,
    alt: "First-floor workspace showing retained storage, acoustic carpet, an open central floor and the balcony opening at the left",
    caption: "Workspace-to-balcony concept",
    modelNote: "Image-to-room registration is pending. FF03's R04 four-person entrance slides; the FF02 connection, storage, two-person cabin door and inward-opening FF05 bathroom door are preserved. Occupied-chair routes remain constrained. R03's FF06 twin cabins and lower-cabin-only balcony access remain unchanged. B02 retains the junction wall and threshold after removing the isolated west strip/kerb/guard; do not infer shared balcony access from this earlier concept.",
    designIntent: "Complete the room sequence by showing the retained storage wall and the unobstructed connection to the balcony before loose furniture is added.",
    keyElements: "Retained full-height storage, acoustic carpet, refreshed warm-white walls, open central floor area and a clearly visible balcony opening.",
    preserve: "All cabinets and cupboards, balcony opening, door position, windows, wall proportions, services and an unobstructed route outdoors."
  }
];
