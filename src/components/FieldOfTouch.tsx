import { useEffect, useRef, useState } from 'react';
import { onThemeChange, readPixelColors } from '../lib/motion/pixel-colors';
import './field-of-touch.css';

const scenes = {
  gripper: {
    pixelLevels: [0.03, 0.6, 1, 0.58] as const,
    title: 'Glass pickup', author: 'Pavel Danilyuk',
    source: 'https://www.pexels.com/video/robot-holding-a-glass-of-wine-8328090/',
    description: 'A robotic gripper lifts a glass, rendered as a muted field of points.',
    contactEvents: [
      { time: 4, x: 0.496, y: 0.66, duration: 3.2 },
      { time: 7.2, x: 0.49, y: 0.648, duration: 3.2 },
    ],
  },
  analyzer: {
    pixelLevels: [0.04, 0.8, 1, 0.9] as const,
    title: 'Sample automation', author: 'Кайрат Сатдиков',
    source: 'https://www.pexels.com/video/close-up-on-devices-in-laboratory-11218535/',
    description: 'A laboratory probe moves over a sample carousel in muted turquoise and white points.',
    contactEvents: [{ time: 8, x: 0.236, y: 0.704, duration: 3.2 }],
  },
  scanner: {
    pixelLevels: [0.05, 0.5, 0.75, 0.6] as const,
    title: 'Microplate stage', author: 'Dominik Zítka',
    source: 'https://www.pexels.com/video/advanced-laboratory-equipment-in-operation-31767906/',
    description: 'A microplate stage moves through a laboratory instrument in a muted blue point field.',
    contactEvents: [{ time: 11, x: 0.5, y: 0.424, duration: 3.2 }],
  },
  interior: {
    pixelLevels: [0.05, 0.85, 1.2, 0.86] as const,
    title: 'Clean laboratory interior', author: 'Pavel Danilyuk',
    source: 'https://www.pexels.com/video/automated-analysers-in-a-laboratory-8381327/',
    description: 'A camera moves through a clinical laboratory in a muted point field; illustrative stock footage, not an Armature facility.',
    contactEvents: [],
  },
  arm: {
    pixelLevels: [0.15, 0.95, 1.3, 0.95] as const,
    title: 'Selected yellow arm', author: 'Usman AbdulrasheedGambo',
    source: 'https://www.pexels.com/video/industrial-robot-arm-in-high-tech-factory-32386532/',
    description: 'A yellow industrial arm lifts and rotates a rectangular assembly in a muted point field.',
    contactEvents: [],
  },
  birds: {
    pixelLevels: [0.04, 0.85, 1, 0.9] as const,
    title: 'Birds over water', author: 'Barış İpekçi',
    source: 'https://www.pexels.com/video/birds-flying-at-sunset-over-water-and-bridge-32755709/',
    description: 'A flock flies over sunset water beneath a bridge, rendered in muted copper points.',
    contactEvents: [],
  },
  waves: {
    pixelLevels: [0.04, 0.9, 1.2, 0.95] as const,
    title: 'Waves meeting shore', author: 'ArtHouse Studio',
    source: 'https://www.pexels.com/video/aerial-view-of-ocean-waves-4631571/',
    description: 'Ocean foam gathers and dissolves along a shoreline in a muted point field.',
    contactEvents: [],
  },
  rain: {
    pixelLevels: [0.04, 0.8, 1, 0.9] as const,
    title: 'Rain on water', author: 'Damir K',
    source: 'https://www.pexels.com/video/raindrops-creating-circular-ripples-on-autumn-pond-34714998/',
    description: 'Raindrop rings overlap around floating leaves, rendered in a muted point field.',
    contactEvents: [],
  },
};

type MotionRenderer = { setPaused(paused: boolean): void; destroy(): void; setColors?: (colors: ReturnType<typeof readPixelColors>) => void };

/** `field` is the approved point field; `pixel` is the ordered-dither treatment used on the landing page. */
export type MotionLook = 'field' | 'pixel';

