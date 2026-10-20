import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./PeopleGalleryPage.css";

type Person = { id: string; display_name: string; bio: string; skills: string[]; has_avatar: boolean };
type OwnProfile = Person & { published: boolean; share_avatar: boolean; avatar_available: boolean; avatar_revision: string | null };
const consentVersion = "2026-10-20-public-directory-v1";
const pageSize = 24;
const emptyProfile: OwnProfile = { id: "", display_name: "", bio: "", skills: [], has_avatar: false, published: false, share_avatar: false, avatar_available: false, avatar_revision: null };

function Portrait({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  const host = import.meta.env.VITE_SUPABASE_URL?.trim();
  return <div className="people-portrait">{person.has_avatar && host && !failed
    ? <img src={`${host}/functions/v1/member-directory-avatar?profile_id=${encodeURIComponent(person.id)}`} alt={`${person.display_name} profile`} loading="lazy" onError={() => setFailed(true)} />
    : <span aria-label={`${person.display_name} initials`}>{person.display_name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("")}</span>}</div>;
}
function Skills({ skills }: { skills: string[] }) {
  return <ul className="people-skills" aria-label="Skills and interests">{skills.map(skill => <li key={skill}>{skill}</li>)}</ul>;
}
export function MembersDirectoryPage({ client = supabase }: { client?: SupabaseClient | null }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setItems([]);
    if (!client) { setError("The members directory is temporarily unavailable. Please try again later."); setLoading(false); return; }
    void Promise.resolve(client.rpc("list_public_member_profiles", { p_search: query, p_page: page, p_page_size: pageSize })).then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) throw failure;
      setItems(data?.items ?? []); setTotal(data?.total ?? 0);
    }).catch(() => { if (active) setError("We couldn’t load the directory. Please try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, query, page, retry]);
  function findPeople(event: FormEvent) { event.preventDefault(); setQuery(search.trim()); setPage(1); }
  return <div className="people-page">
    <section className="people-intro"><div><p className="eyebrow">The Armature community</p><h1>Meet the people.<br />Find your people.</h1></div><div><p>Different disciplines. A shared instinct to make things. Discover the builders, learners and researchers at Armature AI Labs.</p><Link to="/directory-profile">Manage my public profile →</Link></div></section>
    <form className="people-search" onSubmit={findPeople}><label htmlFor="people-search">Find a member</label><div><input id="people-search" type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="Search names, skills or interests…" /><button type="submit">Search</button></div></form>
    <div className="people-interests" aria-label="Browse by interest">{["All", "Robotics", "Embedded systems", "AI & vision", "Fabrication"].map(interest => <button key={interest} aria-pressed={query === (interest === "All" ? "" : interest)} onClick={() => { const term = interest === "All" ? "" : interest; setSearch(term); setQuery(term); setPage(1); }}>{interest}</button>)}</div>
    <div className="people-results" role="status">{loading ? "Loading members…" : error ? "Directory unavailable" : `${total} ${total === 1 ? "member" : "members"}${query ? ` matching “${query}”` : " sharing a public profile"}`}</div>
    {error ? <div role="alert" className="people-empty"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div> : !loading && items.length === 0 ? <div className="people-empty"><h2>{query ? "No matching members yet." : "A community, taking shape."}</h2><p>{query ? "Try another name or skill, or clear your search." : "Members can choose to share their profiles here. Be one of the first to introduce yourself."}</p>{query ? <button onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>Clear search</button> : <Link to="/directory-profile">Create my public profile →</Link>}</div> : <section className="people-grid" aria-label="Member profiles" aria-busy={loading}>{items.map(person => <article className="people-card" key={person.id}><Portrait person={person} /><div className="people-card-body"><h2>{person.display_name}</h2><p className="people-bio">{person.bio || "An Armature community member."}</p><Skills skills={person.skills} /><Link className="people-profile-link" to={`/members/${person.id}`}>View profile <span aria-hidden="true">↗</span></Link></div></article>)}</section>}
    {!error && !loading && total > pageSize && <nav className="people-pagination" aria-label="Directory pages"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(total / pageSize)}</span><button disabled={page * pageSize >= total} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
    <footer className="people-note"><p><strong>A community, on your terms.</strong><br />Public profiles are optional. Members choose their name, bio, skills and whether to share a photo. Private contact details and verification documents stay private.</p><p>Armature AI Labs<br />HSR Layout · Bengaluru</p></footer>
  </div>;
}
export function PublicDirectoryProfilePage({ client = supabase }: { client?: SupabaseClient | null }) {
  const { handle } = useParams();
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(false); setPerson(null);
    if (!client || !handle || !/^[0-9a-f-]{36}$/i.test(handle)) { setLoading(false); return; }
    void Promise.resolve(client.rpc("get_public_member_profile", { p_id: handle })).then(({ data, error: failure }) => { if (!active) return; if (failure) throw failure; setPerson(data); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, handle]);
  return <div className="people-page"><Link to="/members">← Back to members</Link>{loading ? <p role="status">Loading profile…</p> : error ? <p role="alert">We couldn’t load this profile. Please try again later.</p> : person ? <article className="people-detail"><Portrait person={person} /><div><p className="eyebrow">Armature community</p><h1>{person.display_name}</h1><p className="people-detail-bio">{person.bio}</p><Skills skills={person.skills} /></div></article> : <section className="people-empty"><h1>Profile not available</h1><p>This member may have chosen to keep their profile private.</p></section>}</div>;
}
export function DirectoryProfileSettingsPage({ client = supabase }: { client?: SupabaseClient | null }) {
  const [profile, setProfile] = useState<OwnProfile>(emptyProfile);
  const [skills, setSkills] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const persisted = useRef<OwnProfile>(emptyProfile);
  const generation = useRef(0);
  const identity = useRef<string | null | undefined>(undefined);
  const currentAuthId = useRef<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!client) { setLoading(false); return; }
    let active = true;
    const load = async (id: string | null) => {
      if (identity.current === id) return;
      identity.current = id; currentAuthId.current = id;
      const current = ++generation.current; setLoaded(false); setUserId(id); setProfile(emptyProfile); persisted.current = emptyProfile; setSkills(""); setNotice(""); setError(""); setBusy(false); setLoading(Boolean(id));
      if (!id) return;
      try { const { data, error: failure } = await client.rpc("get_my_directory_profile"); if (!active || current !== generation.current) return; if (failure) throw failure; const own = data ?? emptyProfile; setProfile(own); persisted.current = own; setSkills(own.skills.join(", ")); setLoaded(true); }
      catch { if (active && current === generation.current) setError("We couldn’t load your directory settings. Reload this page to try again."); }
      finally { if (active && current === generation.current) setLoading(false); }
    };
    const initialGeneration = generation.current;
    void client.auth.getSession().then(({ data }) => { if (active && generation.current === initialGeneration) void load(data.session?.user.id ?? null); });
    const { data: auth } = client.auth.onAuthStateChange((_event, session) => {
      if (!active || currentAuthId.current === (session?.user.id ?? null)) return;
      const current = ++generation.current;
      currentAuthId.current = session?.user.id ?? null;
      identity.current = undefined;
      setLoaded(false);
      window.setTimeout(() => { if (active && generation.current === current) void load(session?.user.id ?? null); }, 0);
    });
    return () => { active = false; generation.current++; identity.current = undefined; currentAuthId.current = undefined; auth.subscription.unsubscribe(); };
  }, [client]);
  async function save(event: FormEvent, hide = false) {
    event.preventDefault(); if (!client || busy || !loaded || currentAuthId.current !== userId) return;
    const current = generation.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const fields = hide ? persisted.current : profile;
      const { data, error: failure } = hide ? await client.rpc("hide_my_directory_profile") : await client.rpc("save_my_directory_profile", { p_display_name: fields.display_name.trim(), p_bio: fields.bio.trim(), p_skills: hide ? fields.skills : skills.split(",").map(value => value.trim()).filter(Boolean), p_published: hide ? false : profile.published, p_share_avatar: hide ? false : profile.share_avatar, p_consent_version: consentVersion, p_avatar_revision: profile.avatar_revision });
      if (current !== generation.current) return;
      if (failure) throw failure;
      setProfile(data); persisted.current = data; setSkills(data.skills.join(", ")); setNotice(data.published ? "Your public profile is now visible in the members directory." : "Your profile is private. It is not listed in the public directory.");
    } catch { if (current === generation.current) setError("Your profile could not be saved. Check your details and account eligibility, then try again."); }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <div className="people-page people-settings"><Link to="/members">← Members directory</Link><h1>Your public profile</h1><p>You can stay Basic and choose whether to appear in the gallery. Sharing a profile is optional and does not change your membership.</p>{loading ? <p role="status">Loading your settings…</p> : !userId ? <p><Link to="/onboarding">Sign in to manage your public profile →</Link></p> : !loaded ? <p role="alert">{error || "Your settings could not be loaded. Reload this page to try again."}</p> : <form onSubmit={save}>
    <label>Public name<input required maxLength={100} value={profile.display_name} onChange={event => setProfile({ ...profile, display_name: event.target.value })} /></label>
    <label>Short bio<textarea maxLength={600} rows={4} value={profile.bio} onChange={event => setProfile({ ...profile, bio: event.target.value })} /></label>
    <label>Skills and interests<input maxLength={500} value={skills} onChange={event => setSkills(event.target.value)} placeholder="Robotics, embedded systems, design" /></label><p className="people-help">Separate skills with commas. Up to 12 skills, 40 characters each. Don’t include private contact details in your bio.</p>
    <label className="people-consent"><input type="checkbox" checked={profile.published} onChange={event => setProfile({ ...profile, published: event.target.checked })} /><span>I want my name, bio and skills shown publicly on the Armature members directory. Anyone on the internet can view this profile.</span></label>
    <label className="people-consent"><input type="checkbox" disabled={!profile.avatar_available} checked={profile.share_avatar && profile.avatar_available} onChange={event => setProfile({ ...profile, share_avatar: event.target.checked })} /><span>I also allow my current profile photo to be shown publicly.</span></label>
    <p className="people-help">{profile.avatar_available ? "Only your retained profile photo can appear here, never your government ID. Replacing the photo requires a new public-sharing choice." : "No retained profile photo is available. Your initials will appear instead. You can manage your photo in My registration."} <Link to="/onboarding">My registration →</Link></p>
    <div className="people-actions"><button disabled={busy} type="submit">{busy ? "Saving…" : "Save profile choices"}</button>{profile.id && <button disabled={busy} type="button" onClick={event => void save(event, true)}>Hide my public profile</button>}</div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <p className="people-help">You can hide your profile at any time. Phone numbers, email addresses, membership reviews and identity documents are never included by this directory. <Link to="/privacy">Privacy notice</Link></p>
  </form>}</div>;
}
