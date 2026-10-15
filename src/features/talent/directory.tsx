import { Link } from 'react-router-dom';
import { TalentMemberNavigation, useTalentMember } from './TalentMemberNavigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search, UserRound, X, Check } from 'lucide-react';
import { TalentAddProfile, TalentSubmissionHistory, availabilityLabel } from './TalentAddProfile';
import { loadTalent } from './liveTalent';
import { TalentMyRequests, TalentProfileActions, TalentReviewQueue, TalentEditDemo, TalentClaimDemo } from './TalentRequests';
import { buildDirectoryIndex, searchDirectory, linkedinIdentity, type DirectoryPerson } from './directorySearch';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { TalentAvatar, TalentPhotoDemo } from './TalentPhoto';
import { TalentPortfolio } from './TalentPortfolio';
import { TalentCommunity, TalentCommunityLink } from './TalentCommunity';
import { TalentMarketplace, TalentChatRequest, useMarketplaceUnread } from './Marketplace';
import './talent.css';
import './directory.css';


const categoryGroups = [
  { label: 'Perception & spatial understanding', items: ['Perception', 'SLAM', 'VLMs / Multimodal Perception', 'World Models / 3D Scene Learning'] },
  { label: 'Learning & simulation', items: ['Embodied AI & LLMs for Robots', 'RL & Sim-to-Real', 'Robot Learning (Imitation / Diffusion)', 'Simulation', 'VLA / Robot Foundation Models'] },
  { label: 'Hardware & interaction', items: ['Dexterous Manipulation & Grasping', 'Embedded', 'Humanoids & Legged Robots', 'Manipulation', 'Robot Hardware & Actuation', 'Tactile Sensing'] },
  { label: 'Planning & operation', items: ['Motion Planning', 'Teleoperation & Robot Data'] },
];
const groupedCategories = new Set(categoryGroups.flatMap(group => group.items));

