import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { DirectoryPerson } from './directorySearch';
import { TalentPhotoEditor } from './TalentPhoto';
import { talentClient, talentRpc, type TalentRequest, type TalentStatus } from './liveTalent';
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
const textFields = ['name', 'title', 'company', 'location', 'headline', 'summary', 'education', 'experience'] as const;
const listFields = ['skills', 'physicalAiAreas', 'previousCompanies'] as const;
const labels: Record<string, string> = { name: 'Name', title: 'Current title', company: 'Current company', location: 'Location', headline: 'Headline', summary: 'Professional summary', education: 'Education (self-reported)', experience: 'Experience (self-reported)', skills: 'Skills and capabilities', physicalAiAreas: 'Physical AI areas', previousCompanies: 'Previous companies' };
export const claimDeclarationVersion = '2026-10-13-v1';
export const claimDeclarationText = 'I declare that I am the person named in this profile and that the linked LinkedIn profile represents me. The information and evidence I provide are accurate to the best of my knowledge. I am not claiming this profile on behalf of another person. I understand that Armature will manually review my claim before granting editing access, and that a false claim may be rejected or my access revoked.';
function ClaimDeclaration({ person }: { person: DirectoryPerson }) {
  return <fieldset className="claim-declaration"><legend>Ownership declaration</legend><p>Claiming: <strong>{person.name}</strong></p>{person.linkedinUrl && <a href={person.linkedinUrl} target="_blank" rel="noopener noreferrer">Check the LinkedIn profile</a>}<p>{claimDeclarationText}</p><label>Your full name<input name="signed_name" required minLength={2} maxLength={200} autoComplete="name" placeholder="Type your full name"/></label><label className="claim-accept"><input name="declaration_accepted" type="checkbox" required/>I have read and agree to this ownership declaration. My typed name records my confirmation.</label><p className="fine">Your declaration, account, profile and submission time are recorded privately for review. Submission does not grant ownership or editing access.</p></fieldset>;
}
function SignIn() { return <Link className="button" to="/auth" state={{ from: typeof window === 'undefined' ? '/talent-network/' : window.location.pathname + window.location.hash }}>Sign in to continue</Link>; }
function EditFields({ person, save, busy, admin = false, cancel }: { person: DirectoryPerson; save: (patch: Record<string, unknown>) => void; busy: boolean; admin?: boolean; cancel: () => void }) {
  return <form className="talent-request-form talent-edit-form" onSubmit={event => {
    event.preventDefault(); const values = new FormData(event.currentTarget); const patch: Record<string, unknown> = {};
    textFields.forEach(key => { patch[key] = String(values.get(key) || '').trim(); });
    listFields.forEach(key => { patch[key] = String(values.get(key) || '').split('\n').map(value => value.trim()).filter(Boolean); });
    patch.availability = String(values.get('availability') || 'unknown'); const years = String(values.get('yearsExperience') || ''); patch.yearsExperience = years === '' ? null : Number(years); if (admin) patch.editNote = String(values.get('editNote') || '').trim(); save(patch);
  }}>
    <h2>{admin ? 'Edit profile as admin' : 'Edit your profile'}</h2>
    {textFields.map(key => <label key={key}>{labels[key]}{['summary', 'headline', 'education', 'experience'].includes(key) ? <textarea name={key} defaultValue={person[key]} maxLength={key === 'headline' ? 1000 : 4000} rows={key === 'summary' ? 4 : 2}/> : <input autoFocus={key === 'name'} name={key} defaultValue={person[key]} required={key === 'name'} maxLength={250}/>}</label>)}
    {listFields.map(key => <label key={key}>{labels[key]} (one per line, maximum 50)<textarea name={key} defaultValue={person[key].join('\n')} rows={3}/></label>)}
    <label>Total experience in years (optional)<input name="yearsExperience" type="number" min="0" max="90" step="0.1" defaultValue={person.yearsExperience ?? ''}/></label>
<label>Availability<select name="availability" defaultValue={person.availability || 'unknown'}><option value="unknown">Unknown</option><option value="available">Open to projects</option><option value="unavailable">Not currently available</option></select></label>
    {admin && <label className="edit-wide">Reason for this edit<textarea name="editNote" required minLength={10} maxLength={4000} rows={2} placeholder="What changed and the source used to verify it"/></label>}
    <p className="fine edit-wide">These details will be public. Do not include private contact information. LinkedIn identity and verification status cannot be changed here.</p><div className="edit-buttons"><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button><button type="button" disabled={busy} onClick={cancel}>Cancel</button></div>
  </form>;
}
export function TalentProfileActions({ person, onChange }: { person: DirectoryPerson; onChange: () => Promise<void> }) {
  const [user, setUser] = useState<User | null>(null); const [status, setStatus] = useState<TalentStatus | null>(null);
  const [kind, setKind] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(true);
  const mounted = useRef(false); const generation = useRef(0); const checkSequence = useRef(0);
  async function check() {
    if (!mounted.current) return;
    const current = generation.current; const sequence = ++checkSequence.current;
    const active = () => mounted.current && generation.current === current && checkSequence.current === sequence;
    setChecking(true);
    try {
      const { data, error: authError } = await talentClient().auth.getUser();
      if (!active()) return;
      if (authError && authError.name !== 'AuthSessionMissingError') throw authError;
      const nextStatus = data.user ? await talentRpc<TalentStatus>('talent_my_status', { profile_id: person.id }) : null;
      if (!active()) return;
      setUser(data.user); setStatus(nextStatus);
    } catch (failure) { if (active()) { setUser(null); setStatus(null); setError(message(failure)); } }
    finally { if (active()) setChecking(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const { data } = talentClient().auth.onAuthStateChange(() => {
      const current = ++generation.current; ++checkSequence.current;
      setUser(null); setStatus(null); setKind(''); setError(''); setNotice(''); setBusy(false); setChecking(true);
      window.setTimeout(() => { if (mounted.current && generation.current === current) void check(); }, 0);
    });
    void check();
    return () => { mounted.current = false; ++generation.current; ++checkSequence.current; data.subscription.unsubscribe(); };
  }, [person.id]);
  async function run(action: () => Promise<unknown>, success: string) {
    const current = generation.current; const active = () => mounted.current && generation.current === current;
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (!active()) return; setKind(''); setNotice(success); await check(); if (active()) await onChange(); }
    catch (failure) { if (active()) setError(message(failure)); }
    finally { if (active()) setBusy(false); }
  }
  return <section className="talent-actions"><h3>{status?.admin ? 'Manage this profile' : status?.owner ? 'Manage your profile' : 'Is this your profile?'}</h3>
    {!status?.owner && !status?.admin && <p>Claim this profile to edit your public details. Ownership is reviewed before editing is enabled.</p>}<p className="fine">For removal without an account, email <a href="mailto:privacy@armatureailabs.com">privacy@armatureailabs.com</a>.</p>
    {checking ? <p role="status">Checking your account…</p> : !user ? <><p>First sign up as a basic member and confirm your email, then return here to claim your profile.</p><SignIn/><Link className="button" to="/auth" state={{ from: window.location.pathname + window.location.hash }}>Sign up as a basic member</Link></> : <>
      {!user.email_confirmed_at && <p role="alert">Confirm your account email before submitting requests.</p>}
      {status?.owner ? <><button className="primary" onClick={() => setKind('edit')}>Edit profile</button><button onClick={() => setKind('photo')}>Profile photo</button><button onClick={() => setKind('unlist')}>Remove my profile</button></> : !person.claimed && (status?.requests.some(r => r.kind === 'claim' && r.status === 'pending') ? <p role="status">Your claim is awaiting manual review. Editing becomes available after approval.</p> : <button disabled={!user.email_confirmed_at} onClick={() => setKind('claim')}>Claim this profile</button>)}
      <button onClick={() => setKind('correction')}>Suggest a correction</button><button onClick={() => setKind('removal')}>Request removal</button>
      {status?.admin && <><button className="primary" onClick={() => setKind('admin-edit')}>Edit profile as admin</button><a href="#review">Review directory requests</a></>}
    </>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {kind === 'photo' && status?.owner && <TalentPhotoEditor key={`${person.id}:${user?.id}`} person={person} onChange={onChange}/>}
    {kind === 'edit' && status?.owner && <EditFields person={person} busy={busy} cancel={() => setKind('')} save={patch => void run(() => talentRpc('talent_update_profile', { profile_id: person.id, expected_revision: person.revision, patch }), 'Profile updated.')}/>}
    {kind === 'admin-edit' && status?.admin && <EditFields person={person} busy={busy} admin cancel={() => setKind('')} save={values => { const { editNote, ...patch } = values; void run(() => talentRpc('talent_admin_update_profile', { profile_id: person.id, expected_revision: person.revision, patch, note: editNote }), 'Profile updated. Admin edit recorded.'); }}/>}
    {kind === 'unlist' && status?.owner && <div><p>Remove your profile from public search now? This also prevents future research imports from republishing it.</p><button disabled={busy} onClick={() => void run(() => talentRpc('talent_unlist_profile', { profile_id: person.id }), 'Your profile has been removed.')}>Confirm removal</button></div>}
    {['claim', 'correction', 'removal'].includes(kind) && user && <form className="talent-request-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); const evidence = fields.get('evidence'); const declaration = kind === 'claim' ? { signed_name: fields.get('signed_name'), declaration_version: claimDeclarationVersion, declaration_accepted: fields.get('declaration_accepted') === 'on' } : {}; void run(() => talentRpc('talent_submit_request', { profile_id: person.id, kind, evidence, base_revision: person.revision, ...declaration }), 'Request saved for review. We will email you when a decision is made. Your history is available in My requests.'); }}><h3>{kind === 'claim' ? 'Claim this profile' : kind === 'correction' ? 'Suggest a correction' : 'Request removal'}</h3><label>{kind === 'claim' ? 'Explain how we can confirm you own this LinkedIn identity. Include a public evidence link or professional affiliation we can verify.' : kind === 'correction' ? 'Describe the exact correction and supporting source.' : 'Explain your relationship to this profile and your removal request.'}<textarea name="evidence" required minLength={20} maxLength={4000} rows={6}/></label>{kind === 'claim' && <ClaimDeclaration person={person}/>}<p className="fine">Visible only to you and authorised administrators. Do not upload identity documents, passwords or financial information.</p><button className="primary" disabled={busy || !user.email_confirmed_at}>{kind === 'claim' ? 'Sign declaration and submit claim' : 'Submit request'}</button></form>}
    {kind && !['edit', 'admin-edit'].includes(kind) && <button disabled={busy} onClick={() => setKind('')}>Cancel</button>}
    {!!status?.requests.length && <section><h3>Your requests</h3>{status.requests.map(request => <p key={request.id}><strong>{request.kind}: {request.status}</strong>{request.review_note && <span> — {request.review_note}</span>}</p>)}</section>}
  </section>;
}
export function TalentMyRequests() {
  const [requests, setRequests] = useState<TalentRequest[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [signedIn, setSignedIn] = useState(false);
  const mounted = useRef(false); const generation = useRef(0);
  async function load() {
    if (!mounted.current) return;
    const current = ++generation.current; const active = () => mounted.current && generation.current === current;
    setRequests([]); setLoading(true); setError(''); setSignedIn(false);
    try {
      const { data, error: authError } = await talentClient().auth.getUser();
      if (!active()) return;
      if (authError && authError.name !== 'AuthSessionMissingError') throw authError;
      if (!data.user) return;
      setSignedIn(true);
      const next = await talentRpc<TalentRequest[]>('talent_my_requests');
      if (active()) setRequests(next);
    } catch (failure) { if (active()) setError(message(failure)); }
    finally { if (active()) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const { data } = talentClient().auth.onAuthStateChange(() => {
      const current = ++generation.current; setRequests([]); setError(''); setSignedIn(false); setLoading(true);
      window.setTimeout(() => { if (mounted.current && generation.current === current) void load(); }, 0);
    });
    void load();
    return () => { mounted.current = false; ++generation.current; data.subscription.unsubscribe(); };
  }, []);
  return <section className="talent-my-requests"><a href="#talent">Back to talent</a><h1 tabIndex={-1}>My requests</h1><p>Your private claim, correction and removal history. We will email you when a decision is made.</p>
    {loading ? <p role="status">Loading your requests…</p> : error ? <><p role="alert">{error}</p><button onClick={() => void load()}>Retry</button>{!signedIn && <SignIn/>}</> : !signedIn ? <><p>Sign in to see your requests.</p><SignIn/></> : <>{!requests.length && <p>You have not submitted any requests.</p>}{requests.map(request => <article className="engineer-row" key={request.id}><h2>{request.profile_name || 'Talent profile'}</h2><p><strong>{request.kind} · {request.status}</strong></p><p className="fine">Submitted {new Date(request.created_at).toLocaleString()}</p>{request.review_note && <p className="profile-copy">{request.review_note}</p>}{request.published ? <a href={`#profile/${encodeURIComponent(request.profile_id)}`}>View profile</a> : <p className="fine">This profile is no longer publicly listed.</p>}</article>)}</>}
  </section>;
}
export function TalentReviewQueue({ onChange }: { onChange: () => Promise<void> }) {
  const [requests, setRequests] = useState<TalentRequest[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const mounted = useRef(false); const generation = useRef(0);
  async function load() {
    if (!mounted.current) return false;
    const current = ++generation.current; const active = () => mounted.current && generation.current === current;
    setRequests([]); setLoading(true); setError('');
    try { const next = await talentRpc<TalentRequest[]>('talent_review_queue'); if (!active()) return false; setRequests(next); return true; }
    catch (failure) { if (active()) setError(message(failure)); return false; }
    finally { if (active()) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const { data } = talentClient().auth.onAuthStateChange(() => {
      const current = ++generation.current; setRequests([]); setError(''); setLoading(true);
      window.setTimeout(() => { if (mounted.current && generation.current === current) void load(); }, 0);
    });
    void load();
    return () => { mounted.current = false; ++generation.current; data.subscription.unsubscribe(); };
  }, []);
  return <section><a href="#talent">Back to talent</a><h1>Directory review requests</h1><p>Only Admins and Super admins can review requests. Verify ownership independently before approving a claim.</p>{loading ? <p role="status">Loading requests…</p> : error ? <><p role="alert">{error}</p><SignIn/><button onClick={() => void load()}>Retry</button></> : <>{!requests.length && <p>No pending requests.</p>}{requests.map(request => <ReviewItem key={request.id} request={request} done={async () => { if (await load()) await onChange(); }}/>)}</>}</section>;
}
function ReviewItem({ request, done }: { request: TalentRequest; done: () => Promise<void> }) {
  const [decision, setDecision] = useState('rejected'); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <article className="engineer-row"><h2>{request.profile_name} · {request.kind}</h2><a href={`#profile/${encodeURIComponent(request.profile_id)}`}>Inspect public profile and LinkedIn</a><p className="profile-copy">{request.evidence}</p>{request.kind === 'claim' && (request.declaration ? <section className="claim-declaration"><h3>Signed ownership declaration</h3><p>{request.declaration.text}</p><p>Signed by <strong>{request.declaration.signed_name}</strong> · {new Date(request.declaration.accepted_at).toLocaleString()}</p><p className="fine">Version {request.declaration.version} · Profile: {request.declaration.profile_name}</p><a href={request.declaration.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn identity at submission</a></section> : <p role="alert">This older claim has no signed declaration. Reject it and ask the applicant to submit a new claim.</p>)}<p className="fine">Submitted {new Date(request.created_at).toLocaleString()} · Requester {request.requester_id}</p><form className="talent-request-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const fields = new FormData(event.currentTarget); const corrected = String(fields.get('patch') || ''); await talentRpc('talent_review_request', { request_id: request.id, decision, note: fields.get('note'), corrected_data: decision === 'approved' && request.kind === 'correction' ? JSON.parse(corrected) : null }); await done(); } catch (failure) { setError(message(failure)); } finally { setBusy(false); } }}><label>Decision<select value={decision} onChange={event => setDecision(event.target.value)}><option value="rejected">Reject</option><option value="approved">Approve</option></select></label><label>Review note (shared with requester)<textarea name="note" required minLength={10} maxLength={4000}/></label>{decision === 'approved' && request.kind === 'claim' && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> I independently verified this claimant controls the listed professional identity and recorded the evidence above.</label>}{decision === 'approved' && request.kind === 'correction' && <label>Reviewed changes as JSON (editable profile fields only)<textarea name="patch" required placeholder={'{"title":"Corrected title"}'} rows={5}/></label>}{decision === 'approved' && request.kind === 'removal' && <p>Approval immediately unlists this profile and blocks re-import.</p>}{error && <p role="alert">{error}</p>}<button disabled={busy || (decision === 'approved' && request.kind === 'claim' && (!confirmed || !request.declaration))}>Save decision</button></form></article>;
}

const demoPerson: DirectoryPerson = { id: 'local-edit-demo', name: 'Sample Engineer', title: 'Embedded Engineer', company: 'Example Robotics', location: 'Bengaluru', headline: 'Synthetic profile for testing the editor', summary: '', previousCompanies: [], skills: ['Embedded'], physicalAiAreas: [], yearsExperience: null, checkedAt: '', linkedinUrl: '', claimed: true };
export function TalentEditDemo() {
  const [person, setPerson] = useState(demoPerson); const [admin, setAdmin] = useState(false); const [editing, setEditing] = useState(false); const [notice, setNotice] = useState('');
  return <section className="talent-edit-demo"><a href="#talent">Back to directory</a><h1>Profile editing test</h1><a href="#claim-demo">Test the ownership declaration and claim flow →</a><p><strong>Local UI demo · synthetic data only.</strong> Saves stay in this page and reset on reload. This does not sign you in or test backend permissions.</p><label>Preview role <select value={admin ? 'admin' : 'owner'} onChange={e => { setAdmin(e.target.value === 'admin'); setEditing(false); setNotice(''); }}><option value="owner">Profile owner</option><option value="admin">Administrator</option></select></label><h2>{person.name}</h2><p>{person.title} · {person.company} · {person.location}</p><p>{person.headline}</p><button className="primary" onClick={() => setEditing(true)}>{admin ? 'Edit profile as admin' : 'Edit profile'}</button><button onClick={() => { setPerson(demoPerson); setEditing(false); setNotice('Sample profile reset.'); }}>Reset sample</button>{notice && <p role="status">{notice}</p>}{editing && <EditFields key={admin ? 'admin' : 'owner'} person={person} admin={admin} busy={false} cancel={() => setEditing(false)} save={values => { const { editNote: _note, ...patch } = values; setPerson(current => ({ ...current, ...patch })); setEditing(false); setNotice('Saved locally. No real profile changed.'); }}/>}</section>;
}

export function TalentClaimDemo() {
  const [submitted, setSubmitted] = useState(false);
  return <section className="talent-claim-demo"><a href="#edit-demo">Back to editing test</a><h1>Claim declaration test</h1><p><strong>Local demo · signed-in basic-member step simulated.</strong> This uses a synthetic profile and sends nothing.</p><ol><li>Sign up as a basic member and confirm your email.</li><li>Submit evidence and sign the ownership declaration.</li><li>An administrator manually reviews the claim. Editing is enabled only after approval.</li></ol>{submitted ? <><p role="status">Test claim awaiting manual review. Ownership and editing access have not been granted.</p><button onClick={() => setSubmitted(false)}>Reset test claim</button></> : <form className="talent-request-form" onSubmit={e => { e.preventDefault(); setSubmitted(true); }}><label>Evidence that this is your profile<textarea name="evidence" required minLength={20} maxLength={4000} rows={3}/></label><ClaimDeclaration person={{ ...demoPerson, claimed: false }}/><button className="primary">Sign declaration and submit test claim</button></form>}</section>;
}
