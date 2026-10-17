export const PIXEL_SCALES: readonly number[];
export interface PixelBandLayout { blocks: number[]; edges: number[] }
export function pixelBands(width: number, base: number, scales?: readonly number[]): PixelBandLayout;
export function blockAt(x: number, layout: PixelBandLayout): number;