const count = (n: number) => n.toLocaleString('en-IN');
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
  const [category, setCategory] = useState<string[]>([]);
  const [company, setCompany] = useState('');
  const [sort, setSort] = useState<'relevance' | 'name'>('relevance');
  const [page, setPage] = useState(1);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const { theme } = useTheme();
  const { isAdmin } = useApp();
  const unread = useMarketplaceUnread();
  const member = useTalentMember(route);
  const signedIn = Boolean(member.user) && !member.loading;
  const myProfileRoute = route === 'my-profile' || route === 'requests';
  const privateRoute = ['my-profile', 'requests', 'add-profile', 'projects', 'post', 'review', 'market-review'].includes(route) || route.startsWith('messages');
  const profileLabel = member.profile?.ownerId ? 'My profile' : member.profile?.started ? 'Continue profile setup' : member.profileError || !member.profile && member.user?.email_confirmed_at ? 'My profile' : 'Add my profile';
  const marketplaceRoute = ['work', 'projects', 'post', 'market-test', 'market-review'].includes(route) || route.startsWith('messages') || route.startsWith('project/');
  const resultScroll = useRef(0);
  const previousRoute = useRef(route);
  const matches = useMemo(() => searchDirectory(index, { query: search, location: place, category, company, sort }), [index, search, place, category, company, sort]);
  const results = shortlistOnly ? matches.filter(m => shortlist.includes(m.person.id)) : matches;
  const pages = Math.max(1, Math.ceil(results.length / 25));
  const currentPage = Math.min(page, pages);
  const shown = results.slice((currentPage - 1) * 25, currentPage * 25);
  const person = useMemo(() => {
    if (myProfileRoute) return member.profile?.ownerId ? byId.get(member.profile.ownerId) : undefined;
    if (!route.startsWith('profile/')) return undefined;
    try { return byId.get(decodeURIComponent(route.slice(8))); } catch { return undefined; }
  }, [route, byId, myProfileRoute, member.profile?.ownerId]);
  useEffect(() => { const change = () => setRoute(location.hash.slice(1)); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    window.scrollTo(0, route === 'talent' ? resultScroll.current : 0);
  }, [route]);

  function toggle(id: string) { setShortlist(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function reset() { setQuery(''); setSearch(''); setPlace(''); setCategory([]); setCompany(''); setShortlistOnly(false); setPage(1); }
  const profileLink = (p: DirectoryPerson) => <a href={`#profile/${encodeURIComponent(p.id)}`} onClick={() => { resultScroll.current = window.scrollY; }}>View profile <ArrowUpRight size={14}/></a>;
  return <div className="talent-app directory-app" data-talent-theme={theme}>
    <TalentMemberNavigation route={route} signedIn={signedIn} isAdmin={isAdmin} unread={unread} profileLabel={profileLabel}/>
    {import.meta.env.DEV && <div className="talent-local-tools">Local build · <a href="#edit-demo">Test profile editing</a> · <a href="#photo-demo">Test profile photos</a> · <a href="#claim-demo">Test claiming</a> · <a href="#market-test">Test marketplace</a></div>}
    <div className="directory-content">
      {privateRoute && !signedIn ? <section><h1 tabIndex={-1}>Your Talent Network account</h1>{member.loading ? <p role="status">Checking your account…</p> : <><p>Sign in to manage your profile, projects and conversations.</p><Link className="button primary" to="/auth" state={{ from: window.location.pathname + window.location.hash }}>Sign in / join as a basic member</Link></>}</section> : myProfileRoute && !person ? <section><h1 tabIndex={-1}>My profile</h1>{member.profileError && <p role="alert">{member.profileError}</p>}<p>Your profile and submissions are linked to your signed-in account. Your email stays private.</p>{member.profile?.ownerId && <p>{member.profile.published ? loading ? 'Loading your profile…' : 'Unable to load your profile. Please refresh the directory.' : 'Your profile is not currently publicly listed.'}</p>}{member.profile && !member.profile.ownerId && <a className="button primary" href="#add-profile">{member.profile?.started ? 'Continue profile setup' : 'Add my profile'}</a>}<TalentMyRequests embedded/><TalentSubmissionHistory/></section> : import.meta.env.DEV && route === 'photo-demo' ? <TalentPhotoDemo/> : import.meta.env.DEV && route === 'claim-demo' ? <TalentClaimDemo/> : import.meta.env.DEV && route === 'edit-demo' ? <TalentEditDemo/> : route === 'add-profile' ? <><TalentAddProfile/><p className="talent-community-context">Starting your career? <TalentCommunityLink group="students"/></p></> : marketplaceRoute ? <><TalentMarketplace route={route}/>{route === 'work' && <p className="talent-community-context">Explore the community: <TalentCommunityLink group="jobs"/></p>}{route === 'post' && <p className="talent-community-context">Meet other leaders: <TalentCommunityLink group="leaders"/></p>}</> : loading ? <section><h1>Armature Talent Network</h1><p>Find engineers. Connect with builders. Get things made.</p><p>Discover engineers and builders across hardware, robotics and physical AI. Explore professional experience and research categories, then connect through LinkedIn. Unclaimed profiles are not owner-confirmed; each profile offers claim, correction and removal routes.</p><p role="status">Loading talent profiles…</p></section> : loadError ? <div role="alert"><h1>Unable to load the directory</h1><p>{loadError}</p><button onClick={() => void refresh()}>Try again</button></div> : route === 'review' ? <><TalentReviewQueue onChange={refresh}/><TalentSubmissionHistory review onChange={refresh}/></> : route.startsWith('profile/') || myProfileRoute ? person ? <>
        <a className="back" href="#talent"><ArrowLeft size={15}/> Back to results</a>
        <div className="profile-heading"><TalentAvatar person={person}/><div><Badge claimed={person.claimed}/><h1 tabIndex={-1}>{person.name}</h1><p>{person.title || 'Title not provided'}</p><p>{person.company || 'Company not provided'} · {person.location}</p></div><LinkedIn person={person}/></div>
        <TalentProfileActions key={person.id} person={person} onChange={refresh}/><TalentChatRequest person={person}/>{myProfileRoute && <details><summary>Profile updates and review history</summary><TalentMyRequests embedded/><TalentSubmissionHistory/></details>}
        <div className="profile-layout"><section>
          <h2>Professional overview</h2><p className="profile-copy">{person.headline || 'Headline not provided'}</p>
          <section className="profile-section"><h2>Categories</h2><p className="fine">{person.source === 'member' ? 'Member-provided skills and categories. Not independently verified.' : person.claimed ? 'Profile categories may be updated by the owner. Skills have not been independently verified.' : 'Imported classifications, not owner-confirmed or verified skills.'}</p><h3>Skills and capabilities</h3><Tags items={person.skills}/><h3>Physical AI areas</h3><Tags items={person.physicalAiAreas}/></section>
          <section className="profile-section"><h2>Experience</h2>{person.experience && <><p className="profile-copy">{person.experience}</p><p className="fine">Member-provided · not independently verified</p></>}<dl className="directory-facts"><dt>Current title</dt><dd>{person.title || 'Not provided'}</dd><dt>Current company</dt><dd>{person.company || 'Not provided'}</dd><dt>Previous companies</dt><dd>{person.previousCompanies.join(' · ') || 'Not provided'}</dd><dt>Total experience</dt><dd>{person.yearsExperience === null ? 'Not provided' : `${person.yearsExperience} years · source-reported`}</dd><dt>Company tenure</dt><dd>Not provided</dd></dl></section>
          <section className="profile-section"><h2>Education</h2><p className="profile-copy">{person.education || 'Not provided'}</p>{person.education && <p className="fine">Member-provided · not independently verified</p>}</section>
          <TalentPortfolio projects={person.portfolioProjects}/><section className="profile-section"><h2>Source information</h2><p>{person.source === 'member' ? 'Member-provided data as of ' : 'Research data as of '}{person.checkedAt}{person.claimed && person.source !== 'member' ? '; owners may have updated these details since import' : ''}. Not independently verified by Armature.</p><p className="fine">{person.source === 'member' ? 'Member-provided summary:' : 'Source-reported summary:'} {person.summary || 'Not provided'}</p><LinkedIn person={person}/></section>
        </section><aside className="profile-side"><h3>Connect with this person</h3><p>Use their LinkedIn profile to introduce yourself and discuss a possible collaboration.</p><LinkedIn person={person}/><h3>Profile status</h3><Badge claimed={person.claimed}/><p>{availabilityLabel(person.availability)}. {person.availability === 'available' ? 'Availability is self-reported. Confirm scope and timing directly with this person.' : 'Inclusion does not imply membership, endorsement or interest in paid work.'}</p><button onClick={() => toggle(person.id)}>{shortlist.includes(person.id) ? 'Remove from shortlist' : 'Add to shortlist'}</button></aside></div>
      </> : <div className="empty"><h1 tabIndex={-1}>Profile not found</h1><a href="#talent">Return to directory</a></div> : <>
        <div className="page-heading"><div><h1 tabIndex={-1}>Armature Talent Network</h1><p>Find engineers. Connect with builders. Get things made.</p></div></div>
        <p className="directory-intro">Discover engineers and builders identified through research to help the hardware and robotics ecosystem connect. Unclaimed profiles have not been confirmed by their owners. Inclusion does not imply membership, availability or endorsement.</p>
        <p className="talent-community-context"><TalentCommunityLink group="engineers"/></p>
        <div className="desk-search"><form className="search-bar" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); if (linkedinIdentity(query)) { setPlace(''); setCategory([]); setCompany(''); setShortlistOnly(false); } setPage(1); }}><Search size={19} aria-hidden="true"/><input aria-label="Search talent" placeholder="Name, skills, company or LinkedIn profile URL…" value={query} onChange={e => setQuery(e.target.value)}/><button type="submit">Search</button></form></div>
        <p className="search-explainer">Paste a LinkedIn profile URL to find that person across the directory, or search by keyword and category. Keyword matches must appear in the supplied fields. Company names do not establish technical experience.</p>
        {search && <div className="query-summary"><span>Search:</span><button onClick={() => { setQuery(''); setSearch(''); setPage(1); }}>{search} <X size={13}/></button><span>Edit the query above to refine it.</span></div>}
        <div className="desk-layout">
        <aside className="specialty-sidebar directory-filters"><h2>Specialty</h2><div className="specialty-options">{['', 'Embedded', 'Perception', 'SLAM', 'Simulation', 'Motion Planning'].map(c => <button key={c} aria-pressed={c ? category.length === 1 && category[0] === c : category.length === 0} onClick={() => { setCategory(c ? [c] : []); setPage(1); }}><span>{c || 'All specialties'}</span><span>{count(c ? people.filter(p => p.skills.includes(c) || p.physicalAiAreas.includes(c)).length : people.length)}</span></button>)}</div><fieldset className="category-filter"><legend>Category</legend><div className="category-filter-heading"><span aria-live="polite">{category.length ? `${category.length} selected` : 'All categories'}</span><button type="button" onClick={() => { setCategory([]); setPage(1); }}>Clear</button></div><p className="fine">Match any selected category</p>{[...categoryGroups, { label: 'Other categories', items: categories.filter(c => !groupedCategories.has(c)) }].map(group => { const items = group.items.filter(c => categories.includes(c)); return items.length > 0 && <div className="category-group" key={group.label}><h3>{group.label}</h3>{items.map(c => <label className="category-option" key={c}><input type="checkbox" checked={category.includes(c)} onChange={e => { setCategory(current => e.target.checked ? [...current, c] : current.filter(value => value !== c)); setPage(1); }}/><span>{c}</span></label>)}</div>; })}</fieldset><label>Location<select value={place} onChange={e => { setPlace(e.target.value); setPage(1); }}><option value="">All locations</option><option value="bengaluru">Bengaluru area (all variants)</option>{locations.map(l => <option key={l}>{l}</option>)}</select></label><label>Company<input list="directory-companies" value={company} placeholder="All companies" onChange={e => { setCompany(e.target.value); setPage(1); }}/><datalist id="directory-companies">{companies.map(c => <option key={c} value={c}/>)}</datalist></label><button onClick={reset}>Clear filters</button><p className="fine">Categories may be research-derived or member-provided. Neither is independently verified.</p></aside>
        <div className="desk-results">
        <div className="directory-toolbar"><p role="status">{count(results.length)} {results.length === 1 ? 'profile' : 'profiles'}{results.length > 0 && ` · showing ${count((currentPage - 1) * 25 + 1)}–${count(Math.min(currentPage * 25, results.length))}`}</p><button aria-pressed={shortlistOnly} onClick={() => { setShortlistOnly(!shortlistOnly); setPage(1); }}>Shortlist ({shortlist.length})</button><label>Sort<select value={sort} onChange={e => { setSort(e.target.value as 'relevance' | 'name'); setPage(1); }}><option value="relevance">Relevance</option><option value="name">Name</option></select></label></div>
        <section aria-label="Talent results">{shown.map(({person: p,matches: reasons}) => <article className="engineer-row" key={p.id}><div className="engineer-row-heading"><TalentAvatar person={p}/><div><h2>{p.name}</h2><p>{p.title || 'Title not provided'}</p><p>{p.company || 'Company not provided'} · {p.location}</p></div><Badge claimed={p.claimed}/></div><p className="engineer-summary">{p.headline || 'Headline not provided'}</p><Tags items={[...new Set([...p.skills, ...p.physicalAiAreas])].slice(0, 6)}/><p className="fine">{p.source === 'member' ? 'Member-provided · not independently verified' : p.claimed ? 'Profile categories · not independently verified' : 'Research-derived categories'} · {availabilityLabel(p.availability)} · {p.source === 'member' ? 'updated' : 'research data as of'} {p.checkedAt}</p>{reasons.length > 0 && <p className="match-note">Matched supplied fields: {reasons.join(' · ')}</p>}<div className="card-actions">{profileLink(p)}<LinkedIn person={p}/><button onClick={() => toggle(p.id)} aria-pressed={shortlist.includes(p.id)}>{shortlist.includes(p.id) ? <><Check size={14}/> Shortlisted</> : 'Add to shortlist'}</button></div></article>)}</section>
        {!results.length && <div className="empty"><h2>No matching profiles</h2><p>Try fewer terms or clear filters. Missing details are not evidence that someone lacks a skill.</p><button onClick={reset}>Clear filters</button></div>}
        <nav className="pagination" aria-label="Results pages"><button disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); window.scrollTo(0, 0); }}>Previous</button><span>Page {currentPage} of {pages}</span><button disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1); window.scrollTo(0, 0); }}>Next</button></nav></div>
        <aside className="shortlist-panel" aria-label="Your shortlist"><h2>Your shortlist · {shortlist.length}</h2>{shortlist.length ? shortlist.map(id => byId.get(id)).filter((p): p is DirectoryPerson => Boolean(p)).map(p => <div className="shortlist-person" key={p.id}><TalentAvatar person={p}/><div><strong>{p.name}</strong><p>{p.title || 'Title not provided'}</p></div><button aria-label={`Remove ${p.name} from shortlist panel`} onClick={() => toggle(p.id)}><X size={13}/></button></div>) : <p>Add engineers to compare their skills and relevant work.</p>}<button className="primary" disabled={!shortlist.length} onClick={() => { setShortlistOnly(!shortlistOnly); setPage(1); }}>{shortlistOnly ? 'Show all results' : 'View shortlisted profiles'}</button><p className="fine">A shortlist is a private research aid. It does not invite people or imply their interest.</p></aside></div>
      </>}
      <TalentCommunity/>
    </div>

  </div>;
}
