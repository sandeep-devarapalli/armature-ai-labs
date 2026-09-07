# Robotics Lab: Cost, Equipment, and Revenue Model

**A 3,500 sq ft physical AI lab in HSR Layout, Bengaluru: ten zones, sixteen dedicated builder pods, nine cameras**

*Planning estimates, not quotes. Equipment prices move, and final numbers depend on brands, negotiation, and your actual usage. Treat this as a model to pressure-test, and validate the big-ticket items with live vendor quotes and the financials with your CA. This is not financial advice.*

---

## The headline numbers

| Metric | Estimate |
|---|---|
| One-time equipment and fit-out (capex) | **₹45 to 50 lakh lean, ₹70 to 80 lakh full** |
| Monthly running cost (opex, cash) | **~₹7.65 lakh** |
| Monthly break-even (cash) | **~₹7.65 lakh of revenue** |
| Monthly break-even (including equipment depreciation) | **~₹9.2 lakh of revenue** (full ₹75 L build) |
| What gets you there | **2 to 3 company tenants, a base of members and pods, plus workshops and programs** |

The single biggest swing factor on both sides is the company tier. Individual and serious-builder memberships cover the community and keep the room alive, but company tenants are what push the lab into profit.

---

# Part 1: What to buy, and what it costs

Recommendations below assume a lab that can genuinely support manipulation, drones, prototyping, electronics, and edge AI. Quantities are a sensible starting point for a 16-to-25-person room, not a maximum.

## Compute and AI

| Item | Suggested pick | Qty | Est. unit | Est. total |
|---|---|---|---|---|
| Personal AI supercomputer | NVIDIA DGX Spark (128 GB, GB10) | 1 | ₹5.5 L | ₹5.5 L |
| Training / CAD / sim workstation | RTX 4090 or 5090 class desktop | 2 | ₹3.5 L | ₹7.0 L |
| Edge AI dev kits | Jetson Orin Nano Super (not the old Nano, which is end-of-life) | 6 | ₹37 k | ₹2.2 L |
| Single-board computers | Raspberry Pi 5 (8 GB) full kits | 10 | ₹9 k | ₹0.9 L |
| Storage / NAS | Network storage for datasets and footage | 1 | ₹1.5 L | ₹1.5 L |
| Networking | WiFi 7 APs, managed switch, router, cabling | 1 | ₹1.0 L | ₹1.0 L |
| **Subtotal** | | | | **₹18.1 L** |

A note on the DGX Spark: one is plenty to start, and it is the marquee piece the company tier will pay for. Add a second only when a paying tenant needs dedicated time. The RTX workstations do the everyday training, simulation, and CAD load.

## 3D printing and rapid prototyping

| Item | Suggested pick | Qty | Est. unit | Est. total |
|---|---|---|---|---|
| FDM printers | Bambu Lab X1C / P1S class | 3 | ₹0.8 L | ₹2.4 L |
| Resin (MSLA) printer + wash and cure | For fine detail parts | 1 | ₹0.7 L | ₹0.7 L |
| Large-format / industrial FDM | For bigger enclosures and jigs | 1 | ₹3.0 L | ₹3.0 L |
| Laser cutter / engraver | Enclosures, acrylic, wood | 1 | ₹1.5 L | ₹1.5 L |
| Starting filament and resin stock | | | | ₹0.5 L |
| **Subtotal** | | | | **₹8.1 L** |

## Machine shop and fabrication

| Item | Qty | Est. total |
|---|---|---|
| Benchtop CNC mill / router | 1 | ₹2.0 L |
| Drill press, bench grinder, vises, hand and power tools | set | ₹1.0 L |
| Dust and chip extraction | 1 | ₹0.5 L |
| **Subtotal** | | **₹3.5 L** |

## Electronics, PCB, and assembly

| Item | Qty | Est. total |
|---|---|---|
| ESD workbenches with mats and grounding | 4 | ₹1.2 L |
| Soldering and hot-air rework stations | 4 | ₹0.8 L |
| Oscilloscopes (mid-range) | 2 | ₹1.2 L |
| Bench power supplies, multimeters, function generator, logic analyzers | set | ₹1.0 L |
| Benchtop reflow oven, stencils, manual pick-and-place (outsource fab to JLCPCB / PCB Power) | 1 | ₹1.5 L |
| Component inventory (ICs, passives, connectors, modules, wiring, breadboards) | | ₹2.0 L |
| Microcontroller and dev boards (ESP32, STM32, Arduino) | | ₹0.5 L |
| **Subtotal** | | **₹8.2 L** |

