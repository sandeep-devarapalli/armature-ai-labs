# Armature AI Labs, HSR 1490: electrical and setup plan S02

Planning estimate prepared 12 September 2026 from the measured room programme (R03 ground floor, R04 first floor) and Sandeep's decisions of the same day. It is a brief for a licensed electrical contractor, not a certified design: cable sizing, protection coordination, earthing tests and BESCOM paperwork remain the contractor's responsibility.

## 1. Inputs and decisions

- Supply: BESCOM three-phase, 10 kW sanctioned for the premises with the premises on its own sub-meter. The existing installation is a small residential one (about ten light points, five fans and ten switchboards); treat it as a rewire.
- Air conditioning: seven private cabins on 0.8-ton inverter splits (GF-01, FF-03 a and b, FF-04 a and b, FF-06 a and b); presentation hall GF-09 on two 1.5-ton inverter splits; commons, reception, booth, kitchen, workshop and balconies on BLDC fans.
- Lab equipment lives in FF-02 once it is enclosed: two GPU workstations, three 3D printers, soldering with extraction, bench instruments, the network rack with PoE switch, NVR and NAS.
- Critical power: one 3 kVA online UPS with about two hours of battery for GPUs, printers, network and the hall AV. Plus one inverter per floor for lights, fans and a few desk sockets.
- Hall AV: ceiling projector, streaming/recording PC, two active speakers, wireless mics with receiver, PTZ recording camera.
- CCTV: ten PoE cameras at entrances, access doors and shared rooms, none inside cabins.
- Access: at least three access doors per floor, each with an electric lock, reader, door contact and an emergency exit light, run from a PoE-fed access controller in the rack (fail-safe release on fire alarm).
- Occupancy: Sandeep's 25-person concurrency cap is the design case; every-cabin-full and event evenings are stress cases.

## 2. Per-room schedule

Sockets are counted as points (a duplex desk board is one 6 A point with two outlets). 16 A points include the dedicated AC and appliance points. Lighting uses the lumen method at 300 lux for desks, 250 dimmable in the hall, 500 in the workshop, 200 for reception and kitchen, 100 elsewhere, with a 0.44 utilisation and maintenance factor.

| Room | Area (sq ft) | Seats | Lighting | Fans | Air conditioning | 6 A points | 16 A points | Connected | Typical demand |
|---|---|---|---|---|---|---|---|---|---|
| GF-01 Four-person cabin | 234 | 4 | 5 x 2x2 LED panel 36 W | 0 | 0.8-ton inverter split | 5 | 2 | 1360 W | 874 W |
| GF-02 Reception and goodies store | 90 | 3 | 4 x LED downlight 12 W | 1 | BLDC fans | 5 | 1 | 458 W | 303 W |
| GF-03 Rear sanitary space | 68 | 0 | 2 x LED downlight 12 W | 0 + exhaust | none | 1 | 0 | 49 W | 39 W |
| GF-04 Kitchen | 189 | 0 | 4 x LED batten 20 W (IP65 outdoors) | 1 + exhaust | BLDC fans | 2 | 4 | 3180 W | 298 W |
| GF-06 Stair-side sanitary space | 33 | 0 | 1 x LED downlight 12 W | 0 + exhaust | none | 1 | 0 | 37 W | 32 W |
| GF-07 Enclosed booth | 45 | 2 | 3 x LED downlight 12 W | 0 | none | 2 | 0 | 166 W | 113 W |
| GF-08 Balcony cafe | 204 | 6 | 3 x LED batten 20 W (IP65 outdoors) | 2 | BLDC fans | 4 | 1 | 520 W | 379 W |
| GF-09 Lounge and presentation hall | 300 | 24 | 5 x 2x2 LED panel 36 W | 2 | 1.5-ton inverter split, 1.5-ton inverter split | 13 | 3 | 5585 W | 4280 W |
| GF-10 Coworking commons | 386 | 38 | 7 x 2x2 LED panel 36 W | 5 | BLDC fans | 19 | 2 | 2897 W | 1561 W |
| FF-01 Rear support / sanitary | 85 | 0 | 2 x LED downlight 12 W | 0 + exhaust | none | 1 | 0 | 49 W | 39 W |
| FF-02 Workshop terrace (lab room once enclosed) | 260 | 4 | 8 x 2x2 LED panel 36 W | 2 + exhaust | BLDC fans | 10 | 9 | 3671 W | 2282 W |
| FF-03 Two- and four-person cabins | 228 | 6 | 5 x 2x2 LED panel 36 W | 0 | 0.8-ton inverter split, 0.8-ton inverter split | 7 | 4 | 2350 W | 1507 W |
| FF-04 Stair landing and gallery (twin cabins) | 410 | 8 | 8 x 2x2 LED panel 36 W | 1 | 0.8-ton inverter split, 0.8-ton inverter split | 10 | 4 | 2683 W | 1740 W |
| FF-05 Bathroom | 40 | 0 | 1 x LED downlight 12 W | 0 + exhaust | none | 1 | 0 | 37 W | 32 W |
| FF-06 Office twin cabins | 348 | 8 | 7 x 2x2 LED panel 36 W | 0 | 0.8-ton inverter split, 0.8-ton inverter split | 10 | 4 | 2612 W | 1683 W |

