export interface SceneSpec { title: string; label: string; min: number; max: number; step: number; initial: number; unit: string; kind: string; description: string }
export const scenes: Record<string, SceneSpec>;
export function validInteractive(content: unknown): boolean;
export function measurements(id: string, value: number): string;
export function srmFiring(deg: number): { phase: number; gap: number };
export function bldcSixStep(deg: number): { sector: number; code: string; plus: string; minus: string; field: number; north: number; lead: number };
