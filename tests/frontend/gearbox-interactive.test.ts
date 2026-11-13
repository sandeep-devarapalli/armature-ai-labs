import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffTurn, measurements, RV, rvAngles, scenes, validInteractive, wormLock } from '../../course-app/interactive/registry.mjs';

const block = (sceneId: string, value: number) => ({ sceneId, parameters: { value }, caption: 'c', svgCode: '<svg></svg>', description: 'd' });

describe('gearbox family scenes (Robot Actuators Lessons 6.5, 6.6 and 8.4)', () => {
  it('worm: self-locks only when the friction angle exceeds the 3.58 degree lead angle', () => {
    const run = wormLock(0.05), rest = wormLock(0.10);
    expect(run.lead).toBeCloseTo(3.58, 2); expect(run.locked).toBe(false);
    expect(Math.round(run.forward * 100)).toBe(55); expect(Math.round(run.backward * 100)).toBe(20);
    expect(rest.locked).toBe(true); expect(rest.backward).toBe(0); expect(Math.round(rest.forward * 100)).toBe(38);
    expect(measurements('worm-backdrive', 0.10)).toContain('locks');
  });
  it('differential: wheel speeds in a 2 m turn and the carrier at their average', () => {
    const d = diffTurn(2);
    expect(d.inner).toBeCloseTo(8.75, 6); expect(d.outer).toBeCloseTo(11.25, 6); expect(d.carrier).toBeCloseTo(10, 6); expect(d.spider).toBeCloseTo(2, 6);
    expect(measurements('differential-turn', 2)).toContain('10.0 rad/s');
  });
  it('RV: 121:1, cranks three times slower than the input relative to the carrier', () => {
    expect(RV.ratio).toBe(121);
    const a = rvAngles(121 * 360);
    expect(a.output).toBeCloseTo(360, 6); expect(a.crank).toBeCloseTo(-40 * 360, 6);
    expect(measurements('rv-two-stage', 360)).toContain('2.98°');
  });
  it('bevel-hypoid: bevel at zero offset, hypoid otherwise', () => {
    expect(measurements('bevel-hypoid', 0)).toContain('Bevel');
    expect(measurements('bevel-hypoid', 10)).toContain('passes 10 mm');
  });
  it('accepts only values on each grid, and the server validator lists the same ranges', () => {
    expect(validInteractive(block('worm-backdrive', 0.07))).toBe(true);
    expect(validInteractive(block('worm-backdrive', 0.075))).toBe(false);
    expect(validInteractive(block('bevel-hypoid', 3))).toBe(false);
    expect(validInteractive(block('differential-turn', 10.5))).toBe(false);
    expect(validInteractive(block('rv-two-stage', 1095))).toBe(false);
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/202611130101_course_gearbox_scenes.sql'), 'utf8');
    for (const id of ['bevel-hypoid', 'worm-backdrive', 'differential-turn', 'rv-two-stage']) {
      const s = scenes[id]; const m = sql.match(new RegExp(`when '${id}' then low:=([\\d.]+); high:=([\\d.]+); increment:=([\\d.]+);`));
      expect(m, id).not.toBeNull(); expect([Number(m![1]), Number(m![2]), Number(m![3])]).toEqual([s.min, s.max, s.step]);
    }
  });
});