Totals: 91 six-ampere points, 34 sixteen-ampere points (nine of them AC points), 65 luminaires, 14 BLDC fans, 6 exhaust fans, 9 AC units, connected load 25.71 kW.

Room notes:

- GF-01: AC on its own 20 A MCB; 2 duplex desk boards; 1 general 16 A.
- GF-02: Standing check-in; printer on the 16 A point.
- GF-03: No geyser proposed (each would add 2-3 kW).
- GF-04: Four dedicated 16 A points; kettle and microwave on separate MCBs; house rule: not both during an event peak.
- GF-07: Glass-fronted; shares GF-10 air; small oscillating fan point if needed.
- GF-08: IP44 sockets and IP65 fittings; on an RCBO of its own.
- GF-09: 24 audience seats assumed for events (4 lounge chairs day-to-day). Two AC points on 20 A MCBs; AV rack fed from the UPS; 3 audience duplex boards along the walls; projector point at the ceiling opposite the screen wall; PTZ camera facing the screen; mic receiver at the rack.
- GF-10: Three table-mounted power rails (5 duplex each) plus a 4-duplex strip under the window counter; two 16 A general points.
- FF-02: Enclosure is a prerequisite for printers and GPUs (dust, humidity, rain). UPS output DB here: 2 x 16 A GPU, 3 x 16 A printers, 2 x 6 A rack. Raw: bench 6 x 6 A + 2 x 16 A, soldering/extraction 16 A, general 16 A. 500 lux task lighting.
- FF-03: Two cabins: 2-seat (2 duplex) and 4-seat (4 duplex, sliding entrance); one AC and one 16 A general point each.
- FF-04: Two four-table cabins: 4 duplex + AC + 16 A each; landing gets 2 duplex and a fan.
- FF-05: No geyser proposed.
- FF-06: Two four-table cabins: 4 duplex + AC + 16 A each; 2 IP44 duplex on the balcony. These are the largest cabins: if the glazing is unshaded, specify 1-ton units here (about +0.15 kW each running).

### Equipment and AV points (feed shows raw mains or UPS output)

