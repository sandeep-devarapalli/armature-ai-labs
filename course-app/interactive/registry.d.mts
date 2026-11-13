export interface SceneSpec { title: string; label: string; min: number; max: number; step: number; initial: number; unit: string; kind: string; description: string }
export const scenes: Record<string, SceneSpec>;
export function validInteractive(content: unknown): boolean;
export function measurements(id: string, value: number): string;
export function srmFiring(deg: number): { phase: number; gap: number };
export function bldcSixStep(deg: number): { sector: number; code: string; plus: string; minus: string; field: number; north: number; lead: number };
export declare const WORM_LEAD_DEG: number;
export declare function wormLock(mu: number): { lead: number; friction: number; forward: number; backward: number; locked: boolean };
export declare function diffTurn(radius: number, track?: number, wheel?: number, speed?: number): { inner: number; outer: number; carrier: number; spider: number };
export declare const RV: { z1: number; z2: number; pins: number; ratio: number };
export declare function rvAngles(input: number): { output: number; crank: number; eccentric: number };