On PCBs: do not try to run a full PCB fab in-house. Keep design and assembly local (reflow, rework, inspection) and outsource board fabrication to JLCPCB or PCB Power, who turn boards around cheaply in days. This saves several lakhs and a lot of maintenance.

## Sensors

| Item | Qty | Est. total |
|---|---|---|
| Depth cameras (Intel RealSense / Luxonis OAK-D) | 4 | ₹1.6 L |
| LiDAR (2D RPLiDAR ×2 plus one 3D unit) | 3 | ₹1.8 L |
| IMUs, force/torque sensors, encoders, ToF, environmental sensors | set | ₹1.0 L |
| GPS / RTK module for drones | 1 | ₹0.5 L |
| **Subtotal** | | **₹4.9 L** |

## Robotics: arms, drones, mobile

| Item | Suggested pick | Qty | Est. total |
|---|---|---|---|
| Collaborative robot arm (the marquee "arm bay") | UFactory xArm 6 or similar | 1 | ₹7.0 L |
| Educational / desktop arms | Elephant Robotics myCobot class | 2 | ₹3.0 L |
| Drone flight cage (netting, frame, matting) | 1 | ₹2.0 L |
| Test drones and FPV kits, spares | | ₹2.5 L |
| Mobile robot base / AMR (optional, phase 2) | 1 | ₹3.0 L |
| **Subtotal** | | **₹17.5 L** |

The one serious collaborative arm is non-negotiable if you want to sell "robotic arm bay" access. The educational arms and AMR can wait for phase 2.

## Lab infrastructure and fit-out

| Item | Est. total |
|---|---|
| Electrical: 5 distribution boards, 3-phase wiring, isolation, UPS, earthing | ₹5.0 L |
| HVAC, ventilation, and fume / dust extraction | ₹2.5 L |
| 9 IP cameras plus NVR and storage | ₹1.5 L |
| Access control (RFID / badge) and booking kiosk | ₹1.0 L |
| Fire safety: extinguishers, LiPo cabinet, smoke detection | ₹1.0 L |
| Furniture, shelving, ESD storage, lockers, 16 pod desks | ₹2.0 L |
| Demo-floor AV (screen, projector) | ₹1.0 L |
| Safety, PPE, signage | ₹0.5 L |
| **Subtotal** | **₹14.5 L** |

At 3,500 sq ft this fit-out line is tight: hold ₹1.5 to 2 lakh of contingency for the longer electrical and HVAC runs and the pod furniture. The electrical fit-out is the least glamorous and one of the most important lines. Three-phase for the arm and machine shop, clean isolated circuits for electronics and compute, and a UPS for the control room are what let everything else run safely.

## Capex summary

| Category | Full build |
|---|---|
| Compute and AI | ₹18.1 L |
| 3D printing and prototyping | ₹8.1 L |
| Machine shop | ₹3.5 L |
| Electronics and PCB | ₹8.2 L |
| Sensors | ₹4.9 L |
| Robotics | ₹17.5 L |
| Infrastructure and fit-out | ₹14.5 L |
| **Total (full)** | **~₹74.8 L** |

**Lean version (~₹45 to 50 L):** one collaborative arm only, drop the AMR and the industrial FDM, one workstation instead of two, a basic laser, skip the CNC at launch, and trim sensor and component stock. You keep the DGX Spark, the arm, the printers, the benches, and the full fit-out, which is enough to open and start earning.

---

# Part 2: Monthly running costs

| Line item | Monthly estimate | Notes |
|---|---|---|
| Rent | ₹3,00,000 | ~₹85 per sq ft for 3,500 sq ft in HSR |
| Electricity | ₹1,00,000 | See calculation below |
| Staff | ₹1,50,000 | Lab manager, 1 technician, 1 front-desk / community |
| Internet and leased line | ₹20,000 | Business fiber plus backup |
| Consumables | ₹50,000 | Filament, resin, solder, components, PPE, wear parts |
| Software and cloud | ₹25,000 | CAD, simulation, licenses, backup |
| Insurance | ₹20,000 | Equipment and public liability |
| Maintenance and AMC | ₹30,000 | Servicing, calibration, repairs |
| Marketing, events, community | ₹40,000 | |
| Admin, accounting, misc | ₹30,000 | |
| **Total cash opex** | **~₹7,65,000** | |

