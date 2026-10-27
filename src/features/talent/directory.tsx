import { Link } from 'react-router-dom';
import { TalentMemberNavigation, useTalentMember } from './TalentMemberNavigation';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search, UserRound, X, Check, Plus } from 'lucide-react';
import { availabilityLabel } from './talentAccount';
import { cachedTalentPage, cachedTalentFacets, clearTalentDirectoryCache, loadTalentPage, loadTalentFacets, loadTalentProfile, loadShortlistedProfiles, talentPageKey, talentResultsPerPage, type TalentPageQuery, type TalentPage, type TalentFacets } from './directoryData';
import { linkedinIdentity, type DirectoryPerson } from './directorySearch';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { TalentAvatar, TalentPhotoDemo } from './TalentPhoto';
import { TalentPortfolio } from './TalentPortfolio';
import { TalentCommunity, TalentCommunityLink } from './TalentCommunity';
import { useMarketplaceUnread } from './marketUnread';
import { TalentPagination } from './TalentPagination';
import { TalentSkills } from './TalentSkills';
import { TalentLoadingPlaceholder } from './TalentLoadingPlaceholder';
import './talent.css';
import './directory.css';


const TalentAddProfile = lazy(() => import('./TalentAddProfile').then(m => ({ default: m.TalentAddProfile })));
const TalentSubmissionHistory = lazy(() => import('./TalentAddProfile').then(m => ({ default: m.TalentSubmissionHistory })));
const TalentMyRequests = lazy(() => import('./TalentRequests').then(m => ({ default: m.TalentMyRequests })));
const TalentProfileActions = lazy(() => import('./TalentRequests').then(m => ({ default: m.TalentProfileActions })));
const TalentReviewQueue = lazy(() => import('./TalentRequests').then(m => ({ default: m.TalentReviewQueue })));
const TalentEditDemo = lazy(() => import('./TalentRequests').then(m => ({ default: m.TalentEditDemo })));
const TalentClaimDemo = lazy(() => import('./TalentRequests').then(m => ({ default: m.TalentClaimDemo })));
const TalentMarketplace = lazy(() => import('./Marketplace').then(m => ({ default: m.TalentMarketplace })));
const TalentChatRequest = lazy(() => import('./Marketplace').then(m => ({ default: m.TalentChatRequest })));

const categoryGroups = [
  { label: 'Perception & spatial understanding', items: ['Perception', 'SLAM', 'VLMs / Multimodal Perception', 'World Models / 3D Scene Learning'] },
  { label: 'Learning & simulation', items: ['Embodied AI & LLMs for Robots', 'RL & Sim-to-Real', 'Robot Learning (Imitation / Diffusion)', 'Simulation', 'VLA / Robot Foundation Models'] },
  { label: 'Hardware & interaction', items: ['Dexterous Manipulation & Grasping', 'Embedded', 'Humanoids & Legged Robots', 'Manipulation', 'Robot Hardware & Actuation', 'Tactile Sensing'] },
  { label: 'Planning & operation', items: ['Motion Planning', 'Teleoperation & Robot Data'] },
];
const groupedCategories = new Set(categoryGroups.flatMap(group => group.items));

const count = (n: number) => n.toLocaleString('en-IN');
function LinkedIn({ person, compact = false }: { person: DirectoryPerson; compact?: boolean }) { return <a className={compact ? 'card-link' : 'button'} href={person.linkedinUrl} target="_blank" rel="noopener noreferrer">{compact ? 'LinkedIn' : 'View LinkedIn'} <ArrowUpRight size={15} aria-hidden="true" /></a>; }
function Badge({ person, claimable = false, onClaim }: { person: DirectoryPerson; claimable?: boolean; onClaim?: () => void }) {
  const label = <><UserRound size={14} aria-hidden="true"/> {person.claimed ? 'Claimed' : 'Unclaimed'}</>;
  return claimable && !person.claimed ? <a className="research-badge claim-entry" href={`#claim/${encodeURIComponent(person.id)}`} aria-label={`Unclaimed. Claim profile for ${person.name}`} title="Is this you? Claim this profile" onClick={onClaim}>{label}</a> : <span className="research-badge">{label}</span>;
}
function Tags({ items }: { items: string[] }) { return items.length ? <div className="tags">{items.map(t => <span key={t}>{t}</span>)}</div> : <p className="fine">Not provided</p>; }

