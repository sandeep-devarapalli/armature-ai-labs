import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import type { DirectoryPerson } from './directorySearch';
import { talentClient } from './liveTalent';
import './talentPhoto.css';

export const photoConsentVersion = '2026-10-13-public-photo-v1';
const endpoint = (id: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/talent-profile-photo?profile_id=${encodeURIComponent(id)}`;
export function validateTalentPhoto(file: File) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG or PNG image of at most 5 MiB.');
}
export async function requestTalentPhoto(id: string, action: 'preview' | 'membership' | 'upload' | 'remove', file?: File, signal?: AbortSignal) {
  if (action === 'upload') { if (!file) throw new Error('Choose a photo.'); validateTalentPhoto(file); }
  const { data: { session } } = await talentClient().auth.getSession();
  if (!session) throw new Error('Sign in to manage your profile photo.');
  const headers: Record<string, string> = { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '' };
  if (action === 'membership') headers['content-type'] = 'application/json';
  if (action === 'upload') { headers['content-type'] = file!.type; headers['x-photo-consent'] = photoConsentVersion; }
  const response = await fetch(endpoint(id) + (action === 'preview' ? '&source=membership' : ''), {
    method: action === 'preview' ? 'GET' : action === 'remove' ? 'DELETE' : 'POST', headers, signal, cache: 'no-store',
    body: action === 'upload' ? file : action === 'membership' ? JSON.stringify({ use_membership_photo: true, consent_version: photoConsentVersion }) : undefined,
  });
  if (action === 'preview' && response.status === 404) return null;
  if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error || 'Your photo could not be updated. Please try again.'); }
  return action === 'preview' ? response.blob() : response.json();
}
export function TalentAvatar({ person }: { person: DirectoryPerson }) {
  const version = person.photoVersion;
  const [failed, setFailed] = useState('');
  const key = `${person.id}:${version}`;
  return <span className="talent-avatar" aria-label={`${person.name} profile picture`}>
    {person.claimed && version && failed !== key ? <img src={`${endpoint(person.id)}&v=${encodeURIComponent(version)}`} alt="" loading="lazy" decoding="async" onError={() => setFailed(key)}/> : <span aria-hidden="true">{person.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('')}</span>}
  </span>;
}
function PhotoControls({ consent, setConsent, busy, membership, loading, current, notice, error, act }: {
  consent: boolean; setConsent: (value: boolean) => void; busy: boolean; membership: string; loading: boolean; current: React.ReactNode;
  notice: string; error: string; act: (action: 'membership' | 'upload' | 'remove', file?: File) => Promise<boolean> | boolean;
}) {
  const [staged, setStaged] = useState<File | null>(null); const [preview, setPreview] = useState(''); const [fileError, setFileError] = useState('');
  useEffect(() => { if (!staged) { setPreview(''); return; } const url = URL.createObjectURL(staged); setPreview(url); return () => URL.revokeObjectURL(url); }, [staged]);
  async function save(action: 'membership' | 'upload' | 'remove') { if (await act(action, action === 'upload' ? staged ?? undefined : undefined)) { setStaged(null); setFileError(''); } }
  return <section className="talent-photo-editor" aria-label="Profile photo"><h3><Camera size={20} aria-hidden="true"/> Profile photo</h3>
    <p>Make your profile easier to recognise. Use your membership photo or upload a different one.</p>
    <div className="talent-photo-previews"><div>{current}<span>Public profile</span></div><div>{membership ? <img src={membership} alt="Your private membership photo"/> : <span className="talent-photo-placeholder"><Camera aria-hidden="true"/></span>}<span>{loading ? 'Loading membership photo…' : membership ? 'Membership photo · private preview' : 'No membership photo available'}</span></div></div>
    <label className="talent-photo-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/><span>I agree to display this photo publicly on my Armature Talent Network profile. I can replace or remove it at any time.</span></label>
    <div className="talent-photo-buttons"><button className="primary" disabled={busy || !consent || !membership} onClick={() => void save('membership')}><Camera size={16} aria-hidden="true"/> Use my membership photo</button>
      <label className={`talent-photo-upload${busy ? ' disabled' : ''}`}><ImagePlus size={16} aria-hidden="true"/> Upload different photo<input type="file" aria-label="Upload different photo" accept="image/jpeg,image/png" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { try { validateTalentPhoto(file); setStaged(file); setFileError(''); setConsent(false); } catch (failure) { setFileError((failure as Error).message); } } }}/></label>
      <button disabled={busy} onClick={() => void save('remove')}><Trash2 size={16} aria-hidden="true"/> Remove photo</button></div>
    {staged && <div className="talent-photo-staged"><img src={preview} alt="Selected photo preview"/><div><p>{staged.name}</p><p className="fine">Preview only. Save to update your public photo.</p><button className="primary" disabled={busy || !consent} onClick={() => void save('upload')}>Save photo</button><button disabled={busy} onClick={() => { setStaged(null); setFileError(''); }}>Cancel selection</button></div></div>}
    <p className="fine">JPEG or PNG, up to 5 MiB. This changes only your public directory photo. Your membership photo and verification documents remain separate.</p>
    {(error || fileError) && <p role="alert">{fileError || error}</p>}<p role="status" aria-live="polite">{busy ? 'Saving photo…' : notice}</p>
  </section>;
}
export function TalentPhotoEditor({ person, onChange }: { person: DirectoryPerson; onChange: () => Promise<void> }) {
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState(''); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const membershipFile = useRef<File | null>(null);
  const generation = useRef(0); const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = ++generation.current; const abort = new AbortController(); let url = ''; controller.current = abort;
    membershipFile.current = null; setConsent(false); setMembership(''); setError(''); setNotice(''); setLoading(true); setBusy(false);
    const { data } = talentClient().auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { ++generation.current; abort.abort(); setMembership(''); setConsent(false); setBusy(false); setLoading(false); setNotice(''); setError(''); } });
    void requestTalentPhoto(person.id, 'preview', undefined, abort.signal).then(blob => {
      if (current !== generation.current || !(blob instanceof Blob)) return;
      membershipFile.current = new File([blob], 'membership-photo', { type: blob.type }); url = URL.createObjectURL(blob); setMembership(url);
    }).catch(failure => { if (current === generation.current) setError(failure instanceof Error ? failure.message : 'Membership photo preview is unavailable. You can upload a different photo.'); }).finally(() => { if (current === generation.current) setLoading(false); });
    return () => { ++generation.current; abort.abort(); data.subscription.unsubscribe(); if (url) URL.revokeObjectURL(url); };
  }, [person.id]);
  async function act(action: 'membership' | 'upload' | 'remove', file?: File) {
    if (busy || (action !== 'remove' && !consent)) return false;
    const current = generation.current; setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'membership' && !membershipFile.current) throw new Error('Load your membership photo before saving.');
      await requestTalentPhoto(person.id, action === 'membership' ? 'upload' : action, action === 'membership' ? membershipFile.current! : file, controller.current?.signal);
      if (current !== generation.current) return false;
      setConsent(false); await onChange();
      if (current === generation.current) setNotice(action === 'remove' ? 'Public profile photo removed.' : 'Public profile photo updated.');
      return true;
    } catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : 'Photo update failed.'); return false; }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <PhotoControls key={person.id} consent={consent} setConsent={setConsent} busy={busy} membership={membership} loading={loading} current={<TalentAvatar person={person}/>} notice={notice} error={error} act={act}/>;
}
const samplePhoto = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="#e6e0d4"/><circle cx="120" cy="90" r="36" fill="#706a5f"/><path d="M40 220a80 80 0 0 1 160 0" fill="#706a5f"/></svg>')}`;
export function TalentPhotoDemo() {
  const [reset, setReset] = useState(0);
  const [consent, setConsent] = useState(false); const [current, setCurrent] = useState(''); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  useEffect(() => () => { if (current.startsWith('blob:')) URL.revokeObjectURL(current); }, [current]);
  if (!import.meta.env.DEV) return null;
  return <section><a href="#talent">Back to talent</a><h1>Profile photo preview</h1><p className="directory-notice">Local demonstration. The membership picture is a generated placeholder. Changes stay in this preview and send nothing.</p>
    <PhotoControls key={reset} consent={consent} setConsent={setConsent} busy={false} membership={samplePhoto} loading={false} current={current ? <img src={current} alt="Sample public profile"/> : <span className="talent-avatar">SE</span>} notice={notice} error={error} act={(action, file) => {
      try { setError(''); if (action !== 'remove' && !consent) return false; if (file) validateTalentPhoto(file); setCurrent(action === 'remove' ? '' : file ? URL.createObjectURL(file) : samplePhoto); setConsent(false); setNotice(action === 'remove' ? 'Demo photo removed. Membership photo is unchanged.' : 'Demo photo updated. Nothing was uploaded.'); return true; } catch (failure) { setError((failure as Error).message); return false; }
    }}/><button onClick={() => { setCurrent(''); setConsent(false); setNotice('Demo reset.'); setError(''); setReset(value => value + 1); }}>Reset demo</button>
  </section>;
}
