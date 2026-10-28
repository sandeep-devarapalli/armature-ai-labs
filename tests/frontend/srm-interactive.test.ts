import { describe, expect, it } from 'vitest';
import { measurements, scenes, srmFiring, validInteractive } from '../../course-app/interactive/registry.mjs';

const block = (sceneId: string, value: number) => ({ sceneId, parameters: { value }, caption: 'c', svgCode: '<svg></svg>', description: 'd' });

describe('switched reluctance motor scenes', () => {
  it('fires one phase at a time in the order A, D, C, B, each up to 15 degrees before line-up', () => {
    const order: number[] = [];
    for (let deg = 0; deg <= 60; deg++) {
      const f = srmFiring(deg);
      expect(f.gap).toBeGreaterThanOrEqual(1); expect(f.gap).toBeLessThanOrEqual(15);
      if (order[order.length - 1] !== f.phase) order.push(f.phase);
    }
    expect(order.slice(0, 5)).toEqual([0, 3, 2, 1, 0]);
    expect(srmFiring(5)).toEqual({ phase: 0, gap: 10 });
    expect(srmFiring(22)).toEqual({ phase: 3, gap: 8 });
  });
  it('reports flux falling with the air gap, against the magnet motor', () => {
    expect(measurements('srm-gap', 0.15)).toContain('71 %');
    expect(measurements('srm-gap', 0.15)).toContain('1.7 %');
    expect(measurements('srm-rotation', 22)).toContain('Phase D is on');
    expect(measurements('srm-exploded', 0)).toContain('Assembled');
  });
  it('accepts only values on each scene grid, matching the server validator', () => {
    expect(Object.keys(scenes)).toEqual(expect.arrayContaining(['srm-exploded', 'srm-rotation', 'srm-gap']));
    expect(validInteractive(block('srm-gap', 0.15))).toBe(true);
    expect(validInteractive(block('srm-gap', 0.155))).toBe(false);
    expect(validInteractive(block('srm-rotation', 61))).toBe(false);
    expect(validInteractive(block('srm-exploded', 25))).toBe(true);
  });
});