| Room | Item | Connected | Average | Feed | Point |
|---|---|---|---|---|---|
| GF-02 | Display + label printer | 90 W | 40 W | raw | 16A |
| GF-04 | Refrigerator | 300 W | 150 W | raw | 16A |
| GF-04 | Kettle | 1500 W | 0 W | raw | 16A |
| GF-04 | Microwave | 1200 W | 0 W | raw | 16A |
| GF-04 | Water purifier / dispenser (no heating) | 40 W | 40 W | raw | 16A |
| GF-09 | Projector (ceiling) | 350 W | 300 W | ups | 6A |
| GF-09 | Streaming / recording PC + capture | 250 W | 200 W | ups | 6A |
| GF-09 | Active speakers x2 | 120 W | 60 W | ups | 6A |
| GF-09 | Wireless mic receiver + audio interface | 35 W | 30 W | ups | 6A |
| GF-09 | PTZ recording camera (PoE) | 20 W | 20 W | ups | PoE |
| FF-02 | GPU workstation x2 | 1400 W | 1000 W | ups | 16A |
| FF-02 | 3D printers x3 (P1S, A1, one spare bay) | 850 W | 300 W | ups | 16A |
| FF-02 | Network rack: router, PoE switch (10 cams + PTZ), NVR, NAS | 220 W | 200 W | ups | 6A |
| FF-02 | Access controller + 6 door locks/readers (12 V via rack) | 108 W | 108 W | ups | PoE |
| FF-02 | Soldering station + fume extraction | 180 W | 80 W | raw | 16A |
| FF-02 | Bench instruments (scope, PSU, meter) | 150 W | 60 W | raw | 6A |

### CCTV (PoE, NVR in the FF-02 rack on the UPS)

- C1 (GF, GF-02): Main entrance (side C door) from inside reception
- C2 (GF, GF-02): Reception desk and commons door
- C3 (GF, GF-10): Commons, from the curved front wall toward the tables
- C4 (GF, GF-09): Hall wide view including stair foot (separate from the PTZ recording camera)
- C5 (GF, GF-04): Kitchen doorway and GF-09 passage
- C6 (GF, GF-08): Balcony cafe (IP66 dome)
- C7 (FF, FF-04): First-floor landing and gallery void
- C8 (FF, FF-02): Workshop: printers, bench and GPU rack
- C9 (GF, GF-04): Kitchen / rear service door A3 (added so every access door is covered)
- C10 (FF, FF-06): Lower-cabin balcony door A6 and the FF-06 corridor

### Access doors (lock + reader + contact + exit light, on the UPS via the rack)

- A1 (GF, GF-02): Main entrance, side C (4 ft door), about 18 W standing
- A2 (GF, GF-10): Commons street-side door (position to confirm on site), about 18 W standing
- A3 (GF, GF-04): Kitchen / rear service door (position to confirm on site), about 18 W standing
- A4 (FF, FF-04): Stair-head door to the first floor, about 18 W standing
- A5 (FF, FF-02): Workshop terrace door, about 18 W standing
- A6 (FF, FF-06): Lower-cabin balcony door, about 18 W standing

## 3. Load reconciliation against 10 kW

BESCOM bills maximum demand on a 30-minute integrated basis, so three-minute kettle cycles barely register while bulk battery charging and running ACs do. Targets: design case at or below 8 kW, stress cases at or below 10 kW with the house rules in section 6.

**Design case: 25 people concurrent, four cabins in use, GPU job running: 7.42 kW**

- Cabin ACs, 4 of 7 running at 25 C, 85% simultaneity: 1700 W
- Cabin desks, 14 seats at 70%: 931 W
- Commons, 11 seats with laptops: 715 W
- Reception, booth, cafe (partial): 370 W
- Lighting, 50% of installed (daylight): 958 W
- Fans and exhausts, 80%: 512 W
- Workshop: GPUs, printers, rack, bench (average): 1748 W
- Kitchen average (fridge, purifier): 190 W
- Battery chargers at float: 300 W

**Stress case A: all seven cabins full, 21 people in the commons, GPU job running: 10.34 kW**

- Cabin ACs, 7 x 0.8 t inverter at 25 C, 85% simultaneity: 2975 W
- Cabin desks, 26 seats at 70%: 1729 W
- Commons, 21 of 38 seats with laptops: 1365 W
- Reception, booth, cafe (partial): 564 W
- Lighting, 50% of installed (daylight): 958 W
- Fans and exhausts, 80%: 512 W
- Workshop: GPUs, printers, rack, bench (average): 1748 W
- Kitchen average (fridge, purifier; kettle/microwave excluded): 190 W
- Battery chargers at float (UPS + 2 inverters): 300 W

**Stress case B: evening event (24 in the hall, both hall ACs, AV on), two cabins still occupied, GPU job running: 10.68 kW**

