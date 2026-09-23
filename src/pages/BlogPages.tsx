import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import articleMarkdown from '../data/blogArticle.md?raw';
import './BlogPages.css';

const ARTICLE = '/blog/model-hardware-standard/';
const DISCORD = 'https://discord.gg/qGNXGmF8z';
const COVER = '/blog-covers/mhs-common-interface.png';
const title = 'MHS could be physical AI’s MCP moment.';
const deck = 'A shared interface could change how builders connect models to machines. The hard part is making those connections dependable.';

function Arrow() {
  return <span className="arrow" aria-hidden="true">[<svg viewBox="0 0 18 12"><path d="M1 6h14m-5-5 5 5-5 5"/></svg>]</span>;
}

function TextLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return href.startsWith('/')
    ? <Link to={href} className={`text-link ${className}`}>{children}<Arrow/></Link>
    : <a href={href} className={`text-link ${className}`}>{children}<Arrow/></a>;
}

function ArticleTitle() {
  return <>MHS could be physical AI’s <span className="muted">MCP moment.</span></>;
}

function InterfaceDiagram({ compact = false }: { compact?: boolean }) {
  const nodes = ['Agent', 'MCP / CLI / API', 'MHS driver', 'Device'];
  return <figure className={compact ? 'interface-diagram compact' : 'interface-diagram'}>
    <div className="diagram-flow" role="img" aria-label="Conceptual architecture: an agent communicates through MCP, a CLI or an API to an MHS driver and then a physical device; observations return to the agent.">
      {nodes.map((node, index) => <div className="diagram-step" key={node}><span>{node}</span>{index < nodes.length - 1 ? <svg className="connector" viewBox="0 0 42 20" aria-hidden="true"><path d="M4 6h32m-5-4 5 4-5 4M38 15H6m5-4-5 4 5 4"/></svg> : null}</div>)}
    </div>
    <figcaption>Actions out. Observations back.{!compact ? <><br/>Conceptual architecture; not a safety boundary.</> : null}</figcaption>
  </figure>;
}

function ArticleCover() {
  const figure = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playing, setPlaying] = useState(!reduced);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);

  useEffect(() => {
    const preference = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onPreference = () => { setReduced(Boolean(preference?.matches)); if (preference?.matches) setPlaying(false); };
    const onVisibility = () => setPageVisible(!document.hidden);
    preference?.addEventListener('change', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => setOnScreen(entries[0].isIntersecting), { threshold: .05 }) : null;
    if (figure.current && observer) observer.observe(figure.current);
    return () => { preference?.removeEventListener('change', onPreference); document.removeEventListener('visibilitychange', onVisibility); observer?.disconnect(); };
  }, []);

  return <figure className="mhs-cover wrap" ref={figure}>
    <div className="mhs-cover-art" data-playing={playing && !reduced && onScreen && pageVisible}>
      <img src={COVER} width="1672" height="941" alt="Abstract camera, gripper and instrument stage aligned around one shared circular connector" fetchPriority="high" />
      <svg className="mhs-cover-motion" viewBox="0 0 1672 941" aria-hidden="true">
        <circle className="align" cx="836" cy="405" r="188" style={{ transformOrigin: '836px 405px' }}/>
        <path className="trace" d="M530 405H836M1135 405H836M836 603V405"/>
        <path className="endpoint left" d="M559 390V420"/><path className="endpoint right" d="M1112 390V420"/><path className="endpoint bottom" d="M821 581H851"/>
        <circle className="pulse" cx="575" cy="405" r="4"/><circle className="pulse pulse-return" cx="1090" cy="423" r="3.5"/>
      </svg>
    </div>
    <figcaption><span>Common interface · Original Armature AI Labs illustration</span><button type="button" disabled={reduced} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{reduced ? 'Still image (reduced motion)' : playing ? 'Pause motion' : 'Play motion'}</button></figcaption>
  </figure>;
}

