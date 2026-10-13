import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search, UserRound, X, Check, Sun, Moon, ShieldCheck } from 'lucide-react';
import { loadTalent } from './liveTalent';
import { TalentMyRequests, TalentProfileActions, TalentReviewQueue } from './TalentRequests';
import { buildDirectoryIndex, searchDirectory, type DirectoryPerson } from './directorySearch';
import './talent.css';
import './directory.css';

const count = (n: number) => n.toLocaleString('en-IN');
const initials = (name: string) => (name.match(/[\p{L}\p{N}]+/gu) || ['?']).slice(0, 2).map(n => [...n][0]).join('');
function LinkedIn({ person }: { person: DirectoryPerson }) { return <a className="button" href={person.linkedinUrl} target="_blank" rel="noopener noreferrer">View LinkedIn <ArrowUpRight size={15} aria-hidden="true" /></a>; }
function Badge({ claimed = false }: { claimed?: boolean }) { return <span className="research-badge"><UserRound size={14} aria-hidden="true"/> {claimed ? 'Claimed' : 'Unclaimed'}</span>; }
function Tags({ items }: { items: string[] }) { return items.length ? <div className="tags">{items.map(t => <span key={t}>{t}</span>)}</div> : <p className="fine">Not provided</p>; }

export function TalentDirectory() {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  async function refresh() { if (!people.length) setLoading(true); setLoadError(''); try { setPeople(await loadTalent()); } catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to load profiles.'); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  const index = useMemo(() => buildDirectoryIndex(people), [people]);
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const locations = useMemo(() => [...new Set(people.map(p => p.location))].sort(), [people]);
  const categories = useMemo(() => [...new Set(people.flatMap(p => [...p.skills, ...p.physicalAiAreas]))].sort(), [people]);
  const companies = useMemo(() => [...new Set(people.map(p => p.company).filter(Boolean))].sort(), [people]);
  const [route, setRoute] = useState(typeof window === 'undefined' ? '' : window.location.hash.slice(1));
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [place, setPlace] = useState('');
  const [category, setCategory] = useState('');
  const [company, setCompany] = useState('');
  const [sort, setSort] = useState<'relevance' | 'name'>('relevance');
  const [page, setPage] = useState(1);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const [theme, setTheme] = useState('light');
  const [request, setRequest] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const resultScroll = useRef(0);
  const previousRoute = useRef(route);
  const matches = useMemo(() => searchDirectory(index, { query: search, location: place, category, company, sort }), [index, search, place, category, company, sort]);
  const results = shortlistOnly ? matches.filter(m => shortlist.includes(m.person.id)) : matches;
  const pages = Math.max(1, Math.ceil(results.length / 25));
  const currentPage = Math.min(page, pages);
  const shown = results.slice((currentPage - 1) * 25, currentPage * 25);
  const person = useMemo(() => {
    if (!route.startsWith('profile/')) return undefined;
    try { return byId.get(decodeURIComponent(route.slice(8))); } catch { return undefined; }
  }, [route, byId]);
  useEffect(() => { const change = () => setRoute(location.hash.slice(1)); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    window.scrollTo(0, route.startsWith('profile/') ? 0 : resultScroll.current);
  }, [route]);

  function toggle(id: string) { setShortlist(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function openRequest(kind: string) { setRequest(kind); dialog.current?.showModal(); }
  function reset() { setQuery(''); setSearch(''); setPlace(''); setCategory(''); setCompany(''); setShortlistOnly(false); setPage(1); }
  const profileLink = (p: DirectoryPerson) => <a href={`#profile/${encodeURIComponent(p.id)}`} onClick={() => { resultScroll.current = window.scrollY; }}>View profile <ArrowUpRight size={14}/></a>;
  return <div className="talent-app directory-app" data-talent-theme={theme}>
    <header><div className="header-inner"><a className="wordmark" href="#talent">Armature AI Labs<span>Talent network</span></a><nav aria-label="Main navigation"><a href="#talent" className={route !== 'requests' && route !== 'review' ? 'active' : undefined}>Find talent</a><button onClick={() => openRequest('Find work')}>Find work</button><button onClick={() => openRequest('My projects')}>My projects</button><a href="#requests" className={route === 'requests' ? 'active' : undefined}>My requests</a><a href="#review">Review requests</a></nav><div className="header-actions"><div className="themes" aria-label="Colour theme"><button aria-label="Light theme" onClick={() => setTheme('light')} aria-pressed={theme === 'light'}><Sun size={14}/></button><button aria-label="Dark theme" onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'}><Moon size={14}/></button><button aria-label="Sepia theme" onClick={() => setTheme('sepia')} aria-pressed={theme === 'sepia'}>S</button></div><button className="button primary" onClick={() => openRequest('Post a requirement')}>Post a requirement</button></div></div></header>
    <main>
      {route === 'requests' ? <TalentMyRequests/> : loading ? <section><h1>Armature Talent Network</h1><p>Find engineers. Connect with builders. Get things made.</p><p>Discover engineers and builders across hardware, robotics and physical AI. Explore professional experience and research categories, then connect through LinkedIn. Unclaimed profiles are not owner-confirmed; each profile offers claim, correction and removal routes.</p><p role="status">Loading talent profiles…</p></section> : loadError ? <div role="alert"><h1>Unable to load the directory</h1><p>{loadError}</p><button onClick={() => void refresh()}>Try again</button></div> : route === 'review' ? <TalentReviewQueue onChange={refresh}/> : route.startsWith('profile/') ? person ? <>
        <a className="back" href="#talent"><ArrowLeft size={15}/> Back to results</a>
        <div className="profile-heading"><div className="avatar">{initials(person.name)}</div><div><Badge claimed={person.claimed}/><h1 tabIndex={-1}>{person.name}</h1><p>{person.title || 'Title not provided'}</p><p>{person.company || 'Company not provided'} · {person.location}</p></div><LinkedIn person={person}/></div>
        <div className="profile-layout"><section>
          <h2>Professional overview</h2><p className="profile-copy">{person.headline || 'Headline not provided'}</p>
          <section className="profile-section"><h2>Research categories</h2><p className="fine">{person.claimed ? 'Profile categories may be updated by the owner. Skills have not been independently verified.' : 'Imported classifications, not owner-confirmed or verified skills.'}</p><h3>Skills and capabilities</h3><Tags items={person.skills}/><h3>Physical AI areas</h3><Tags items={person.physicalAiAreas}/></section>
          <section className="profile-section"><h2>Experience</h2><dl className="directory-facts"><dt>Current title</dt><dd>{person.title || 'Not provided'}</dd><dt>Current company</dt><dd>{person.company || 'Not provided'}</dd><dt>Previous companies</dt><dd>{person.previousCompanies.join(' · ') || 'Not provided'}</dd><dt>Total experience</dt><dd>{person.yearsExperience === null ? 'Not provided' : `${person.yearsExperience} years · source-reported`}</dd><dt>Company tenure</dt><dd>Not provided</dd></dl></section>
          <section className="profile-section"><h2>Education & projects</h2><p>Not provided. No portfolio or education claims have been verified.</p></section>
          <section className="profile-section"><h2>Source information</h2><p>Research data as of {person.checkedAt}{person.claimed ? '; owners may have updated these details since import' : ''}. Not independently verified by Armature.</p><p className="fine">Source-reported summary: {person.summary || 'Not provided'}</p><LinkedIn person={person}/></section>
        </section><aside className="profile-side"><h3>Connect with this person</h3><p>Use their LinkedIn profile to introduce yourself and discuss a possible collaboration.</p><LinkedIn person={person}/><h3>Profile status</h3><Badge claimed={person.claimed}/><p>{person.availability || 'Availability unknown'}. Inclusion does not imply membership, endorsement or interest in paid work.</p><button onClick={() => toggle(person.id)}>{shortlist.includes(person.id) ? 'Remove from shortlist' : 'Add to shortlist'}</button><TalentProfileActions key={person.id} person={person} onChange={refresh}/></aside></div>
      </> : <div className="empty"><h1 tabIndex={-1}>Profile not found</h1><a href="#talent">Return to directory</a></div> : <>
        <div className="page-heading"><div><h1 tabIndex={-1}>Armature Talent Network</h1><p>Find engineers. Connect with builders. Get things made.</p></div></div>
        <p className="directory-intro">Discover engineers and builders identified through research to help the hardware and robotics ecosystem connect. Unclaimed profiles have not been confirmed by their owners. Inclusion does not imply membership, availability or endorsement.</p>
        <div className="desk-search"><form className="search-bar" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); setPage(1); }}><Search size={19} aria-hidden="true"/><input aria-label="Search talent" placeholder="A name, company, embedded firmware, SLAM…" value={query} onChange={e => setQuery(e.target.value)}/><button type="submit">Search</button></form><button className="button assisted" onClick={() => openRequest('Assisted matching')}><ShieldCheck size={16}/> Assisted matching</button></div>
        <p className="search-explainer">Keyword and research-category search · matches must appear in the supplied fields. Company names do not establish technical experience.</p>
        {search && <div className="query-summary"><span>Search:</span><button onClick={() => { setQuery(''); setSearch(''); setPage(1); }}>{search} <X size={13}/></button><span>Edit the query above to refine it.</span></div>}
        <div className="desk-layout">
        <aside className="specialty-sidebar directory-filters"><h2>Specialty</h2><div className="specialty-options">{['', 'Embedded', 'Perception', 'SLAM', 'Simulation', 'Motion Planning'].map(c => <button key={c} aria-pressed={category === c} onClick={() => { setCategory(c); setPage(1); }}><span>{c || 'All specialties'}</span><span>{count(c ? people.filter(p => p.skills.includes(c) || p.physicalAiAreas.includes(c)).length : people.length)}</span></button>)}</div><label>Location<select value={place} onChange={e => { setPlace(e.target.value); setPage(1); }}><option value="">All locations</option><option value="bengaluru">Bengaluru area (all variants)</option>{locations.map(l => <option key={l}>{l}</option>)}</select></label><label>Research category<select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Company<input list="directory-companies" value={company} placeholder="All companies" onChange={e => { setCompany(e.target.value); setPage(1); }}/><datalist id="directory-companies">{companies.map(c => <option key={c} value={c}/>)}</datalist></label><button onClick={reset}>Clear filters</button><p className="fine">Categories are research-derived. Availability has not been confirmed.</p></aside>
        <div className="desk-results">
        <div className="directory-toolbar"><p role="status">{count(results.length)} profiles{results.length > 0 && ` · showing ${count((currentPage - 1) * 25 + 1)}–${count(Math.min(currentPage * 25, results.length))}`}</p><button aria-pressed={shortlistOnly} onClick={() => { setShortlistOnly(!shortlistOnly); setPage(1); }}>Shortlist ({shortlist.length})</button><label>Sort<select value={sort} onChange={e => { setSort(e.target.value as 'relevance' | 'name'); setPage(1); }}><option value="relevance">Relevance</option><option value="name">Name</option></select></label></div>
        <section aria-label="Talent results">{shown.map(({person: p,matches: reasons}) => <article className="engineer-row" key={p.id}><div className="engineer-row-heading"><div className="avatar">{initials(p.name)}</div><div><h2>{p.name}</h2><p>{p.title || 'Title not provided'}</p><p>{p.company || 'Company not provided'} · {p.location}</p></div><Badge claimed={p.claimed}/></div><p className="engineer-summary">{p.headline || 'Headline not provided'}</p><Tags items={[...new Set([...p.skills, ...p.physicalAiAreas])].slice(0, 6)}/><p className="fine">{p.claimed ? 'Profile categories · not independently verified' : 'Research-derived categories'} · availability unknown · research data as of {p.checkedAt}</p>{reasons.length > 0 && <p className="match-note">Matched supplied fields: {reasons.join(' · ')}</p>}<div className="card-actions">{profileLink(p)}<LinkedIn person={p}/><button onClick={() => toggle(p.id)} aria-pressed={shortlist.includes(p.id)}>{shortlist.includes(p.id) ? <><Check size={14}/> Shortlisted</> : 'Add to shortlist'}</button></div></article>)}</section>
        {!results.length && <div className="empty"><h2>No matching profiles</h2><p>Try fewer terms or clear filters. Missing details are not evidence that someone lacks a skill.</p><button onClick={reset}>Clear filters</button></div>}
        <nav className="pagination" aria-label="Results pages"><button disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); window.scrollTo(0, 0); }}>Previous</button><span>Page {currentPage} of {pages}</span><button disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1); window.scrollTo(0, 0); }}>Next</button></nav></div>
        <aside className="shortlist-panel" aria-label="Your shortlist"><h2>Your shortlist · {shortlist.length}</h2>{shortlist.length ? shortlist.map(id => byId.get(id)).filter((p): p is DirectoryPerson => Boolean(p)).map(p => <div className="shortlist-person" key={p.id}><div className="avatar">{initials(p.name)}</div><div><strong>{p.name}</strong><p>{p.title || 'Title not provided'}</p></div><button aria-label={`Remove ${p.name} from shortlist panel`} onClick={() => toggle(p.id)}><X size={13}/></button></div>) : <p>Add engineers to compare their skills and relevant work.</p>}<button className="primary" disabled={!shortlist.length} onClick={() => { setShortlistOnly(!shortlistOnly); setPage(1); }}>{shortlistOnly ? 'Show all results' : 'View shortlisted profiles'}</button><p className="fine">A shortlist is a private research aid. It does not invite people or imply their interest.</p><div className="desk-help"><h3>Need help finding a team?</h3><p>Start with a brief to clarify skills, deliverables and scope.</p><button onClick={() => openRequest('Assisted matching')}>About project matching →</button><p className="fine">Project commissioning is coming soon.</p></div></aside></div>
      </>}
    </main><footer><span>Armature Talent Network</span><span>{count(people.length)} profiles · connect through LinkedIn</span></footer>
    <dialog ref={dialog} className="directory-dialog" aria-labelledby="request-heading"><h2 id="request-heading">{request}</h2><p>Project commissioning and assisted matching are coming soon. For now, discover engineers and connect through their LinkedIn profiles.</p><button onClick={() => dialog.current?.close()}>Close</button></dialog>
  </div>;
}
