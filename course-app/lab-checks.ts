import type { LabValues } from './member-api';

// Derived checks shown to learners while they fill a lab form and to assessors while they review it.
// They only read the values present; a check whose inputs are missing is simply not shown.
export interface LabCheck { label: string; value: string; ok?: boolean }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rows = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
const fmt = (v: number, digits = 3) => Number(v.toPrecision(digits)).toString();

function fit(points: [number, number][]) {
  const n = points.length; if (n < 2) return null;
  const sx = points.reduce((a, [x]) => a + x, 0), sy = points.reduce((a, [, y]) => a + y, 0);
  const sxx = points.reduce((a, [x]) => a + x * x, 0), sxy = points.reduce((a, [x, y]) => a + x * y, 0);
  const d = n * sxx - sx * sx; if (d === 0) return null;
  const slope = (n * sxy - sx * sy) / d; return { slope, intercept: (sy - slope * sx) / n };
}

export function labChecks(v: LabValues): LabCheck[] {
  const out: LabCheck[] = [];
  const r = ['r_ab', 'r_bc', 'r_ca'].map(k => num(v[k])).filter((x): x is number => x !== null && x > 0);
  if (r.length === 3) {
    const mean = r.reduce((a, b) => a + b, 0) / 3; const spread = (Math.max(...r) - Math.min(...r)) / mean * 100;
    out.push({ label: 'Phase resistance (line to line ÷ 2)', value: `${fmt(mean / 2)} Ω` });
    out.push({ label: 'Resistance balance', value: `${fmt(spread, 2)} % (pass ≤ 3 %)`, ok: spread <= 3 });
  }
  const kv = rows(v.kv_points).map(p => [num(p.rpm), num(p.volts)]).filter((p): p is [number, number] => p[0] !== null && p[1] !== null && p[0] > 0 && p[1] > 0);
  if (kv.length >= 2) {
    const s = kv.reduce((a, [w, u]) => a + w * u, 0) / kv.reduce((a, [w]) => a + w * w, 0); // volts per rpm through zero
    const toRms = v.meter_reading === 'peak' ? 1 / Math.SQRT2 : v.meter_reading === 'peak-to-peak' ? 1 / (2 * Math.SQRT2) : 1;
    const worst = Math.max(...kv.map(([w, u]) => Math.abs(u - s * w) / (s * w) * 100));
    out.push({ label: 'Kv (line RMS, fitted through zero)', value: `${fmt(1 / (s * toRms))} rpm/V` });
    out.push({ label: 'Kv linearity (worst point)', value: `${fmt(worst, 2)} % (pass ≤ 3 %)`, ok: worst <= 3 });
  }
  const effIn = num(v.p_in_w) ?? num(v.eff_p_in_w), effOut = num(v.p_out_w) ?? num(v.eff_p_out_w);
  if (effIn && effOut !== null) out.push({ label: 'Efficiency', value: `${fmt(effOut / effIn * 100)} %`, ok: effOut <= effIn });
  for (const i of [1, 2]) {
    const d = num(v[`seat${i}_design_mm`]), m = num(v[`seat${i}_measured_mm`]);
    if (d !== null && m !== null) out.push({ label: `Bearing seat ${i}: measured minus design`, value: `${(m - d >= 0 ? '+' : '') + fmt(m - d, 2)} mm` });
  }
  const gap = ['gap_nominal_mm', 'rotor_runout_mm', 'stator_runout_mm', 'deflection_mm', 'thermal_mm'].map(k => num(v[k]));
  if (gap.every(x => x !== null)) {
    const g = gap as number[]; const worst = g[0] - g[1] - g[2] - g[3] - g[4];
    out.push({ label: 'Worst-case air gap', value: `${fmt(worst, 3)} mm (must stay above 0)`, ok: worst > 0 });
  }
  const cmd = num(v.move_commanded_deg), meas = num(v.move_measured_deg);
  if (cmd !== null && meas !== null) out.push({ label: 'Move error', value: `${fmt(Math.abs(meas - cmd), 2)}° (pass ≤ 2°)`, ok: Math.abs(meas - cmd) <= 2 });
  for (const [k, name] of [['cal_forward', 'positive'], ['cal_reverse', 'negative']] as const) {
    const pts = rows(v[k]).map(p => [num(p.iq_a), num(p.torque_nm)]).filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
    const f = fit(pts);
    if (f) out.push({ label: `Calibration fit, ${name} direction`, value: `slope ${fmt(f.slope)} N·m/A, intercept ${fmt(f.intercept, 2)} N·m` });
  }
  const fwd = fit(rows(v.cal_forward).map(p => [num(p.iq_a), num(p.torque_nm)]).filter((p): p is [number, number] => p[0] !== null && p[1] !== null));
  const rep = num(v.repeat_slope);
  if (fwd && rep !== null && fwd.slope) out.push({ label: 'Repeat slope versus first calibration', value: `${fmt((rep / fwd.slope - 1) * 100, 2)} %` });
  const amb = num(v.ambient_c), wind = num(v.winding_steady_c);
  if (amb !== null && wind !== null) out.push({ label: 'Winding temperature rise', value: `${fmt(wind - amb)} K above ambient` });
  return out;
}