**If you amortize the equipment**, ₹75 lakh of capex over a 4-year life adds roughly **₹1.5 lakh per month** of depreciation, so the true cost to cover is closer to **₹9.2 lakh per month**.

### The electricity estimate

Bangalore's commercial tariff (BESCOM LT-3) is roughly **₹8 to 8.9 per unit** in energy charges, and with the 6 percent electricity duty and fuel adjustment it lands near **₹9 per unit all-in**, plus a fixed charge of about **₹210 per kW** of sanctioned load.

For a 3,500 sq ft lab, air conditioning is the dominant load (a space this size needs roughly 22 to 28 tons of cooling), with equipment, lighting, and compute on top. A realistic average draw during operating hours is 22 to 26 kW, which works out to roughly **8,500 units per month**.

- Energy: 8,500 units × ₹9 = **₹76,500**
- Fixed charge: ~60 kW sanctioned × ₹210 = **₹12,600**
- Rounded with seasonal AC swing: **₹90,000 to ₹1,10,000 per month**

I have used ₹1,00,000 in the model. In peak summer months it will run higher; in mild months lower.

---

# Part 3: What to charge

For context, generic dedicated desks in HSR and Koramangala run **₹7,000 to ₹15,500 per seat per month**, and premium operators (WeWork, IndiQube) sit around **₹9,000 and up**. A robotics lab justifies a premium over plain co-working because the value is the equipment access, not the chair. People pay to use a ₹7 lakh arm and a DGX Spark they could never buy alone.

## Tier 1: Individual builders, just starting out

The on-ramp: students, hobbyists, and early builders. Priced to be accessible, designed to convert into Tier 2.

- **Day pass:** ₹500 to ₹800 per day (bench, Pi/Jetson, basic prototyping).
- **Starter membership:** ₹3,500 to ₹5,000 per month, including a set number of hours, community access, and basic bench and printer time.
- **Hourly workstation:** ₹150 to ₹300 per hour for electronics bench or prototyping.
- Premium equipment (arm, drone cage, CNC) billed per hour on top, after a safety induction.

## Tier 2: Serious builders, deeper workflow

Indie hardware founders and prosumers who live in the lab. This is your core membership.

- **Membership:** ₹10,000 to ₹15,000 per month, including a dedicated bench, a storage locker, a generous monthly quota of printer and arm and CNC hours, priority booking, and some compute time.
- **Add-ons:** extra arm-bay or drone-cage hours, DGX/GPU time, after-hours access.
- Positioned just above premium co-working, because they get a lab, not a desk.

## Between the tiers: dedicated builder pods

Sixteen dedicated desks in the pods zone: your own desk, locker, monitor, clean power, and 24/7 access, on top of the standard equipment quotas.

- **Pod:** ₹8,000 to ₹12,000 per month per desk, priced between a serious membership and a company seat.
- **At capacity:** 16 pods at ~₹10,000 is **₹1.6 lakh per month** of recurring floor revenue before anyone touches an arm.
- Pods convert serious builders into residents, and residents into first hires and first tenants.

## Tier 3: Companies renting the workspace

Hardware startups and corporate teams who want a lab without the ₹75 lakh capex. This is the revenue engine.

- **Per seat:** ₹18,000 to ₹30,000 per seat per month, a clear premium over the ₹9,000 to ₹15,000 generic co-working seat, justified by equipment and compute access.
- **Team package:** ₹1.5 to ₹4 lakh per month for a dedicated project bay, a block of seats, secure storage for their own kit, a compute allocation (GPU or DGX time), and sensor and equipment access.
- **Add-ons:** dedicated DGX time, a private cabin, extended storage, priority on the arm and drone cage.

The pitch to a company is simple: a single collaborative arm plus a DGX plus a proper electronics setup is ₹15 to 20 lakh of capex and months of procurement. You give them all of it, plus storage and a team space, for a predictable monthly fee.

