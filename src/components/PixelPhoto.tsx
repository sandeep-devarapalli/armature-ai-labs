import { useEffect, useRef, useState } from 'react';
import { onThemeChange, readPixelColors } from '../lib/motion/pixel-colors';
import type { PixelColors } from '../lib/motion/pixel-renderer';
import { MOTION_SCALES, blockAt, pixelBands } from '../lib/motion/pixel-bands';

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((n) => n / 64);
const FALLBACK: PixelColors = { lo: [17, 17, 16], hi: [237, 230, 214], accent: [224, 112, 58] };

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  label: string;
  caption: string;
  /** Base block size in CSS pixels; blocks coarsen toward the right edge. */
  pixelSize?: number;
  gamma?: number;
  /** Local-contrast boost before dithering (0 = off). */
  sharpen?: number;
  /** 2 = two-tone; 3 adds a mid tone for a clearer picture. */
  tones?: 2 | 3;
  /** Only highlights above this share of the frame height turn accent (keeps floor glare neutral). */
  accentTop?: number;
};

/** A real photograph shown through the landing page's ordered-dither treatment. */
export function PixelPhoto({ src, alt, width, height, label, caption, pixelSize = 2, gamma = 1.1, sharpen = 0.8, tones = 3, accentTop = 0.55 }: Props) {
  const figure = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = figure.current, target = canvas.current;
    if (!host || !target) return;
    let image: HTMLImageElement | undefined;
    let disposed = false;
    const render = () => {
      if (disposed || !image?.complete || !image.naturalWidth) return;
      const w = Math.round(target.clientWidth), h = Math.round(target.clientHeight);
      if (!w || !h) return;
      const colors = { ...FALLBACK, ...readPixelColors(host) };
      target.width = w;
      target.height = h;
      const out = target.getContext('2d');
      if (!out) return;
      const pixels = out.createImageData(w, h);
      // Crop the photograph to the frame (object-fit: cover).
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const sw = w / scale, sh = h / scale;
      const sx = (image.naturalWidth - sw) / 2, sy = (image.naturalHeight - sh) / 2;
      const work = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      if (!work) return;
      const layout = pixelBands(w, pixelSize, MOTION_SCALES);
      const grids = new Map<number, { cols: number; rows: number; luma: Float32Array }>();
      for (const block of new Set(layout.blocks)) {
        const cols = Math.ceil(w / block), rows = Math.ceil(h / block);
        work.canvas.width = cols;
        work.canvas.height = rows;
        work.drawImage(image!, sx, sy, sw * (cols * block) / w, sh * (rows * block) / h, 0, 0, cols, rows);
        const data = work.getImageData(0, 0, cols, rows).data;
        const luma = new Float32Array(cols * rows);
        for (let i = 0; i < luma.length; i++) luma[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
        grids.set(block, { cols, rows, luma });
      }
      const finest = grids.get(layout.blocks[0])!;
      // Stretch contrast from the finest band so every band shares one tone curve.
      const sorted = Array.from(finest.luma).sort((a, b) => a - b);
      const low = sorted[Math.floor(sorted.length * 0.01)], high = sorted[Math.floor(sorted.length * 0.99)];
      const span = Math.max(0.05, high - low);
      // Only the brightest 0.3% (the light fittings) turns accent, so window glare stays neutral.
      const accentLevel = sorted[Math.floor(sorted.length * 0.997)];
      const mid = colors.lo.map((v, i) => Math.round(v + (colors.hi[i] - v) * 0.42));
      const columnBlocks = Array.from({ length: w }, (_, x) => blockAt(x, layout));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const block = columnBlocks[x];
          const band = grids.get(block)!;
          const cx = Math.floor(x / block), cy = Math.floor(y / block);
          const at = (gx: number, gy: number) => band.luma[Math.min(band.rows - 1, Math.max(0, gy)) * band.cols + Math.min(band.cols - 1, Math.max(0, gx))];
          const raw = at(cx, cy);
          const around = (at(cx - 1, cy) + at(cx + 1, cy) + at(cx, cy - 1) + at(cx, cy + 1)) / 4;
          const sharp = Math.min(1, Math.max(0, raw + sharpen * (raw - around)));
          const level = Math.pow(Math.min(1, Math.max(0, (sharp - low) / span)), gamma);
          const threshold = BAYER[(cy % 8) * 8 + (cx % 8)];
          const v = level * 2, f = Math.floor(v);
          const tone = tones === 3 ? [colors.lo, mid, colors.hi][Math.min(2, f + (v - f > threshold ? 1 : 0))] : level > threshold ? colors.hi : colors.lo;
          const rgb = raw >= accentLevel && y < h * accentTop ? colors.accent : tone;
          const i = (y * w + x) * 4;
          pixels.data[i] = rgb[0]; pixels.data[i + 1] = rgb[1]; pixels.data[i + 2] = rgb[2]; pixels.data[i + 3] = 255;
        }
      }
      out.putImageData(pixels, 0, 0);
      setReady(true);
    };
    const load = () => {
      image = new Image();
      image.decoding = 'async';
      image.onload = render;
      image.src = src;
    };
    // Older browsers (and test environments) without the observers still get the photograph.
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer?.disconnect();
      load();
    }, { rootMargin: '240px' });
    if (observer) observer.observe(host); else load();
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    if (resize) resize.observe(target); else window.addEventListener('resize', schedule);
    const stopThemeWatch = onThemeChange(render);
    return () => {
      disposed = true;
      observer?.disconnect();
      if (resize) resize.disconnect(); else window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
      stopThemeWatch();
    };
  }, [src, pixelSize, gamma, sharpen, tones, accentTop]);

  return (
    <figure ref={figure} className="pixel-photo" data-state={ready ? 'ready' : 'photo'}>
      <div className="pixel-photo-frame">
        <img src={src} width={width} height={height} alt={alt} loading="lazy" decoding="async" />
        <canvas ref={canvas} aria-hidden="true" />
      </div>
      <figcaption><span className="pixel-photo-label">{label}</span> {caption}</figcaption>
    </figure>
  );
}