export function BlogIndexPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All posts');
  const matches = `${title} ${deck} engineering MCP Anthropic hardware`.toLowerCase().includes(query.trim().toLowerCase());
  return <div className="journal-page blog-index wrap">
    <section className="index-hero"><h1>The lab <span className="muted">journal.</span></h1><p>Notes on physical AI, the systems behind it, and the work of building them.</p><p className="small-meta">01 article · Engineering</p></section>
    <div className="filter-bar"><div className="filters" aria-label="Filter articles by category">{['All posts', 'Engineering'].map(item => <button key={item} aria-pressed={category === item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="search-field"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 6 6"/></svg><input type="search" aria-label="Search the journal" placeholder="Search the journal" value={query} onChange={event => setQuery(event.target.value)}/></div></div>
    <p className="sr-only" role="status">{matches ? '1 article found' : 'No articles found'}</p>
    {matches ? <article className="post-row"><div className="small-meta post-meta"><span>Engineering</span><time dateTime="2026-09-13">13 Sep 2026</time><span>Essay</span></div><div className="post-summary"><h2><Link to={ARTICLE}><ArticleTitle/></Link></h2><p>{deck}</p><TextLink href={ARTICLE}>Read the article</TextLink></div><Link className="post-cover" to={ARTICLE} aria-label="Read the MHS article"><img src={COVER} width="1672" height="941" loading="lazy" alt="Common interface: camera, gripper and instrument stage around a shared connector"/></Link></article> : <div className="empty-results"><h2>No matching notes.</h2><p>Try “MHS”, “MCP” or “hardware”.</p><button className="button" onClick={() => setQuery('')}>Clear search <Arrow/></button></div>}
    <section className="journal-closing"><h2>Ideas get better <span className="muted">in the open.</span></h2><TextLink href={DISCORD}>Join the conversation on Discord</TextLink></section>
  </div>;
}

// This renderer supports only the headings, links, emphasis and lists used in blogArticle.md.
function inline(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} className="citation">{link[1]}</a>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

const sections = articleMarkdown.split(/^## /m).slice(1).map((section, index) => {
  const [heading, ...rest] = section.split('\n');
  return { heading, id: heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'), content: rest.join('\n').trim(), number: String(index + 1).padStart(2, '0') };
});

function ArticleBlocks({ content }: { content: string }) {
  return <>{content.split(/\n\s*\n/).map((block, index) => {
    if (block.startsWith('> ')) return <aside className="status-note" key={index}>{inline(block.replace(/^> /gm, ''))}</aside>;
    if (/^\d+\. /.test(block)) return <ol key={index} className="reference-list">{block.split('\n').map(line => <li key={line}>{inline(line.replace(/^\d+\. /, ''))}</li>)}</ol>;
    return <p key={index}>{inline(block)}</p>;
  })}</>;
}

export function BlogArticlePage() {
  const [active, setActive] = useState(sections[0].id);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.find(entry => entry.isIntersecting);
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-120px 0px -60% 0px' });
    document.querySelectorAll('.article-section').forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  const contents = <ol>{sections.filter(section => section.heading !== 'References').map(section => <li key={section.id}><a href={`#${section.id}`} aria-current={active === section.id ? 'location' : undefined} onClick={() => setActive(section.id)}><span>{section.number}</span>{' '}{section.heading}</a></li>)}</ol>;
  return <div className="journal-page">
    <div className="article-hero"><div className="breadcrumb"><Link to="/blog/">Blog</Link><span>/ Engineering</span></div><h1><ArticleTitle/></h1><p className="article-deck">{deck}</p><div className="article-meta"><span>Armature AI Labs</span><time dateTime="2026-09-13">13 September 2026</time><span>6 min read</span></div></div>
    <ArticleCover/>
    <div className="article-layout wrap"><aside className="toc"><nav aria-label="Article contents"><p className="small-meta">Contents</p>{contents}<a className="source-shortcut" href="#references">Sources [8]</a></nav></aside><details className="mobile-toc"><summary>Contents <span>+</span></summary><nav aria-label="Mobile article contents">{contents}<a href="#references">Sources [8]</a></nav></details><article className="article-body"><p className="opening">The next useful robot will need more than a capable model. It will need an understandable connection to the machines around it.</p>{sections.map(section => <section id={section.id} key={section.id} className="article-section"><h2>{section.heading !== 'References' ? <span className="section-number">{section.number}</span> : null}{section.heading}</h2><ArticleBlocks content={section.content}/>{section.number === '03' ? <InterfaceDiagram/> : null}{section.number === '04' ? <blockquote>Make the integration reusable.<br/><span className="muted">Make the result reproducible.</span></blockquote> : null}</section>)}<div className="article-end"><p className="small-meta">Published 13 September 2026</p><TextLink href="/blog/">Back to the journal</TextLink><TextLink href={DISCORD}>Discuss with the community</TextLink></div></article></div>
  </div>;
}
