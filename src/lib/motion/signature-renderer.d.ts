export interface ContactCue {
  time: number;
  x: number;
  y: number;
  duration: number;
}

export class SignatureRenderer {
  constructor(options: {
    canvas: HTMLCanvasElement;
    video: HTMLVideoElement;
    poster: string;
    settings: {
      styleMode: number;
      paletteMode: number;
      cellSize: number;
      contactEvents: readonly ContactCue[];
    };
    onStatus: (status: { state: 'ready' | 'fallback'; message: string }) => void;
  });
  paused: boolean;
  setPaused(paused: boolean): void;
  destroy(): void;
}
