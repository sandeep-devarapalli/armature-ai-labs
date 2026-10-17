// Render the landing page's dithered motion stills (public/media/field-of-touch/pixel/).
// Usage: node scripts/media/render-pixel-posters.mjs   (needs ffmpeg on PATH, or FFMPEG=/path/to/ffmpeg)
// Each still is the frame at 2 s of public/media/field-of-touch/<scene>.mp4, run through the same
// ordered dither, band layout, sharpening, three tones and levels as src/lib/motion/pixel-renderer.js
// (FieldOfTouch pixel settings) at 2x the 720 x 406 frame, in the dark palette (motion frames stay
// dark in every theme).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { MOTION_SCALES, pixelBands } from '../../src/lib/motion/pixel-bands.js';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const root = new URL('../../public/media/field-of-touch/', import.meta.url).pathname;
// black point, white point, gamma, accent threshold: keep in sync with FieldOfTouch.tsx
const levels = { scanner: [0.05, 0.5, 0.75, 0.6], interior: [0.05, 0.85, 1.2, 0.86], gripper: [0.03, 0.6, 1, 0.58], arm: [0.15, 0.95, 1.3, 0.95] };
const LO = [17, 17, 16], HI = [237, 230, 214], ACCENT = [224, 112, 58];
const MID = LO.map((v, i) => v + (HI[i] - v) * 0.42);
const W = 1440, H = 812, BASE = 4, SHARPEN = 0.8; // pixelSize 2 at 2x
const bayer2 = (x, y) => ((x / 2 + y * y * 0.75) % 1 + 1) % 1;
const bayer4 = (x, y) => bayer2(Math.floor(x / 2), Math.floor(y / 2)) * 0.25 + bayer2(x, y);
const bayer8 = (x, y) => bayer4(Math.floor(x / 2), Math.floor(y / 2)) * 0.25 + bayer2(x, y);

mkdirSync(`${root}pixel`, { recursive: true });
const { blocks, edges } = pixelBands(W, BASE, MOTION_SCALES);
for (const [scene, [black, white, gamma, highlight]] of Object.entries(levels)) {
  const rgb = execFileSync(ffmpeg, ['-loglevel', 'error', '-ss', '2', '-i', `${root}${scene}.mp4`, '-frames:v', '1',
    '-vf', `scale=${W}:${H}:flags=bilinear`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: W * H * 4 });
  const luma = (x, y) => {
    const px = Math.min(W - 1, Math.max(0, Math.floor(x))), py = Math.min(H - 1, Math.max(0, H - 1 - Math.floor(y)));
    const i = (py * W + px) * 3;
    return (0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]) / 255;
  };
  const out = Buffer.alloc(W * H * 3);
  for (let row = 0; row < H; row++) {
    const fy = H - row - 0.5; // gl_FragCoord.y is bottom-up
    for (let col = 0; col < W; col++) {
      const fx = col + 0.5;
      let band = 0;
      while (band < edges.length && fx >= edges[band]) band++;
      const block = blocks[band];
      const cx = Math.floor(fx / block), cy = Math.floor(fy / block);
      const x = (cx + 0.5) * block, y = (cy + 0.5) * block; // centre in bottom-up pixels
      const raw = luma(x, y);
      const around = (luma(x + block, y) + luma(x - block, y) + luma(x, y + block) + luma(x, y - block)) / 4;
      const sharp = Math.min(1, Math.max(0, raw + SHARPEN * (raw - around)));
      const level = Math.min(1, Math.max(0, (sharp - black) / Math.max(0.01, white - black))) ** gamma;
      const t = bayer8(cx, cy), v = level * 2, f = Math.floor(v);
      const color = raw > highlight ? ACCENT : [LO, MID, HI][Math.min(2, f + (v - f > t ? 1 : 0))];
      out.set(color.map(Math.round), (row * W + col) * 3);
    }
  }
  execFileSync(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-',
    '-frames:v', '1', '-pix_fmt', 'rgb24', '-compression_level', '9', `${root}pixel/${scene}.png`], { input: out });
  console.log(`${scene}: written`);
}