## Tier 4: Paid workshops

Hands-on AI/ML and physical AI workshops where participants pay **₹5,000 to ₹10,000 per seat** and spend the day building on the real kit: Jetson Orin Nanos, the DGX Spark, sensors, and the arm. Formats: edge AI 101, vision on Jetson, LLMs on-prem, drone autonomy, robot arm basics.

- **Per seat:** ₹5,000 (half-day, Jetson-class) to ₹10,000 (full-day, DGX and arm access).
- **Per workshop:** 12 to 15 seats is the sweet spot for hands-on quality, so one workshop grosses **₹60,000 to ₹1.5 lakh**, at near-zero marginal cost since the equipment is already on the floor.
- **Cadence:** 2 to 4 per month alongside normal operations; corporates book private editions at a premium.
- **The funnel effect:** workshops are also the top of the membership funnel. The person who spent a day on the DGX is the most likely to convert to a starter or serious membership.

---

# Part 4: Revenue stream: Physical AI services (on-prem deployments)

Beyond the room itself, the lab's fourth revenue stream is deploying physical AI for businesses. Hospitals, malls, hotels, manufacturing factories, and educational institutes, anywhere with continuous footfall and a need for smart surveillance and on-site intelligence, get on-prem GPU deployments so their LLM and physical AI use cases run locally: privacy-sensitive video analytics, people counting and flow, safety and PPE compliance, intrusion and anomaly detection, and site-specific assistants that cannot leave the premises.

**Why on-prem wins these deals:** continuous video cannot economically stream to the cloud, and hospitals and factories often cannot legally or practically send footage out. A local GPU box (Jetson-class at the edge, RTX or DGX-class on site) solves cost, latency, and privacy in one move, and the lab is the team that specs, deploys, and maintains it.

**The model:**

| Component | Pricing shape |
|---|---|
| Site assessment and pilot | ₹1 to 3 L one-time |
| Hardware deployment (edge boxes, cameras, server) | Cost + 20 to 30 percent margin, or bundled into the subscription |
| Managed service subscription | ₹40,000 to ₹1.5 L per site per month, by camera count and use cases |
| Custom model / integration work | ₹2 to 10 L per project |

**What it adds:** even 3 to 4 managed sites at ~₹75k/month average is ₹2.25 to 3 L of recurring revenue, comparable to two company tenants, with the lab's residents and equipment doing the integration work. It also feeds the flywheel: service contracts fund hardware, deployments generate the datasets the institute publishes, and client sites become case studies that attract tenants.

**Ramp note:** treat services as a phase-2 stream. Land the first pilot from the HSRFC network once the lab is open, prove one lighthouse site (one hospital or one factory), then productize.

## The other service streams the floor sells

The same room supports a family of program and project revenue, run on equipment that is already paid for:

| Stream | Pricing shape |
|---|---|
| Hackathon-based hiring (sponsored editions) | ₹2 to 5 L per edition plus a per-hire fee |
| Corporate / employee training cohorts | ₹1.5 to 4 L per cohort |
| Student research programs (college-linked) | Per student or per batch |
| Certification sprints (4-week, capstone) | Per seat |
| Demo days, meetups, venue hire | ₹25,000 to ₹75,000 per evening |
| Prototyping as a service | ₹2 to 15 L per project |
| Commissioned datasets, residencies, equipment with operator, sourcing, sponsorships | Per project / monthly / annual |
| Build-your-own AI data centre (spec, assemble, tune, per the open-source autonomous-computer guide) | Hardware at cost plus 20 to 30 percent margin, ₹1 to 15 L margin per build |

In the site model these are two controls: data centre builds (per quarter, margin per build) and programs (per month, average value). At the defaults of one build a quarter at ₹4 lakh margin and one program a month at ₹1.5 lakh, they add **~₹2.8 lakh a month**.

---

# Part 5: Revenue and break-even

Cash break-even is **~₹7.65 lakh per month**. Here are three ways the room can fill.

## Conservative (ramp, months 1 to 3)

