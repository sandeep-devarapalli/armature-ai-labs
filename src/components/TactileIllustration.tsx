import { useEffect, useRef, useState } from "react";
import "./TactileIllustration.css";

const source = "/media/illustrations/tactile-machine.webp";
const glyphs = " .:;+*ox%#@";

export function TactileIllustration() {
  const image = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const illuminate = useRef<(point: [number, number] | null) => void>(() => {});
  const [ready, setReady] = useState(false);
  const [spotlight, setSpotlight] = useState(false);

  useEffect(() => {
    const photo = image.current;
    const surface = canvas.current;
    if (!photo || !surface) return;
    let frame = 0;
    let point: [number, number] | null = null;
    let disposed = false;
    const base = document.createElement("canvas");
    const sample = document.createElement("canvas");
    let draw = () => {};

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
    };
    const prepare = () => {
      if (disposed || !photo.naturalWidth) return;
      const width = surface.clientWidth;
      if (!width) return;
      const height = width * 9 / 16;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const columns = Math.min(160, Math.max(40, Math.floor(width / 8)));
      const cell = width / columns;
      const rows = Math.ceil(height / cell);
      sample.width = columns;
      sample.height = rows;
      const sampler = sample.getContext("2d", { willReadFrequently: true });
      const context = surface.getContext("2d");
      const backdrop = base.getContext("2d");
      if (!sampler || !context || !backdrop) return;
      surface.width = base.width = Math.round(width * dpr);
      surface.height = base.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop.setTransform(dpr, 0, 0, dpr, 0, 0);
      sampler.drawImage(photo, 0, 0, columns, rows);
      const pixels = sampler.getImageData(0, 0, columns, rows).data;
      const cells = Array.from({ length: columns * rows }, (_, i) => {
        const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
        const light = (r * .2126 + g * .7152 + b * .0722) / 255;
        return { r, g, b, glyph: glyphs[Math.min(glyphs.length - 1, Math.floor(Math.sqrt(light) * glyphs.length))] };
      });
      const paintCell = (ctx: CanvasRenderingContext2D, col: number, row: number, strength: number) => {
        const value = cells[row * columns + col];
        const { r, g, b, glyph } = value;
        ctx.fillStyle = `rgb(${r * (.32 + strength * .6)} ${g * (.32 + strength * .6)} ${b * (.32 + strength * .6)})`;
        ctx.fillRect(col * cell, row * cell, cell, cell);
        ctx.fillStyle = `rgb(${Math.min(255, r * 1.3 + 25 + strength * 80)} ${Math.min(255, g * 1.3 + 17 + strength * 65)} ${Math.min(255, b * 1.3 + 10 + strength * 45)})`;
        ctx.fillText(glyph, (col + .5) * cell, (row + .53) * cell);
      };
      for (const ctx of [context, backdrop]) {
        ctx.font = `${cell * .95}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
      }
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) paintCell(backdrop, col, row, 0);
      }
      draw = () => {
        context.drawImage(base, 0, 0, width, height);
        if (!point) return;
        const x = point[0] * width, y = point[1] * height;
        const radius = Math.max(42, width * .075);
        for (let row = Math.max(0, Math.floor((y - radius) / cell)); row < Math.min(rows, Math.ceil((y + radius) / cell)); row++) {
          for (let col = Math.max(0, Math.floor((x - radius) / cell)); col < Math.min(columns, Math.ceil((x + radius) / cell)); col++) {
            const strength = Math.max(0, 1 - Math.hypot((col + .5) * cell - x, (row + .5) * cell - y) / radius);
            if (strength > 0) paintCell(context, col, row, strength);
          }
        }
      };
      draw();
      setReady(true);
    };
    illuminate.current = next => { point = next; schedule(); };
    photo.addEventListener("load", prepare);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(prepare);
    observer?.observe(surface);
    prepare();
    return () => {
      disposed = true;
      photo.removeEventListener("load", prepare);
      observer?.disconnect();
      cancelAnimationFrame(frame);
      illuminate.current = () => {};
    };
  }, []);

  return (
    <figure className="tactile-illustration wrap">
      <div className="tactile-illustration-field">
        <img ref={image} src={source} width="1440" height="810" loading="lazy" decoding="async"
          alt="Concept illustration of a copper robotic arm gently holding a sphere in its gripper." />
        <canvas ref={canvas} className={ready ? "is-ready" : ""} aria-hidden="true"
          onPointerMove={event => {
            const bounds = event.currentTarget.getBoundingClientRect();
            illuminate.current([(event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height]);
          }}
          onPointerDown={event => {
            const bounds = event.currentTarget.getBoundingClientRect();
            illuminate.current([(event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height]);
          }}
          onPointerLeave={() => illuminate.current(spotlight ? [.775, .31] : null)}
          onPointerCancel={() => illuminate.current(spotlight ? [.775, .31] : null)} />
      </div>
      <figcaption>
        <span><strong>Tactile machine</strong> · Concept illustration</span>
        {ready && <button type="button" aria-pressed={spotlight} onClick={() => {
          setSpotlight(!spotlight);
          illuminate.current(spotlight ? null : [.775, .31]);
        }}>{spotlight ? "Reset illumination" : "Illuminate gripper"}</button>}
      </figcaption>
    </figure>
  );
}
