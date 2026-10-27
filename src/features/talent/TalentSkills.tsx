import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function TalentSkills({ items, name }: { items: string[]; name: string }) {
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true });

  function update() {
    const row = viewport.current;
    if (!row || !rail.current) return;
    const next = { overflow: row.scrollWidth > rail.current.clientWidth + 1, start: row.scrollLeft <= 1, end: row.scrollWidth - row.clientWidth - row.scrollLeft <= 1 };
    setEdges(current => current.overflow === next.overflow && current.start === next.start && current.end === next.end ? current : next);
  }

  useEffect(() => {
    if (!rail.current || !viewport.current) return;
    let alive = true;
    const refresh = () => { if (alive) update(); };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(rail.current); observer?.observe(viewport.current);
    if (!observer) window.addEventListener('resize', refresh);
    void document.fonts?.ready.then(refresh);
    refresh();
    return () => { alive = false; observer?.disconnect(); window.removeEventListener('resize', refresh); };
  }, [items]);

  function move(left: number) {
    viewport.current?.scrollBy({ left, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const width = event.currentTarget.scrollWidth;
    const distance = { ArrowLeft: -100, ArrowRight: 100, Home: -width, End: width }[event.key];
    if (distance === undefined) return;
    event.preventDefault(); move(distance);
  }

  if (!items.length) return <p className="fine">Not provided</p>;
  return <div className="talent-skills" ref={rail} data-scrollable={edges.overflow}>
    {edges.overflow && <button type="button" className="talent-skill-step" aria-controls={id} aria-label={`Scroll skills left for ${name}`} disabled={edges.start} onClick={() => move(-(viewport.current?.clientWidth ?? 0) * .75)}><ChevronLeft aria-hidden="true"/></button>}
    <div className="talent-skills-scroll" id={id} ref={viewport} role="region" tabIndex={0} aria-label={`All skills for ${name}`} aria-description="Swipe or use Left and Right arrow keys, Home and End to scroll all skills." onScroll={update} onKeyDown={keyDown}>
      {items.map(item => <span className="talent-skill" key={item}>{item}</span>)}
    </div>
    {edges.overflow && <button type="button" className="talent-skill-step" aria-controls={id} aria-label={`Scroll skills right for ${name}`} disabled={edges.end} onClick={() => move((viewport.current?.clientWidth ?? 0) * .75)}><ChevronRight aria-hidden="true"/></button>}
  </div>;
}
