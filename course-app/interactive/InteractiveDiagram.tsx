import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { Block } from '../types';
import { measurements, scenes, validInteractive } from './registry.mjs';
import './interactive.css';

type SceneHandle = { update(value: number, view: number): void; dispose(): void };
function LiveDiagram({ id, initial }: { id: string; initial: number }) {
  const spec = scenes[id];
  const [value, setValue] = useState(initial);
  const [view, setView] = useState(0);
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const latest = useRef({ value, view });
  latest.current = { value, view };
  useEffect(() => {
    if (spec.kind !== '3d' || !host.current) return;
    let disposed = false;
    const node = host.current;
    const lost = (event: Event) => { event.preventDefault(); setFailed(true); };
    node.addEventListener('webglcontextlost', lost, true);
    import('./scene.mjs').then(({ createScene }) => {
      if (disposed) return;
      scene.current = createScene(node, id);
      scene.current.update(latest.current.value, latest.current.view);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; node.removeEventListener('webglcontextlost', lost, true); scene.current?.dispose(); scene.current = null; };
  }, [id, spec.kind]);
  useEffect(() => { scene.current?.update(value, view); }, [value, view]);
  return <div className="interactive-live">
    {spec.kind === '3d' ? <div ref={host} className="interactive-canvas" role="img" aria-label={`${spec.title}. ${measurements(id, value)}`} /> :
      <svg viewBox="0 0 720 220" role="img" aria-label={measurements(id,value)}>
        <title>{spec.title}</title>
        {id === 'pic-register' ? Array.from({length:8},(_,i)=>{const bit=7-i,high=!!(value & (1<<bit));return <g key={bit}>
          <text x={44+i*88} y={38} textAnchor="middle">Bit {bit}</text>
          <rect x={8+i*88} y={60} width="72" height="70" rx="4" fill={high?'#3f5430':'#e9e2d6'} stroke="#56616a" />
          <text x={44+i*88} y={104} textAnchor="middle" fill={high?'white':'#111'} fontSize="28">{high?1:0}</text>
          <text x={44+i*88} y={165} textAnchor="middle">{1<<bit}</text>
        </g>}) : <>
          <text x="16" y="25">Oscillator (8 periods)</text>
          <path d={'M 24 80 '+Array.from({length:8},(_,i)=>`L ${24+i*80} 50 L ${64+i*80} 50 L ${64+i*80} 80 L ${104+i*80} 80`).join(' ')} fill="none" stroke="#b97516" strokeWidth="3" />
          <text x="16" y="120">Instruction cycles (4 oscillator periods each)</text>
          {[0,1].map(i=><g key={i}><rect x={24+i*320} y="140" width="320" height="40" fill="none" stroke="currentColor"/><text x={184+i*320} y="167" textAnchor="middle">{(4/value).toFixed(3)} µs</text></g>)}
          <text x="24" y="210">Time → (diagram rescales with frequency)</text>
        </>}
      </svg>}
    {failed ? <p role="status">Interactive 3D is unavailable. Use the static diagram below; all calculations remain available.</p> : null}
    <label>{spec.label}: <strong>{value} {spec.unit}</strong><input aria-label={spec.label} type="range" min={spec.min} max={spec.max} step={spec.step} value={value} onChange={e=>setValue(Number(e.target.value))}/></label>
    <div className="interactive-actions">
      <button type="button" onClick={()=>setValue(v=>Math.min(spec.max,Math.round((v+spec.step)*100)/100))} disabled={value>=spec.max}>Next step</button>
      <button type="button" onClick={()=>{setValue(initial);setView(0);}}>Reset</button>
      {spec.kind==='3d'? <><button type="button" onClick={()=>setView(v=>v-30)}>View left</button><button type="button" onClick={()=>setView(v=>v+30)}>View right</button></>:null}
    </div>
    <p className="interactive-reading" role="status">{measurements(id,value)}</p>
    <p>{spec.description}</p>
  </div>;
}
export default function InteractiveDiagram({ block }: { block: Block }) {
  const [active, setActive] = useState(false);
  const c=block.content;
  const valid=validInteractive(c);
  const spec=valid?scenes[c.sceneId!]:null;
  return <figure className="interactive-diagram">
    {spec ? <><h3>{spec.title}</h3><p>Explore one variable at a time. Use the slider arrow keys or Next step, then compare the result with the explanation.</p>
      <button type="button" aria-expanded={active} onClick={()=>setActive(v=>!v)}>{active?'Close interactive view':'Open interactive view'}</button>
      {active?<LiveDiagram key={JSON.stringify([block.id,c.sceneId,c.parameters])} id={c.sceneId!} initial={c.parameters!.value}/>:null}</>:<p role="status">This interactive configuration is unavailable. Use the explanation below.</p>}
    <div className="interactive-static" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(c.svgCode||'',{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['image','foreignObject','script','style']})}} />
    <figcaption>{c.caption}</figcaption><p>{c.description}</p>
  </figure>;
}