export function TalentDirectory() {
  const [resultPage, setResultPage] = useState<TalentPage>();
  const [facets, setFacets] = useState<TalentFacets>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [facetsError, setFacetsError] = useState('');
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [resolvedProfileId, setResolvedProfileId] = useState<string>();
  const [profileError, setProfileError] = useState('');
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [shortlistPeople, setShortlistPeople] = useState<Map<string, DirectoryPerson>>(() => new Map());
  const [shortlistError, setShortlistError] = useState('');
  async function refresh() { clearTalentDirectoryCache(); setRefreshEpoch(value => value + 1); }
  const locations = facets?.locations ?? [];
  const categories = facets?.categories ?? [];
  const companies = facets?.companies ?? [];
  const [route, setRoute] = useState('');
  const [routeReady, setRouteReady] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [place, setPlace] = useState('');
  const [category, setCategory] = useState<string[]>([]);
  const [company, setCompany] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [sort, setSort] = useState<'relevance' | 'name'>('relevance');
  const [page, setPage] = useState(1);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const { theme } = useTheme();
  const { isAdmin } = useApp();
  const unread = useMarketplaceUnread();
  const member = useTalentMember(route);
  const signedIn = Boolean(member.user) && !member.loading;
  const claimRoute = route.startsWith('claim/');
  const myProfileRoute = route === 'my-profile' || route === 'edit-profile' || route === 'requests';
  const privateRoute = claimRoute || ['my-profile', 'edit-profile', 'requests', 'add-profile', 'projects', 'post', 'review', 'market-review'].includes(route) || route.startsWith('messages');
  const profileLabel = member.profile?.ownerId && member.profile.published ? 'Edit my profile' : member.profile?.ownerId ? 'My profile' : member.profile?.started ? 'Continue profile setup' : member.profileError || !member.profile && member.user?.email_confirmed_at ? 'My profile' : 'Add my profile';
  const marketplaceRoute = ['work', 'projects', 'post', 'market-test', 'market-review'].includes(route) || route.startsWith('messages') || route.startsWith('project/');
  const resultScroll = useRef(0);
  const resultStatus = useRef<HTMLParagraphElement>(null);
  const previousRoute = useRef(route);
  const directoryView = !privateRoute && !marketplaceRoute && !route.startsWith('profile/');
  const pageQuery = useMemo<TalentPageQuery>(() => ({ query: search, location: place, category, company: companyFilter, sort, page, ids: shortlistOnly ? shortlist : null }), [search, place, category, companyFilter, sort, page, shortlistOnly, shortlist]);
  const queryKey = talentPageKey(pageQuery);
  const lastRequest = useRef({ key: '', epoch: -1 });
  const results = resultPage?.results ?? [];
  const total = resultPage?.total ?? 0;
  const pageSize = resultPage?.pageSize ?? talentResultsPerPage;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = resultPage?.page ?? page;
  const shown = results;
  const byId = useMemo(() => new Map([...shortlistPeople, ...shown.map(({ person: p }) => [p.id, p] as const), ...(person ? [[person.id, person] as const] : [])]), [shortlistPeople, shown, person]);
  let profileId: string | undefined;
  try { profileId = myProfileRoute ? member.profile?.ownerId : route.startsWith('profile/') || claimRoute ? decodeURIComponent(route.slice(claimRoute ? 6 : 8)) : undefined; } catch { /* Invalid profile links show the missing state. */ }
  const checkingProfile = Boolean(profileId && (profileLoading || resolvedProfileId !== profileId));

  useEffect(() => {
    const timer = window.setTimeout(() => setCompanyFilter(company), 200);
    return () => window.clearTimeout(timer);
  }, [company]);

  useEffect(() => {
    if (!routeReady || !directoryView) return;
    let alive = true;
    const cached = cachedTalentPage(pageQuery);
    if (cached) setResultPage(cached);
    setLoading(true); setLoadError('');
    const revalidate = lastRequest.current.key === queryKey || lastRequest.current.epoch !== refreshEpoch;
    lastRequest.current = { key: queryKey, epoch: refreshEpoch };
    void loadTalentPage(pageQuery, Boolean(cached) && revalidate).then(value => {
      if (alive) setResultPage(value);
    }).catch(error => { if (alive) setLoadError(error instanceof Error ? error.message : 'Unable to load profiles.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [queryKey, directoryView, routeReady, refreshEpoch]);

  useEffect(() => {
    if (!routeReady || !directoryView) return;
    let alive = true;
    const cached = cachedTalentFacets();
    if (cached) setFacets(cached);
    void loadTalentFacets().then(value => { if (alive) { setFacets(value); setFacetsError(''); } }).catch(() => { if (alive) setFacetsError('Filters could not be loaded.'); });
    return () => { alive = false; };
  }, [directoryView, routeReady, refreshEpoch]);

  useEffect(() => {
    if (!routeReady || !directoryView) return;
    const update = () => { if (document.visibilityState === 'visible') setRefreshEpoch(value => value + 1); };
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [directoryView, routeReady]);

  useEffect(() => {
    if (!shortlist.length) return;
    let alive = true;
    void loadShortlistedProfiles(shortlist).then(people => {
      if (!alive) return;
      const valid = new Map(people.map(p => [p.id, p]));
      setShortlistPeople(valid); setShortlistError('');
      setShortlist(current => current.some(id => !valid.has(id)) ? current.filter(id => valid.has(id)) : current);
    }).catch(() => { if (alive) { setShortlistPeople(new Map()); setShortlistError('Unable to refresh your shortlisted profiles.'); } });
    return () => { alive = false; };
  }, [shortlist, refreshEpoch]);

  useEffect(() => {
    if (!routeReady || !directoryView || loading || !resultPage || currentPage >= pages || loadError) return;
    const timer = window.setTimeout(() => { void loadTalentPage({ ...pageQuery, page: currentPage + 1 }).catch(() => {}); }, 700);
    return () => window.clearTimeout(timer);
  }, [queryKey, directoryView, routeReady, loading, resultPage, currentPage, pages, loadError]);

  useEffect(() => {
    setPerson(null); setProfileError('');
    if (!profileId) { setProfileLoading(false); setResolvedProfileId(undefined); return; }
    let alive = true;
    setProfileLoading(true);
    void loadTalentProfile(profileId).then(value => { if (alive) setPerson(value); })
      .catch(error => { if (alive) setProfileError(error instanceof Error ? error.message : 'Unable to load this profile.'); })
      .finally(() => { if (alive) { setProfileLoading(false); setResolvedProfileId(profileId); } });
    return () => { alive = false; };
  }, [profileId, refreshEpoch]);
  useEffect(() => { const change = () => { setRoute(location.hash.slice(1)); setRouteReady(true); }; change(); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    window.scrollTo(0, route === 'talent' ? resultScroll.current : 0);
  }, [route]);

  function toggle(id: string) { setShortlist(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); setShortlistPeople(current => { const next = new Map(current); const found = byId.get(id); if (shortlist.includes(id)) next.delete(id); else if (found) next.set(id, found); return next; }); }
  function changePage(next: number) { setPage(next); resultStatus.current?.focus({ preventScroll: true }); resultStatus.current?.scrollIntoView?.({ behavior: 'instant', block: 'start' }); }
  function reset() { setQuery(''); setSearch(''); setPlace(''); setCategory([]); setCompany(''); setShortlistOnly(false); setPage(1); }
  const profileLink = (p: DirectoryPerson) => <a href={`#profile/${encodeURIComponent(p.id)}`} onClick={() => { resultScroll.current = window.scrollY; }}>View profile <ArrowUpRight size={14}/></a>;
  const content = privateRoute && !signedIn ? <section><h1 tabIndex={-1}>Your Talent Network account</h1>{member.loading ? <p role="status">Checking your account…</p> : <><p>Sign in to manage your profile, projects and conversations.</p><Link className="button primary" to="/auth" state={{ from: window.location.pathname + window.location.hash }}>Sign in / join as a basic member</Link></>}</section> : myProfileRoute && !person ? <section><h1 tabIndex={-1}>My profile</h1>{member.profileError && <p role="alert">{member.profileError}</p>}<p>Your profile and submissions are linked to your signed-in account. Your email stays private.</p>{member.profile?.ownerId && <p>{member.profile.published ? checkingProfile ? 'Loading your profile…' : 'Unable to load your profile. Please refresh the directory.' : 'Your profile is not currently publicly listed.'}</p>}{member.profile && !member.profile.ownerId && <a className="button primary" href="#add-profile">{member.profile?.started ? 'Continue profile setup' : 'Add my profile'}</a>}<TalentMyRequests embedded/><TalentSubmissionHistory/></section> : import.meta.env.DEV && route === 'photo-demo' ? <TalentPhotoDemo/> : import.meta.env.DEV && route === 'claim-demo' ? <TalentClaimDemo/> : import.meta.env.DEV && route === 'edit-demo' ? <TalentEditDemo/> : route === 'add-profile' ? <><TalentAddProfile/><p className="talent-community-context">Starting your career? <TalentCommunityLink group="students"/></p></> : marketplaceRoute ? <><TalentMarketplace route={route}/>{route === 'work' && <p className="talent-community-context">Explore the community: <TalentCommunityLink group="jobs"/></p>}{route === 'post' && <p className="talent-community-context">Meet other leaders: <TalentCommunityLink group="leaders"/></p>}</> : route === 'review' ? <><TalentReviewQueue onChange={refresh}/><TalentSubmissionHistory review onChange={refresh}/></> : route.startsWith('profile/') || claimRoute || myProfileRoute ? checkingProfile ? <section><h1>Talent profile</h1><p role="status">Loading profile…</p></section> : profileError ? <div role="alert"><p>{profileError}</p><button onClick={refresh}>Try again</button></div> : person ? <>
        <a className="back" href="#talent"><ArrowLeft size={15}/> Back to results</a>
        <div className="profile-heading"><TalentAvatar person={person}/><div><Badge person={person} claimable={signedIn}/><h1 tabIndex={-1}>{person.name}</h1><p>{person.title || 'Title not provided'}</p><p>{person.company || 'Company not provided'} · {person.location}</p></div><LinkedIn person={person}/></div>
        <TalentProfileActions key={person.id} person={person} onChange={refresh} hideOwnerEdit openEditor={route === 'edit-profile'} openClaim={claimRoute}/><TalentChatRequest person={person}/>{myProfileRoute && <details><summary>Profile updates and review history</summary><TalentMyRequests embedded/><TalentSubmissionHistory/></details>}
        <div className="profile-layout"><section>
          <h2>Professional overview</h2><p className="profile-copy">{person.headline || 'Headline not provided'}</p>
          <section className="profile-section"><h2>Categories</h2><p className="fine">{person.source === 'member' ? 'Member-provided skills and categories. Not independently verified.' : person.claimed ? 'Profile categories may be updated by the owner. Skills have not been independently verified.' : 'Imported classifications, not owner-confirmed or verified skills.'}</p><h3>Skills and capabilities</h3><Tags items={person.skills}/><h3>Physical AI areas</h3><Tags items={person.physicalAiAreas}/></section>
          <section className="profile-section"><h2>Experience</h2>{person.experience && <><p className="profile-copy">{person.experience}</p><p className="fine">Member-provided · not independently verified</p></>}<dl className="directory-facts"><dt>Current title</dt><dd>{person.title || 'Not provided'}</dd><dt>Current company</dt><dd>{person.company || 'Not provided'}</dd><dt>Previous companies</dt><dd>{person.previousCompanies.join(' · ') || 'Not provided'}</dd><dt>Total experience</dt><dd>{person.yearsExperience === null ? 'Not provided' : `${person.yearsExperience} years · source-reported`}</dd><dt>Company tenure</dt><dd>Not provided</dd></dl></section>
          <section className="profile-section"><h2>Education</h2><p className="profile-copy">{person.education || 'Not provided'}</p>{person.education && <p className="fine">Member-provided · not independently verified</p>}</section>
          <TalentPortfolio projects={person.portfolioProjects}/><section className="profile-section"><h2>Source information</h2><p>{person.source === 'member' ? 'Member-provided data as of ' : 'Research data as of '}{person.checkedAt}{person.claimed && person.source !== 'member' ? '; owners may have updated these details since import' : ''}. Not independently verified by Armature.</p><p className="fine">{person.source === 'member' ? 'Member-provided summary:' : 'Source-reported summary:'} {person.summary || 'Not provided'}</p><LinkedIn person={person}/></section>
        </section><aside className="profile-side"><h3>Connect with this person</h3><p>Use their LinkedIn profile to introduce yourself and discuss a possible collaboration.</p><LinkedIn person={person}/><h3>Profile status</h3><Badge person={person} claimable={signedIn}/><p>{availabilityLabel(person.availability)}. {person.availability === 'available' ? 'Availability is self-reported. Confirm scope and timing directly with this person.' : 'Inclusion does not imply membership, endorsement or interest in paid work.'}</p><button onClick={() => toggle(person.id)}>{shortlist.includes(person.id) ? 'Remove from shortlist' : 'Add to shortlist'}</button></aside></div>
      </> : <div className="empty"><h1 tabIndex={-1}>Profile not found</h1><a href="#talent">Return to directory</a></div> : <>
        <div className="page-heading"><div><h1 tabIndex={-1}>Armature Talent Network</h1><p>Find engineers. Connect with builders. Get things made.</p></div></div>
        <p className="directory-intro">Discover engineers and builders identified through research to help the hardware and robotics ecosystem connect. Unclaimed profiles have not been confirmed by their owners. Inclusion does not imply membership, availability or endorsement.</p>
        <p className="talent-community-context"><TalentCommunityLink group="engineers"/></p>
        <h2 className="search-heading"><label htmlFor="talent-search">Search by name, LinkedIn profile, role, skill or company</label></h2>
        <div className="desk-search"><form className="search-bar" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); if (linkedinIdentity(query)) { setPlace(''); setCategory([]); setCompany(''); setShortlistOnly(false); } setPage(1); }}><Search size={19} aria-hidden="true"/><input id="talent-search" aria-describedby="talent-search-examples" placeholder="Enter a name, keyword or LinkedIn profile URL…" value={query} onChange={e => setQuery(e.target.value)}/><button type="submit">Search</button></form></div>
        <p id="talent-search-examples" className="search-explainer">Try a person’s name, “firmware engineer”, “computer vision”, a company name, or paste their linkedin.com/in/… URL. Use Category and Location below to narrow your results.</p>
        {search && <div className="query-summary"><span>Search:</span><button onClick={() => { setQuery(''); setSearch(''); setPage(1); }}>{search} <X size={13}/></button><span>Edit the query above to refine it.</span></div>}
        <div className="desk-layout">
        <aside className="specialty-sidebar directory-filters"><h2>Specialty</h2><div className="specialty-options">{['', 'Embedded', 'Perception', 'SLAM', 'Simulation', 'Motion Planning'].map(c => <button key={c} aria-pressed={c ? category.length === 1 && category[0] === c : category.length === 0} onClick={() => { setCategory(c ? [c] : []); setPage(1); }}><span>{c || 'All specialties'}</span><span>{facets ? count(c ? facets.specialties[c] ?? 0 : facets.total) : '…'}</span></button>)}</div><fieldset className="category-filter"><legend>Category</legend><div className="category-filter-heading"><span aria-live="polite">{category.length ? `${category.length} selected` : 'All categories'}</span><button type="button" onClick={() => { setCategory([]); setPage(1); }}>Clear</button></div><p className="fine">Match any selected category</p>{[...categoryGroups, { label: 'Other categories', items: categories.filter(c => !groupedCategories.has(c)) }].map(group => { const items = group.items.filter(c => categories.includes(c)); return items.length > 0 && <div className="category-group" key={group.label}><h3>{group.label}</h3>{items.map(c => <label className="category-option" key={c}><input type="checkbox" checked={category.includes(c)} onChange={e => { setCategory(current => e.target.checked ? [...current, c] : current.filter(value => value !== c)); setPage(1); }}/><span>{c}</span></label>)}</div>; })}</fieldset><label>Location<select value={place} onChange={e => { setPlace(e.target.value); setPage(1); }}><option value="">All locations</option><option value="bengaluru">Bengaluru area (all variants)</option>{locations.map(l => <option key={l}>{l}</option>)}</select></label><label>Company<input list="directory-companies" value={company} placeholder="All companies" onChange={e => { setCompany(e.target.value); setPage(1); }}/><datalist id="directory-companies">{companies.map(c => <option key={c} value={c}/>)}</datalist></label><button onClick={reset}>Clear filters</button><p className="fine">Categories may be research-derived or member-provided. Neither is independently verified.</p></aside>
        <div className="desk-results" aria-busy={loading}>
        {loadError && <div role="alert"><p>{loadError}</p><button onClick={refresh}>Try again</button></div>}
        {facetsError && <p role="alert">{facetsError} <button onClick={refresh}>Retry filters</button></p>}
        <div className="directory-toolbar"><p role="status" ref={resultStatus} tabIndex={-1}>{!resultPage ? loading ? 'Loading talent profiles…' : 'Talent profiles unavailable' : `${count(total)} ${total === 1 ? 'profile' : 'profiles'}${total > 0 ? ` · showing ${count((currentPage - 1) * pageSize + 1)}–${count(Math.min(currentPage * pageSize, total))}` : ''}${loading ? ' · Updating…' : ''}`}</p><button aria-pressed={shortlistOnly} onClick={() => { setShortlistOnly(!shortlistOnly); setPage(1); }}>Shortlist ({shortlist.length})</button><label>Sort<select value={sort} onChange={e => { setSort(e.target.value as 'relevance' | 'name'); setPage(1); }}><option value="relevance">Relevance</option><option value="name">Name</option></select></label></div>
        <section className="talent-result-list" aria-label="Talent results">{!resultPage && loading && <TalentLoadingPlaceholder/>}{shown.map(({person: p,matches: reasons}) => <article className="engineer-row talent-result" key={p.id}><div className="engineer-row-heading"><TalentAvatar person={p}/><div><h2>{p.name}</h2><p className="talent-card-title" title={p.title}>{p.title || 'Title not provided'}</p><p className="talent-card-meta" title={`${p.company || 'Company not provided'} · ${p.location}`}>{p.company || 'Company not provided'} · {p.location}</p></div><Badge person={p} claimable={signedIn} onClaim={() => { resultScroll.current = window.scrollY; }}/></div><p className="engineer-summary" title={p.headline}>{p.headline || 'Headline not provided'}</p><TalentSkills items={[...new Set([...p.skills, ...p.physicalAiAreas])]} name={p.name}/>{reasons.length > 0 && <p className="match-note">Matched supplied fields: {reasons.join(' · ')}</p>}<div className="card-actions">{profileLink(p)}<LinkedIn person={p} compact/><button onClick={() => toggle(p.id)} aria-label={`${shortlist.includes(p.id) ? 'Shortlisted' : 'Shortlist'} ${p.name}`} aria-pressed={shortlist.includes(p.id)}>{shortlist.includes(p.id) ? <><Check size={12} aria-hidden="true"/> Shortlisted</> : <>Shortlist <Plus size={12} aria-hidden="true"/></>}</button></div></article>)}</section>
        {!loading && !loadError && !total && <div className="empty"><h2>No matching profiles</h2><p>Try fewer terms or clear filters. Missing details are not evidence that someone lacks a skill.</p><button onClick={reset}>Clear filters</button></div>}
        <TalentPagination page={currentPage} pages={pages} pageSize={pageSize} loading={loading} total={total} onChange={changePage}/></div>
        <aside className="shortlist-panel" aria-label="Your shortlist"><h2>Your shortlist · {shortlist.length}</h2>{shortlistError && <p role="alert">{shortlistError}</p>}{shortlist.length ? shortlist.map(id => byId.get(id)).filter((p): p is DirectoryPerson => Boolean(p)).map(p => <div className="shortlist-person" key={p.id}><TalentAvatar person={p}/><div><strong>{p.name}</strong><p>{p.title || 'Title not provided'}</p></div><button aria-label={`Remove ${p.name} from shortlist panel`} onClick={() => toggle(p.id)}><X size={13}/></button></div>) : <p>Add engineers to compare their skills and relevant work.</p>}<button className="primary" disabled={!shortlist.length} onClick={() => { setShortlistOnly(!shortlistOnly); setPage(1); }}>{shortlistOnly ? 'Show all results' : 'View shortlisted profiles'}</button><p className="fine">A shortlist is a private research aid. It does not invite people or imply their interest.</p></aside></div>
      </>;
  return <div className="talent-app directory-app" data-talent-theme={theme}>
    <TalentMemberNavigation route={route} signedIn={signedIn} isAdmin={isAdmin} unread={unread} profileLabel={profileLabel}/>
    {import.meta.env.DEV && <div className="talent-local-tools">Local build · <a href="#edit-demo">Test profile editing</a> · <a href="#photo-demo">Test profile photos</a> · <a href="#claim-demo">Test claiming</a> · <a href="#market-test">Test marketplace</a></div>}
    <div className="directory-content">
      {directoryView ? content : <Suspense fallback={<p role="status">Loading this view…</p>}>{content}</Suspense>}
      <TalentCommunity/>
    </div>

  </div>;
}
