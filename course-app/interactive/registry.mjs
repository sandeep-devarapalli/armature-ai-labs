export const scenes = Object.freeze({
  'srm-exploded': { title: 'Inside a switched reluctance motor', label: 'Rotor pulled out', min: 0, max: 40, step: 5, initial: 25, unit: 'mm', kind: '3d', description: 'An 8/6 switched reluctance motor about 40 mm across: a laminated steel stator with 8 wound poles (4 phases) and a laminated 6-tooth steel rotor on its shaft. There are no magnets anywhere. Slide the rotor out of the stator to see the parts.' },
  'srm-rotation': { title: 'Which phase fires', label: 'Rotor angle', min: 0, max: 60, step: 1, initial: 5, unit: '°', kind: '3d', description: 'End view of an 8/6 switched reluctance motor. Each phase fires while a rotor tooth is up to 15° short of lining up with its pair of poles, then hands over to the next phase.' },
  'axial-exploded': { title: 'Inside an axial-flux motor', label: 'Rotors pulled apart', min: 0, max: 40, step: 5, initial: 20, unit: 'mm', kind: '3d', description: 'Our twin-rotor axial-flux motor, about 120 mm across and 44 mm thick: a yokeless stator of 12 coil-wound, skewed teeth between two steel rotor discs, each carrying 10 magnets (red north, blue south). Slide the rotors apart along the shaft to see the parts.' },
  'bldc-rotating-field': { title: 'Six-step commutation, step by step', label: 'Rotor angle', min: 0, max: 360, step: 5, initial: 20, unit: '°', kind: '3d', description: 'End view of a simple brushless motor with three phase coils and a two-pole rotor, so electrical and mechanical angles are equal. Three Hall sensors give the rotor angle in 60° sectors; the controller drives two phases, and their field (blue arrow) leads the rotor by 60 to 120 degrees.' },
  'srm-gap': { title: 'Air gap and flux without magnets', label: 'Air gap', min: .1, max: .3, step: .01, initial: .1, unit: 'mm', kind: '3d', description: 'One stator pole above one rotor tooth, with the air gap drawn 60 times larger. With no magnet in the path, the gap is almost all of the reluctance, so flux falls quickly as the gap grows.' },
  'milling-workholding': { title: 'Strap clamp support and load', label: 'Screw position from work contact', min: .2, max: .8, step: .1, initial: .3, unit: 'of span', kind: '3d', description: 'A level idealized strap rests on the work and a separate heel support. Move the screw between these contacts. Static moment balance predicts the share of screw force at each support; real stiffness, contact, friction, fastener capacity and the machine manual govern a usable setup. This is not a torque recommendation.' },
  'lathe-motion': { title: 'Axial feed and work rotation', label: 'Spindle turns', min: 0, max: 10, step: .25, initial: 0, unit: 'turns', kind: '3d', description: 'A lathe turning a shoulder: the work and chuck rotate about Z while the carriage feeds the tool towards the headstock, leaving the smaller turned diameter behind it. The model uses a fixed 0.2 mm per revolution, drawn ten times larger so the feed is visible; radial infeed on the cross-slide sets the diameter separately.' },
  'tool-geometry': { title: 'Rake and cutting wedge', label: 'Positive rake angle', min: 0, max: 25, step: 1, initial: 10, unit: '°', kind: '3d', description: 'A section normal to the cutting edge shows rake, wedge and a fixed 7° clearance. Their sum is 90°. Increasing rake reduces wedge support. This is geometry, not a tool-selection recommendation.' },
  'lathe-taper': { title: 'Taper half-angle', label: 'Half-angle', min: 0, max: 10, step: .5, initial: 4, unit: '°', kind: '3d', description: 'A 50 mm long taper starts at a 30 mm diameter. The diameter change is twice the length times tan(half-angle). The included angle is twice the half-angle.' },
  'lathe-thread': { title: 'Single-start thread lead', label: 'Pitch', min: 1, max: 5, step: .25, initial: 2, unit: 'mm', kind: '3d', description: 'A single-start 60° thread on a 20 mm bar, generated from the pitch, with a form tool sitting in the groove. One revolution advances by one pitch. Thread depth follows the basic 0.6134 × pitch form; it is a geometry model, not a cutting-force model.' },
  'milling-motion': { title: 'Cutter rotation and chip load', label: 'Spindle angle', min: 0, max: 360, step: 15, initial: 0, unit: '°', kind: '3d', description: 'A four-flute end mill cuts a slot. Each tooth takes 0.05 mm, so the cutter advances 0.20 mm per revolution relative to the work; the feed is drawn ten times larger so it is visible. The highlighted flute is the one cutting, and chips leave from the cut. Material removal is shown schematically.' },
  'milling-index': { title: 'Equal angular divisions', label: 'Number of divisions', min: 3, max: 24, step: 1, initial: 6, unit: '', kind: '3d', description: 'A 40:1 dividing head: the crank turns 40 divided by the count per division. The model picks a standard index-plate hole circle that gives the fractional turn exactly, and sets the sector arms to that many holes.' },
  'bevel-hypoid': { title: 'Bevel or hypoid: do the shafts meet?', label: 'Pinion shaft offset', min: 0, max: 20, step: 2, initial: 10, unit: 'mm', kind: '3d', description: 'Our 15-tooth pinion and 45-tooth bevel gear (3:1), shafts at right angles. At zero offset the two shafts meet at one point: a bevel pair. Slide the pinion shaft sideways and the shafts pass each other: a hypoid. The offset lets a bigger, stronger pinion fit, but the teeth start to slide along each other.' },
  'worm-backdrive': { title: 'Can the wheel drive the worm back?', label: 'Friction coefficient', min: .02, max: .12, step: .01, initial: .05, unit: '', kind: '3d', description: 'Our 40:1 worm set: a single-start steel worm of 16 mm pitch diameter, lead angle 3.58 degrees, driving a 40-tooth bronze wheel. A load tries to turn the wheel backwards. If the friction angle is smaller than the lead angle, the wheel drives the worm back; if it is larger, the set locks.' },
  'differential-turn': { title: 'A differential in a turn', label: 'Turn radius', min: 1, max: 10, step: .5, initial: 2, unit: 'm', kind: '3d', description: 'An open differential (carrier case left out) driving two wheels 0.50 m apart, with 0.10 m wheels and the robot centre moving at 1.0 m/s. Arrows show each wheel speed. The carrier always turns at the average of the two wheel speeds, and the spider gears spin on their pin to make up the difference.' },
  'rv-two-stage': { title: 'Turning an RV reducer', label: 'Input angle', min: 0, max: 1080, step: 15, initial: 360, unit: '°', kind: '3d', description: 'Our 121:1 RV reducer pulled apart along its shaft: a 12-tooth input pinion turns three 36-tooth crank gears; each crank wobbles two 39-lobe discs, half a turn apart, against 40 housing pins; the green carrier holding the cranks is the output. Turn the input and watch the cranks turn three times slower while the output creeps round.' },
  'pic-timing': { title: 'Oscillator and instruction timing', label: 'Oscillator frequency', min: 1, max: 20, step: 1, initial: 4, unit: 'MHz', kind: '2d', description: 'For the PIC mid-range timing model used here (the PIC16F84A is rated to 20 MHz), four oscillator periods make one instruction cycle. A normal instruction uses one cycle; a taken control-flow change can use two. Device-specific instructions and clock configuration still need checking.' },
  'pic-register': { title: 'An eight-bit output latch', label: 'Unsigned latch value', min: 0, max: 255, step: 1, initial: 85, unit: '', kind: '2d', description: 'Bit 7 has weight 128 and bit 0 has weight 1. A one in an output latch requests a high level only when the corresponding pin is configured as a digital output. Actual pin current and alternate functions are separate constraints.' },
});
// Standard index-plate hole circles (Brown and Sharpe plates 1 to 3).
const HOLE_CIRCLES = [18, 15, 16, 17, 19, 20, 21, 23, 27, 29, 31, 33, 37, 39, 41, 43, 47, 49];
export function indexingPlan(n) {
  const turns = Math.floor(40 / n), rem = 40 % n;
  if (rem === 0) return { turns, holes: 0, circle: 20 };
  const circle = HOLE_CIRCLES.find(h => (h * rem) % n === 0);
  return circle ? { turns, holes: (circle * rem) / n, circle } : { turns, holes: 0, circle: 20 };
}
// 8/6 switched reluctance motor: rotor teeth at (deg - 15) + 60k degrees, phase p poles at 45p (and 45p + 180).
// The firing phase is the one whose nearest rotor tooth is 0 to 15 degrees short of lining up.
// Six-step commutation for a two-pole motor: coil axes A 90, B 210, C 330 degrees (screen, counter-clockwise).
// Sector k covers rotor angles 60k to 60k + 60; the driven pair's field points at 60(k + 1) degrees and the rotor's north pole at angle - 60,
// so the field leads the rotor by 60 to 120 degrees (90 at mid-sector).
export function bldcSixStep(deg) {
  const d = ((deg % 360) + 360) % 360, k = Math.min(5, Math.floor(d / 60));
  const code = ['101', '100', '110', '010', '011', '001'][k], pair = [['A', 'B'], ['A', 'C'], ['B', 'C'], ['B', 'A'], ['C', 'A'], ['C', 'B']][k];
  const field = [60, 120, 180, 240, 300, 0][k], north = d - 60, lead = (((field - north) % 360) + 360) % 360;
  return { sector: k, code, plus: pair[0], minus: pair[1], field, north, lead };
}
// Worm set of Lesson 6.5: lead angle atan(lead / (pi d)) for a single start, module 1 mm, 16 mm pitch diameter.
export const WORM_LEAD_DEG = Math.atan(Math.PI * 1 / (Math.PI * 16)) * 180 / Math.PI;
export function wormLock(mu) {
  const lam = WORM_LEAD_DEG * Math.PI / 180, phi = Math.atan(mu);
  const forward = Math.tan(lam) / Math.tan(lam + phi), backward = lam > phi ? Math.tan(lam - phi) / Math.tan(lam) : 0;
  return { lead: WORM_LEAD_DEG, friction: phi * 180 / Math.PI, forward, backward, locked: lam <= phi };
}
// Differential of Lesson 6.6: track 0.50 m, wheel radius 0.10 m, centre speed 1.0 m/s; 16-tooth side gears, 10-tooth spiders.
export function diffTurn(radius, track = .5, wheel = .1, speed = 1) {
  const inner = speed * (radius - track / 2) / radius / wheel, outer = speed * (radius + track / 2) / radius / wheel;
  return { inner, outer, carrier: (inner + outer) / 2, spider: (outer - inner) / 2 * 16 / 10 };
}
// RV reducer of Lesson 8.4: R = (Z2 / Z1) * Zp + 1 with Z1 = 12, Z2 = 36, Zp = 40. Angles in degrees.
export const RV = { z1: 12, z2: 36, pins: 40, ratio: 36 / 12 * 40 + 1 };
export function rvAngles(input) {
  const output = input / RV.ratio, crank = -(input - output) * RV.z1 / RV.z2;   // crank turn relative to the carrier
  return { output, crank, eccentric: output + crank };
}
export function srmFiring(deg) {
  for (let p = 0; p < 4; p++) { const d = (((45 * p - (deg - 15)) % 60) + 60) % 60; if (d > 1e-9 && d <= 15 + 1e-9) return { phase: p, gap: Math.round(d) }; }
  return { phase: 0, gap: 15 };
}
export function validInteractive(c) {
  if (!c || typeof c !== 'object' || !Object.hasOwn(scenes, c.sceneId)) return false;
  const spec = scenes[c.sceneId];
  if (Object.keys(c).some(k => !['sceneId','parameters','caption','svgCode','description'].includes(k))) return false;
  if (['caption','svgCode','description'].some(k => typeof c[k] !== 'string' || !c[k].trim())) return false;
  if (!c.parameters || typeof c.parameters !== 'object' || Array.isArray(c.parameters) || Object.keys(c.parameters).some(k => k !== 'value')) return false;
  const v = c.parameters.value;
  return Number.isFinite(v) && v >= spec.min && v <= spec.max && Math.abs((v-spec.min)/spec.step-Math.round((v-spec.min)/spec.step)) < 1e-8;
}
export function measurements(id, value) {
  switch (id) {
    case 'milling-workholding': return `Ideal work-contact force: ${((1-value)*100).toFixed(0)}% of screw force; heel reaction: ${(value*100).toFixed(0)}%. Both contacts must remain supported.`;
    case 'lathe-motion': return `Axial advance: ${(value*.2).toFixed(2)} mm at 0.20 mm/rev.`;
    case 'tool-geometry': return `Rake ${value}° + clearance 7° + wedge ${83-value}° = 90°.`;
    case 'lathe-taper': return `Small diameter: ${(30-100*Math.tan(value*Math.PI/180)).toFixed(2)} mm; included angle: ${value*2}°.`;
    case 'lathe-thread': return `Lead: ${value.toFixed(2)} mm/rev; turns over 40 mm: ${(40/value).toFixed(2)}.`;
    case 'milling-motion': return `Four teeth × 0.05 mm/tooth = 0.20 mm/rev. Advance: ${(value/360*.2).toFixed(3)} mm.`;
    case 'milling-index': { const p = indexingPlan(value); return `Index angle: ${(360/value).toFixed(3)}°. A 40:1 head needs ${(40/value).toFixed(4)} crank turns per division: ${p.holes ? `${p.turns} turns + ${p.holes} holes on a ${p.circle}-hole circle` : `${p.turns} whole turns`}.`; }
    case 'pic-timing': return `Oscillator period: ${(1/value).toFixed(3)} µs. Instruction cycle: ${(4/value).toFixed(3)} µs; two cycles: ${(8/value).toFixed(3)} µs.`;
    case 'pic-register': return `Binary ${value.toString(2).padStart(8,'0')}; hexadecimal 0x${value.toString(16).toUpperCase().padStart(2,'0')}; unsigned decimal ${value}.`;
    case 'srm-exploded': return value === 0 ? 'Assembled: the 6-tooth rotor sits inside the 8-pole stator bore, separated by an air gap of a few tenths of a millimetre.' : `Rotor pulled out ${value} mm along its shaft. Parts: laminated steel stator, 8 copper coils (4 phases), laminated 6-tooth steel rotor and shaft. No magnets anywhere.`;
    case 'srm-rotation': { const f = srmFiring(value), L = 'ABCD'; return `Phase ${L[f.phase]} is on: the nearest rotor tooth is ${f.gap}° short of lining up with its poles. Next to fire: phase ${L[(f.phase + 3) % 4]}. At 3 A one phase makes about 0.055 N·m while the teeth close in (linear model). The phases fire A, D, C, B as the rotor turns forwards.`; }
    case 'axial-exploded': return value === 0 ? 'Assembled: the stator sits between the two rotors with a 1 mm air gap on each side, and the magnets pull both rotors towards it.' : `Rotors pulled ${value} mm out along the shaft. Parts: two steel rotor discs with 10 magnets each, and a stator of 12 pressed teeth with 12 coils and no steel back plate. Gap faces from 35 to 60 mm: at 21 kPa the two faces give about 15 N·m.`;
    case 'bldc-rotating-field': { const s = bldcSixStep(value); return `Rotor at ${value}°: Hall code ${s.code}, so the controller drives ${s.plus}+ ${s.minus}−. The stator field points at ${s.field}° and leads the rotor's north pole by ${s.lead}°, giving ${Math.round(Math.sin(s.lead * Math.PI / 180) * 100)} % of the maximum torque (best at 90°).`; }
    case 'srm-gap': { const rel = .12 / (value + .02), mag = (2.86 + .10) / (2.86 + value); return `Aligned flux is ${(rel * 100).toFixed(0)} % of its value at 0.10 mm, so torque falls by about ${((1 - rel) * 100).toFixed(0)} % (linear model, steel worth 0.02 mm of air). The same gap change would cost our magnet motor only ${((1 - mag) * 100).toFixed(1)} %.`; }
    case 'bevel-hypoid': return value === 0 ? 'Bevel: the two shafts meet at one point. 15 and 45 teeth give 3:1; the teeth roll on each other, typically 95 to 99 % efficient.' : `Hypoid: the pinion shaft passes ${value} mm from the gear's axis, so the shafts no longer meet. The offset fits a bigger, stronger pinion and keeps more teeth in contact, but the teeth now slide as they roll: typically 90 to 95 % efficient, with special oil.`;
    case 'worm-backdrive': { const w = wormLock(value); return `Friction ${value.toFixed(2)}: friction angle ${w.friction.toFixed(2)}° against a lead angle of ${w.lead.toFixed(2)}°. ` + (w.locked ? `The friction angle is larger, so the wheel cannot drive the worm: the set locks. Forward efficiency only ${Math.round(w.forward * 100)} %.` : `The lead angle is larger, so the wheel can drive the worm backwards at ${Math.round(w.backward * 100)} % efficiency. Forward efficiency ${Math.round(w.forward * 100)} %.`); }
    case 'differential-turn': { const d = diffTurn(value); return `Turn radius ${value.toFixed(1)} m at 1.0 m/s: inner wheel ${d.inner.toFixed(2)} rad/s, outer wheel ${d.outer.toFixed(2)} rad/s. The carrier turns at their average, ${d.carrier.toFixed(1)} rad/s, and the spider gears spin on their pin at ${d.spider.toFixed(2)} rad/s. The torque on the two wheels stays equal.`; }
    case 'rv-two-stage': { const r = rvAngles(value); return `Input turned ${value}°. The cranks have turned ${Math.abs(r.crank).toFixed(1)}° the other way relative to the carrier, wobbling the discs with them; the carrier, the output, has turned ${r.output.toFixed(2)}°, the input ÷ ${RV.ratio}. One output turn takes ${RV.ratio} input turns.`; }
    default: return '';
  }
}
