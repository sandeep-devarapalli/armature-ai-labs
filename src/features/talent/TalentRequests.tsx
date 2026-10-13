import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { DirectoryPerson } from './directorySearch';
import { talentClient, talentRpc, type TalentRequest, type TalentStatus } from './liveTalent';
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
const textFields = ['name', 'title', 'company', 'location', 'headline', 'summary'] as const;
const listFields = ['skills', 'physicalAiAreas', 'previousCompanies'] as const;
const labels: Record<string, string> = { name: 'Name', title: 'Current title', company: 'Current company', location: 'Location', headline: 'Headline', summary: 'Professional summary', skills: 'Skills and capabilities', physicalAiAreas: 'Physical AI areas', previousCompanies: 'Previous companies' };
function SignIn() { return <Link className="button" to="/auth" state={{ from: typeof window === 'undefined' ? '/talent-network/' : window.location.pathname + window.location.hash }}>Sign in to continue</Link>; }
function EditFields({ person, save, busy }: { person: DirectoryPerson; save: (patch: Record<string, unknown>) => void; busy: boolean }) {
  return <form className="talent-request-form" onSubmit={event => {
    event.preventDefault(); const values = new FormData(event.currentTarget); const patch: Record<string, unknown> = {};
    textFields.forEach(key => { patch[key] = String(values.get(key) || '').trim(); });
    listFields.forEach(key => { patch[key] = String(values.get(key) || '').split('\n').map(value => value.trim()).filter(Boolean); });
    const years = String(values.get('yearsExperience') || ''); patch.yearsExperience = years === '' ? null : Number(years); save(patch);
  }}>
    {textFields.map(key => <label key={key}>{labels[key]}<textarea name={key} defaultValue={person[key]} required={key === 'name'} maxLength={key === 'summary' ? 4000 : key === 'headline' ? 1000 : 250} rows={key === 'summary' ? 4 : 2}/></label>)}
    {listFields.map(key => <label key={key}>{labels[key]} (one per line, maximum 50)<textarea name={key} defaultValue={person[key].join('\n')} rows={3}/></label>)}
    <label>Total experience in years (optional)<input name="yearsExperience" type="number" min="0" max="90" step="0.1" defaultValue={person.yearsExperience ?? ''}/></label>
    <p className="fine">These details will be public. Do not include private contact information. LinkedIn identity and verification status cannot be changed here.</p><button className="primary" disabled={busy}>Save profile</button>
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
  return <section className="talent-actions"><h3>{status?.owner ? 'Manage your profile' : 'Is this your profile?'}</h3>
    <p>For removal without an account, email <a href="mailto:privacy@armatureailabs.com">privacy@armatureailabs.com</a>.</p><p>Claim ownership to edit your public details. Claims are reviewed against evidence; signing in alone does not verify this profile.</p>
    {checking ? <p role="status">Checking your account…</p> : !user ? <SignIn/> : <>
      {!user.email_confirmed_at && <p role="alert">Confirm your account email before submitting requests.</p>}
      {status?.owner ? <><button onClick={() => setKind(kind === 'edit' ? '' : 'edit')}>Edit profile</button><button onClick={() => setKind('unlist')}>Remove my profile</button></> : !person.claimed && <button onClick={() => setKind('claim')}>Claim this profile</button>}
      <button onClick={() => setKind('correction')}>Suggest a correction</button><button onClick={() => setKind('removal')}>Request removal</button>
      {status?.admin && <a href="#review">Review directory requests</a>}
    </>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {kind === 'edit' && status?.owner && <EditFields person={person} busy={busy} save={patch => void run(() => talentRpc('talent_update_profile', { profile_id: person.id, expected_revision: person.revision, patch }), 'Profile updated.')}/>}
    {kind === 'unlist' && status?.owner && <div><p>Remove your profile from public search now? This also prevents future research imports from republishing it.</p><button disabled={busy} onClick={() => void run(() => talentRpc('talent_unlist_profile', { profile_id: person.id }), 'Your profile has been removed.')}>Confirm removal</button></div>}
    {['claim', 'correction', 'removal'].includes(kind) && user && <form className="talent-request-form" onSubmit={event => { event.preventDefault(); const evidence = new FormData(event.currentTarget).get('evidence'); void run(() => talentRpc('talent_submit_request', { profile_id: person.id, kind, evidence, base_revision: person.revision }), 'Request saved for review. Return to this profile to check its status.'); }}><h3>{kind === 'claim' ? 'Claim this profile' : kind === 'correction' ? 'Suggest a correction' : 'Request removal'}</h3><label>{kind === 'claim' ? 'Explain how we can confirm you own this LinkedIn identity. Include a public evidence link or professional affiliation we can verify.' : kind === 'correction' ? 'Describe the exact correction and supporting source.' : 'Explain your relationship to this profile and your removal request.'}<textarea name="evidence" required minLength={20} maxLength={4000} rows={6}/></label><p className="fine">Visible only to you and authorised administrators. Do not upload identity documents, passwords or financial information.</p><button className="primary" disabled={busy || !user.email_confirmed_at}>Submit request</button></form>}
    {kind && <button disabled={busy} onClick={() => setKind('')}>Cancel</button>}
    {!!status?.requests.length && <section><h3>Your requests</h3>{status.requests.map(request => <p key={request.id}><strong>{request.kind}: {request.status}</strong>{request.review_note && <span> — {request.review_note}</span>}</p>)}</section>}
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
  return <article className="engineer-row"><h2>{request.profile_name} · {request.kind}</h2><a href={`#profile/${encodeURIComponent(request.profile_id)}`}>Inspect public profile and LinkedIn</a><p className="profile-copy">{request.evidence}</p><p className="fine">Submitted {new Date(request.created_at).toLocaleString()} · Requester {request.requester_id}</p><form className="talent-request-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const fields = new FormData(event.currentTarget); const corrected = String(fields.get('patch') || ''); await talentRpc('talent_review_request', { request_id: request.id, decision, note: fields.get('note'), corrected_data: decision === 'approved' && request.kind === 'correction' ? JSON.parse(corrected) : null }); await done(); } catch (failure) { setError(message(failure)); } finally { setBusy(false); } }}><label>Decision<select value={decision} onChange={event => setDecision(event.target.value)}><option value="rejected">Reject</option><option value="approved">Approve</option></select></label><label>Review note (shared with requester)<textarea name="note" required minLength={10} maxLength={4000}/></label>{decision === 'approved' && request.kind === 'claim' && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> I independently verified this claimant controls the listed professional identity and recorded the evidence above.</label>}{decision === 'approved' && request.kind === 'correction' && <label>Reviewed changes as JSON (editable profile fields only)<textarea name="patch" required placeholder={'{"title":"Corrected title"}'} rows={5}/></label>}{decision === 'approved' && request.kind === 'removal' && <p>Approval immediately unlists this profile and blocks re-import.</p>}{error && <p role="alert">{error}</p>}<button disabled={busy || (decision === 'approved' && request.kind === 'claim' && !confirmed)}>Save decision</button></form></article>;
}