| Source | Detail | Revenue |
|---|---|---|
| Individual starters | 5 × ₹4,000 | ₹20,000 |
| Serious builders | 5 × ₹12,000 | ₹60,000 |
| Dedicated pods | 2 × ₹10,000 | ₹20,000 |
| Company tenant | 1 × ₹1,50,000 | ₹1,50,000 |
| Hourly / day-pass drop-ins | | ₹20,000 |
| Events / workshops | | ₹20,000 |
| **Total** | | **₹2,90,000** |

This is a planned loss. You will burn roughly ₹4.75 lakh a month early on, so budget 6 to 9 months of runway on top of capex.

## Base (steady state, months 6 to 12)

| Source | Detail | Revenue |
|---|---|---|
| Individual starters | 10 × ₹4,000 | ₹40,000 |
| Serious builders | 12 × ₹12,000 | ₹1,44,000 |
| Company tenants | 3 × ₹1,50,000 | ₹4,50,000 |
| Workshops | 2/month × ~₹80,000 gross | ₹1,60,000 |
| Programs (hackathon hiring, training, prototyping) | 1/month × ₹1,50,000 | ₹1,50,000 |
| Data centre builds | 1/quarter × ₹4,00,000 margin | ₹1,33,000 |
| Arm / drone / CNC hourly usage and events | | ₹1,00,000 |
| **Total** | | **~₹11,77,000** |

This mirrors the default position of the calculator on armatureailabs.com. It clears the ₹7.65 lakh cash opex and the ₹1.04 lakh Phase 1 depreciation with roughly ₹3.1 lakh to spare. Note that the three company tenants alone (₹4.5 lakh) cover more than half of cash opex.

## Optimistic (mature, year 2)

| Source | Detail | Revenue |
|---|---|---|
| Serious builders | 15 × ₹12,000 | ₹1,80,000 |
| Dedicated pods | 16 × ₹10,000 | ₹1,60,000 |
| Company tenants | 5 × ₹1,50,000 | ₹7,50,000 |
| Individuals and day passes | | ₹60,000 |
| Equipment hourly usage and events | | ₹1,00,000 |
| Workshops | 4/month × ~₹1,00,000 gross | ₹4,00,000 |
| Physical AI service sites | 2 × ₹75,000 | ₹1,50,000 |
| Programs | 2/month × ₹1,50,000 | ₹3,00,000 |
| Data centre builds | 2/quarter × ₹5,00,000 margin | ₹3,33,000 |
| **Total** | | **~₹24,33,000** |

At this level the lab throws off roughly ₹15 lakh a month after all costs (₹7.65 lakh opex and ₹1.56 lakh full-build depreciation), which is where the capex pays back fast.

## The one number that matters

Everything hinges on company tenants. Each one is worth ₹1.5 to 3 lakh a month, versus ₹12,000 for a serious builder. **Two to three company tenants put you at break-even.** The individual and serious tiers are essential for the community, the events, and the funnel, but the business case rests on landing and keeping a handful of hardware companies. Two additions from the 3,500 sq ft plan change the texture: sixteen pods put a recurring floor of ₹1.3 to 1.9 lakh under every month, and programs plus data centre builds are the lumpy accelerants where a single good month equals a tenant.

---

# Part 6: Why the HSR and Koramangala market supports this

- **The location is the densest hardware and deep-tech startup belt in India.** HSR, Koramangala, Bellandur, and Sarjapur Road hold a large concentration of early-stage startups, including robotics, drones, EV, IoT, agritech, medical devices, and AI hardware teams, exactly the companies that need lab access without buying it.
- **Co-working demand is proven and priced high**, ₹7,000 to ₹25,000 per seat, which means the willingness to pay for workspace already exists. A robotics lab is a differentiated premium on top, with very few direct competitors.
- **The talent pool is huge.** Nearby colleges and a steady stream of engineers feed the individual and serious tiers, and the training programs.
- **You already have distribution.** The HSR Founders Club and Robotics India community networks give you a warm channel to both members and company tenants, which is the hardest and most expensive part of filling a space like this.

The risk to watch: capex is heavy and the ramp is slow, so the company tier has to be sold from day one, ideally with one or two anchor tenants signed before you finish the fit-out.

---

*Figures are planning estimates for a 3,500 sq ft lab in HSR Layout as of mid-2026. Verify equipment with live quotes and the financials with your accountant before committing capital.*
