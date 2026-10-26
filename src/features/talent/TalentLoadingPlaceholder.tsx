import { useEffect, useRef, useState, type CSSProperties } from 'react';

export function TalentLoadingPlaceholder() {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let inView = true;
    const update = () => { element.dataset.motionHidden = String(document.hidden || !inView); };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? false;
      update();
    }, { threshold: 0.05 });
    observer?.observe(element);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);

  return <div className="talent-loading" ref={root} data-motion-paused={paused}>
    <div className="talent-skeletons" aria-hidden="true">
      {[0, 1, 2].map(index => <div className="engineer-row talent-skeleton" key={index} style={{ '--talent-row': index } as CSSProperties}>
        <div className="talent-skeleton-heading">
          <span className="talent-skeleton-avatar"/>
          <div><span className="talent-skeleton-line talent-skeleton-name"/><span className="talent-skeleton-line talent-skeleton-role"/></div>
        </div>
        <span className="talent-skeleton-line talent-skeleton-summary"/>
        <div className="talent-skeleton-tags"><span/><span/><span/></div>
        <span className="talent-skeleton-line talent-skeleton-footer"/>
      </div>)}
    </div>
    <button type="button" className="talent-motion-toggle" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Resume animation' : 'Pause animation'}</button>
  </div>;
}