- Hall ACs, 2 x 1.5 t inverter running: 2400 W
- Hall AV (projector, PC, audio, camera) average: 610 W
- Hall audience laptops, 12 of 24: 780 W
- Two cabins still occupied (AC + desks); rule: cabin ACs off by the event start: 1532 W
- Commons, 12 seats: 780 W
- Lighting, 75% (evening): 1437 W
- Fans and exhausts, 70%: 448 W
- Workshop average (GPU job running): 1748 W
- Kitchen average + one kettle cycle allowed: 640 W
- Battery chargers at float: 300 W

**Case C: full house plus event plus kitchen peaks plus bulk charging (the rules exist to prevent this): 18.73 kW**

- Cabin ACs, 7 x 0.8 t inverter at 25 C, 85% simultaneity: 2975 W
- Cabin desks, 26 seats at 70%: 1729 W
- Commons, 21 of 38 seats with laptops: 1365 W
- Reception, booth, cafe (partial): 564 W
- Lighting, 50% of installed (daylight): 958 W
- Fans and exhausts, 80%: 512 W
- Workshop: GPUs, printers, rack, bench (average): 1748 W
- Kitchen average (fridge, purifier; kettle/microwave excluded): 190 W
- Battery chargers at float (UPS + 2 inverters): 300 W
- Hall ACs + AV + audience (event on top of full house): 3790 W
- Kettle and microwave together: 2700 W
- Bulk charging all three battery banks (max charger current): 1900 W

Reading: the design case sits at 7.42 kW with 2.6 kW of headroom, which absorbs a post-outage recharge (up to 1.3 kW) or a kettle cycle. Stress case A reaches 10.34 kW only if all 47 modelled seats are occupied at once, which the 25-person cap already rules out. Stress case B drops to 9.1 kW when cabin ACs are off by the event start and to 7.4 kW if GPU jobs are not scheduled during events.

## 4. Phase balance (design case)

- Phase R: 3.2 kW: GF-01 AC (425 W); FF-04 a/b ACs (850 W); GF lighting + fans (474 W); Commons rails 1-2 (10 of 21 laptops) (650 W); GF-01 + FF-04 desks (798 W); Hall AC 1 (event only) (0 W)
- Phase Y: 3.38 kW: FF-03 a/b ACs (850 W); Kitchen (190 W); Reception, booth, cafe (620 W); Commons rails 3 + counter (11 laptops) (715 W); FF lighting + fans (510 W); FF-03 desks (399 W); GF inverter charger (float) (100 W); Hall AC 2 (event only) (0 W)
- Phase B: 3.33 kW: FF-06 a/b ACs (850 W); UPS input: workshop + rack + charger float (1848 W); FF-06 desks (532 W); FF inverter charger (float) (100 W)

Hall AC 1 sits on R and hall AC 2 on Y so an event adds 1.2 kW to each rather than 2.4 kW to one phase. The UPS input is the largest single load and stays on B with the FF-06 cabins.

## 5. Distribution and circuits

