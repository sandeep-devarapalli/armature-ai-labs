import { useEffect, useRef, useState } from 'react';
import type { SignatureRenderer } from '../lib/motion/signature-renderer';
import './field-of-touch.css';

const scenes = {
  gripper: {
    title: 'Glass pickup', author: 'Pavel Danilyuk',
    source: 'https://www.pexels.com/video/robot-holding-a-glass-of-wine-8328090/',
    description: 'A robotic gripper lifts a glass, rendered as a muted field of points.',
    contactEvents: [
      { time: 4, x: 0.496, y: 0.66, duration: 3.2 },
      { time: 7.2, x: 0.49, y: 0.648, duration: 3.2 },
    ],
  },
  analyzer: {
    title: 'Sample automation', author: 'Кайрат Сатдиков',
    source: 'https://www.pexels.com/video/close-up-on-devices-in-laboratory-11218535/',
    description: 'A laboratory probe moves over a sample carousel in muted turquoise and white points.',
    contactEvents: [{ time: 8, x: 0.236, y: 0.704, duration: 3.2 }],
  },
  scanner: {
    title: 'Microplate stage', author: 'Dominik Zítka',
    source: 'https://www.pexels.com/video/advanced-laboratory-equipment-in-operation-31767906/',
    description: 'A microplate stage moves through a laboratory instrument in a muted blue point field.',
    contactEvents: [{ time: 11, x: 0.5, y: 0.424, duration: 3.2 }],
  },
};

export function FieldOfTouch({ scene, priority = false }: { scene: keyof typeof scenes; priority?: boolean }) {
  const study = scenes[scene];
  const figure = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const renderer = useRef<SignatureRenderer | null>(null);
  const pausedRef = useRef(true);
  const [nearViewport, setNearViewport] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const poster = `/media/field-of-touch/${scene}.jpg`;

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
    let instance: SignatureRenderer | undefined;
    const media = video.current;
    setReady(false);
    setFailed(false);
    void import('../lib/motion/signature-renderer.js').then(({ SignatureRenderer }) => {
      if (disposed || !canvas.current || !media) return;
      media.src = `/media/field-of-touch/${scene}.mp4`;
      instance = new SignatureRenderer({
        canvas: canvas.current, video: media, poster,
        settings: { styleMode: 1, paletteMode: 1, cellSize: 6, contactEvents: study.contactEvents },
        onStatus: ({ state, message }) => {
          if (disposed) return;
          if (state === 'fallback') { setFailed(true); setReady(false); }
          else {
            setReady(true);
            if (message.startsWith('Playback is paused')) {
              pausedRef.current = true;
              setPaused(true);
            }
          }
        },
      });
      renderer.current = instance;
      instance.setPaused(pausedRef.current);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      instance?.destroy();
      renderer.current = null;
      media?.removeAttribute('src');
      media?.load();
    };
  }, [enabled, nearViewport, scene, poster, study]);

  function togglePlayback() {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next) setEnabled(true);
    renderer.current?.setPaused(next);
  }

  return (
    <figure ref={figure} className="field-of-touch" data-scene={scene} data-state={failed ? 'fallback' : ready ? 'ready' : 'poster'}>
      <div className="field-of-touch-frame">
        <img src={poster} width="720" height="406" alt={study.description} loading={priority ? 'eager' : 'lazy'} />
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
