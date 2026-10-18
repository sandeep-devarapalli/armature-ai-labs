export type RGB = readonly [number, number, number];

export interface PixelColors {
  lo: RGB;
  hi: RGB;
  accent: RGB;
}

export class PixelRenderer {
  constructor(options: {
    canvas: HTMLCanvasElement;
    video: HTMLVideoElement;
    poster: string;
    settings: {
      cellSize: number;
      pixelSize?: number;
      coarsen?: 'left' | 'right';
      /** Block-size multipliers for the eight bands (see pixel-bands.js). */
      scales?: readonly number[];
      /** Local-contrast boost before dithering (0 = off). */
      sharpen?: number;
      /** 2 = two-tone; 3 adds a mid tone for clearer footage. */
      tones?: 2 | 3;
      /** [black point, white point, gamma, accent threshold] on source luma (0 to 1). */
      levels?: readonly [number, number, number, number];
      colors?: Partial<PixelColors>;
    };
    onStatus: (status: { state: 'ready' | 'fallback'; message: string }) => void;
  });
  paused: boolean;
  setPaused(paused: boolean): void;
  setColors(colors: Partial<PixelColors>): void;
  destroy(): void;
}