- Incomer: BESCOM three-phase sub-meter to a main DB in GF-02 (reception side wall, near the entrance): 40 A four-pole isolator, Type 2 surge protection, then a 32 A TPN MCB feeding two floor sub-DBs and the UPS.
- DB-G (ground, in GF-02): per-phase 30 mA RCCBs, then 10 A lighting MCBs (GF-10 and GF-09 on separate circuits, hall dimmable), 16 A socket MCBs per room group, 20 A MCBs for GF-01 AC, hall AC 1, hall AC 2, four 16 A kitchen circuits (fridge, kettle, microwave, purifier), a dedicated RCBO for the GF-08 balcony (IP44 outlets), and the GF inverter's input.
- DB-F (first, on the FF-04 landing): per-phase 30 mA RCCBs, lighting MCBs, socket MCBs per cabin, six 20 A AC MCBs (FF-03 a/b, FF-04 a/b, FF-06 a/b), workshop raw circuits (bench, soldering and extraction, general), the FF inverter's input, and a 20 A feed to the UPS.
- UPS-DB (in FF-02, fed from the UPS output): 2 x 16 A GPU points, 3 x 16 A printer points, 2 x 6 A rack points, and a dedicated circuit down to the hall AV rack and projector point in GF-09 (run in its own conduit).
- Inverter outputs: GF inverter feeds the GF lighting circuits, the fan circuits, the reception board and two duplex per commons rail through a changeover; FF inverter feeds the FF lighting and fans and one duplex per cabin. AC, kitchen and workshop raw circuits are never on an inverter.
- Cables (contractor to confirm): 1.5 sq mm for lighting, 2.5 sq mm for 6 A socket circuits, 4 sq mm for 16 A and AC circuits, 6 sq mm sub-mains to DB-F and the UPS, all copper FR in concealed conduit; separate earth continuity conductor throughout.
- Earthing: one new earth pit for the building side and a second, dedicated pit for the electronics (UPS output, GPU and AV) to keep noise off the recording chain; test and record both.
- Data: Cat6 from the FF-02 rack to every camera position, the hall PTZ, the projector/PC position, reception, the six access-door controllers and one outlet per cabin; a 16-port PoE switch carries the ten cameras, the PTZ and the door controllers.

## 6. UPS, batteries and inverters

- UPS: 3 kVA online double-conversion (about 2.7 kW at 0.9 pf). Connected UPS load is 3353 W and the average is 2218 W: the average fits, the connected total does not, so either hold printer starts while the hall AV is live, or specify 5 kVA if you want no such rule.
- Battery for two hours at the average load: 4.93 kWh delivered, 6.16 kWh installed at 80% depth of discharge. Recommended: 48 V 120 Ah LiFePO4 (5.8 kWh) minimum; 48 V 150 Ah (7.2 kWh) recommended for headroom. Lead-acid alternative: 4 x 12 V 200 Ah tubular at 48 V (9.6 kWh nominal, ~4.8 kWh usable at 50% DoD): meets 2 h only at average load, ~180 kg, needs a ventilated rack.
- Charger limited to about 500 W and scheduled outside event hours; bulk charging counts fully against the 30-minute demand.
- GF inverter: 2 kVA / 24 V pure sine with 2 x 12 V 150 Ah tubular (3.6 kWh nominal); covers GF lights, 8 BLDC fans, reception board, 2 commons duplex per rail; roughly 1.7 h of backup at the covered load. Chargers about 400 W each in bulk.
- FF inverter: 1.5 kVA / 24 V pure sine with 2 x 12 V 150 Ah tubular (3.6 kWh nominal); covers FF lights, 3 BLDC fans, one duplex per cabin; roughly 2.4 h of backup at the covered load. Chargers about 400 W each in bulk.
- Location: UPS and its battery in FF-02 on a ventilated rack; GF inverter and batteries in GF-02 beside the main DB; FF inverter beside DB-F on the landing. Lithium indoors is fine; tubular lead-acid needs ventilation and a drip tray.

## 7. House rules that keep the site under 10 kW

1. Cabin ACs run at 25 to 26 C; hall ACs run only during events and the cabin ACs go off by the event start.
2. GPU training jobs are scheduled outside event hours; short inference or CAD work is fine any time.
3. Kettle and microwave are on separate circuits and not used together during an event peak; no geysers or heaters anywhere.
4. Battery chargers are current-limited and bulk-charge at night; after a daytime outage, expect up to 1.3 kW of recharge on top of the running load.
5. An energy monitor with per-phase clamps at the main DB shows live demand on the reception screen; at 9 kW it flags, at 9.5 kW the hall AC 2 contactor drops out.

## 8. What this does not cover

- The FF-02 enclosure itself (structure, weathering, ventilation) is a prerequisite for the lab room and is not designed here.
- Fire alarm, emergency lighting and any BBMP or fire-NOC requirements for a commercial use in a residential building.
- Final AC unit selection; the 0.8-ton figure assumes 3 to 4 person cabins with glazing shaded. FF-06's larger cabins may need 1-ton units, which adds about 0.15 kW each.
- Real socket positions in three dimensions; the CAD electrical plans that follow this brief place them in plan.