export function FieldOfTouch({ scene, priority = false, look = 'field' }: { scene: keyof typeof scenes; priority?: boolean; look?: MotionLook }) {
  const study = scenes[scene];
  const figure = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const renderer = useRef<MotionRenderer | null>(null);
  const pausedRef = useRef(true);
  const [nearViewport, setNearViewport] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The pixel look uses a still rendered with the same dither, so posters, reduced motion and fallback match.
  const poster = look === 'pixel' ? `/media/field-of-touch/pixel/${scene}.png` : `/media/field-of-touch/${scene}.jpg`;

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = () => {
      pausedRef.current = preference.matches;
      setPaused(preference.matches);
      renderer.current?.setPaused(preference.matches);
      if (!preference.matches) setEnabled(true);
    };
    applyPreference();
    preference.addEventListener('change', applyPreference);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    if (figure.current) observer.observe(figure.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', applyPreference);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !nearViewport) return;
    let disposed = false;
    let instance: MotionRenderer | undefined;
    let stopThemeWatch = () => {};
    const media = video.current;
    setReady(false);
    setFailed(false);
    const onStatus = ({ state, message }: { state: 'ready' | 'fallback'; message: string }) => {
      if (disposed) return;
      if (state === 'fallback') { setFailed(true); setReady(false); }
      else {
        setReady(true);
        if (message.startsWith('Playback is paused')) {
          pausedRef.current = true;
          setPaused(true);
        }
      }
    };
    const create = look === 'pixel'
      ? import('../lib/motion/pixel-renderer.js').then(({ PixelRenderer }) => (target: HTMLCanvasElement, source: HTMLVideoElement): MotionRenderer => {
        const pixel = new PixelRenderer({
          canvas: target, video: source, poster,
          settings: { cellSize: 6, pixelSize: 3, levels: study.pixelLevels, colors: figure.current ? readPixelColors(figure.current) : undefined },
          onStatus,
        });
        stopThemeWatch = onThemeChange(() => { if (figure.current) pixel.setColors(readPixelColors(figure.current)); });
        return pixel;
      })
      : import('../lib/motion/signature-renderer.js').then(({ SignatureRenderer }) => (target: HTMLCanvasElement, source: HTMLVideoElement): MotionRenderer => new SignatureRenderer({
        canvas: target, video: source, poster,
        settings: { styleMode: 1, paletteMode: 1, cellSize: 6, contactEvents: study.contactEvents },
        onStatus,
      }));
    void create.then((make) => {
      if (disposed || !canvas.current || !media) return;
      media.src = `/media/field-of-touch/${scene}.mp4`;
      instance = make(canvas.current, media);
      renderer.current = instance;
      instance.setPaused(pausedRef.current);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      stopThemeWatch();
      instance?.destroy();
      renderer.current = null;
      media?.removeAttribute('src');
      media?.load();
    };
  }, [enabled, nearViewport, scene, poster, study, look]);

  function togglePlayback() {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next) setEnabled(true);
    renderer.current?.setPaused(next);
  }

  return (
    <figure ref={figure} className="field-of-touch" data-scene={scene} data-look={look} data-state={failed ? 'fallback' : ready ? 'ready' : 'poster'}>
      <div className="field-of-touch-frame" style={scene === 'birds' ? { aspectRatio: '4 / 3' } : undefined}>
        <img src={poster} width="720" height={scene === 'birds' ? 540 : 406} alt={study.description} loading={priority ? 'eager' : 'lazy'} />
        <canvas ref={canvas} aria-hidden="true" className={ready ? 'is-ready' : ''} />
        <video ref={video} muted playsInline loop preload="none" hidden aria-hidden="true" />
      </div>
      <figcaption>
        <span>Motion study · {study.title}<small>Illustrative footage: <a href={study.source} target="_blank" rel="noreferrer">{study.author} / Pexels</a></small></span>
        {failed ? <span role="status">Still image</span> : <button type="button" onClick={togglePlayback} aria-label={`${paused ? 'Play' : 'Pause'} ${study.title} animation`}>{paused ? 'Play' : 'Pause'}</button>}
      </figcaption>
    </figure>
  );
}
