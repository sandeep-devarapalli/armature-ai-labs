import { useEffect, useState, type ReactNode } from 'react';
import type { CourseApi, LabCheckpoint, LabField, LabStatus, LabValue, LabValues } from './member-api';
import { labChecks } from './lab-checks';

const STATUS: Record<LabStatus, string> = { draft: 'Draft saved', submitted: 'With the assessor', returned: 'Returned for changes', approved: 'Approved' };
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const errorText = (error: unknown) => {
  const e = error as { code?: string; message?: string };
  if (e?.code === '22023' && e.message) return e.message;
  if (e?.code === 'PT409') return 'This checkpoint changed in another window. Reload the page and try again.';
  if (e?.code === '42501') return 'Lab access could not be confirmed. Refresh your access and try again.';
  return 'That did not save. Please try again.';
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
type Row = Record<string, number | string | null>;
const emptyRow = (field: LabField): Row => Object.fromEntries((field.columns ?? []).map(c => [c.key, null]));
const isEmptyRow = (row: Row) => Object.values(row).every(x => x === null || x === '');
function cleaned(fields: LabField[], values: LabValues): LabValues {
  const out: LabValues = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === 'table') { const kept = (Array.isArray(v) ? v : []).filter(r => !isEmptyRow(r as Row)); if (kept.length) out[f.key] = kept; }
    else if (v !== null && v !== undefined && v !== '') out[f.key] = v;
  }
  return out;
}

export function LabStatusBadge({ status }: { status: LabStatus | null | undefined }) {
  return <span className={`lab-status lab-status-${status ?? 'none'}`}>{status ? STATUS[status] : 'Not started'}</span>;
}

export function LabChecksList({ values }: { values: LabValues }) {
  const checks = labChecks(values);
  if (!checks.length) return null;
  return <div className="lab-checks"><h4>Checks</h4><ul>{checks.map(c => <li key={c.label} className={c.ok === undefined ? '' : c.ok ? 'lab-ok' : 'lab-fail'}>
    <span>{c.label}</span><strong>{c.value}{c.ok === undefined ? '' : c.ok ? ' ✓' : ' ✗'}</strong></li>)}</ul></div>;
}

export function LabValuesView({ fields, values }: { fields: LabField[]; values: LabValues }) {
  return <dl className="lab-values">{fields.map(f => {
    const v = values[f.key];
    let shown: ReactNode = <span className="meta">not given</span>;
    if (f.type === 'table' && Array.isArray(v) && v.length) shown = <div className="lab-table-wrap"><table><thead><tr>{(f.columns ?? []).map(c => <th key={c.key}>{c.label}{c.unit ? ` (${c.unit})` : ''}</th>)}</tr></thead>
      <tbody>{v.map((row, i) => <tr key={i}>{(f.columns ?? []).map(c => <td key={c.key}>{String((row as Row)[c.key] ?? '')}</td>)}</tr>)}</tbody></table></div>;
    else if (typeof v === 'boolean') shown = v ? 'Yes' : 'No';
    else if (v !== null && v !== undefined && v !== '') shown = `${v}${f.unit ? ` ${f.unit}` : ''}`;
    return <div key={f.key}><dt>{f.label}</dt><dd>{shown}</dd></div>;
  })}</dl>;
}

export function LabPhotos({ api, paths }: { api: CourseApi; paths: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void Promise.all(paths.map(p => api.labPhotoUrl(p).then(u => [p, u] as const).catch(() => [p, ''] as const)))
      .then(pairs => { if (active) setUrls(Object.fromEntries(pairs)); });
    return () => { active = false; };
  }, [api, paths.join('|')]);
  if (!paths.length) return null;
  return <div className="lab-photos">{paths.map(p => urls[p] ? <a key={p} href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="Lab evidence photo" loading="lazy" /></a> : <span key={p} className="meta">Loading photo…</span>)}</div>;
}

function FieldInput({ field, value, onChange, disabled }: { field: LabField; value: LabValue | undefined; onChange: (v: LabValue) => void; disabled: boolean }) {
  const label = <span className="lab-label">{field.label}{field.unit ? ` (${field.unit})` : ''}{field.required ? <span className="lab-required"> *</span> : null}</span>;
  if (field.type === 'number') return <label className="lab-field">{label}<input type="number" step="any" inputMode="decimal" disabled={disabled} value={typeof value === 'number' ? value : ''}
    onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} /></label>;
  if (field.type === 'text') return <label className="lab-field">{label}<textarea rows={2} maxLength={2000} disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} /></label>;
  if (field.type === 'choice') return <label className="lab-field">{label}<select disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || null)}>
    <option value="">Choose…</option>{(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}</select></label>;
  if (field.type === 'yesno') return <fieldset className="lab-field lab-yesno" disabled={disabled}><legend>{label}</legend>
    {[true, false].map(b => <label key={String(b)}><input type="radio" name={field.key} checked={value === b} onChange={() => onChange(b)} /> {b ? 'Yes' : 'No'}</label>)}</fieldset>;
  const rowsNow = (Array.isArray(value) ? value : []) as Row[];
  const shown = rowsNow.length >= (field.minRows ?? 1) ? rowsNow : [...rowsNow, ...Array.from({ length: (field.minRows ?? 1) - rowsNow.length }, () => emptyRow(field))];
  const setCell = (i: number, key: string, cell: number | string | null) => onChange(shown.map((r, j) => (j === i ? { ...r, [key]: cell } : r)));
  return <fieldset className="lab-field lab-table" disabled={disabled}><legend>{label}{field.minRows ? <span className="meta"> (at least {field.minRows} rows)</span> : null}</legend>
    <div className="lab-table-wrap"><table><thead><tr>{(field.columns ?? []).map(c => <th key={c.key}>{c.label}{c.unit ? ` (${c.unit})` : ''}</th>)}<th aria-label="Remove row" /></tr></thead>
      <tbody>{shown.map((row, i) => <tr key={i}>{(field.columns ?? []).map(c => <td key={c.key}>{c.type === 'number'
        ? <input type="number" step="any" inputMode="decimal" aria-label={`${c.label} row ${i + 1}`} value={typeof row[c.key] === 'number' ? row[c.key] as number : ''} onChange={e => setCell(i, c.key, e.target.value === '' ? null : Number(e.target.value))} />
        : <input type="text" maxLength={500} aria-label={`${c.label} row ${i + 1}`} value={typeof row[c.key] === 'string' ? row[c.key] as string : ''} onChange={e => setCell(i, c.key, e.target.value)} />}</td>)}
        <td><button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(shown.filter((_, j) => j !== i))}>×</button></td></tr>)}</tbody></table></div>
    <button type="button" onClick={() => onChange([...shown, emptyRow(field)])}>Add row</button></fieldset>;
}

export function LabForm({ api, versionId, moduleId, userId, onChanged }: { api: CourseApi; versionId: string; moduleId: string; userId: string; onChanged?: () => void }) {
  const [lab, setLab] = useState<LabCheckpoint | null>(null);
  const [values, setValues] = useState<LabValues>({});
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    const abort = new AbortController();
    api.labs(versionId, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      const found = result.available ? result.labs?.find(item => item.moduleId === moduleId) ?? null : null;
      if (!found || !result.enrolled) { setState('unavailable'); return; }
      setLab(found); const s = found.submission;
      setValues(s?.values ?? {}); setNotes(s?.notes ?? ''); setPhotos(s?.photos ?? []); setConsent(s?.shareConsent ?? false); setState('ready');
    }).catch(() => { if (!abort.signal.aborted) setState('unavailable'); });
    return () => abort.abort();
  }, [api, versionId, moduleId]);

  if (state === 'loading') return <section className="lab-form"><p role="status">Loading your lab checkpoint…</p></section>;
  if (state === 'unavailable' || !lab) return null;
  const sub = lab.submission;
  const editable = !sub || sub.status === 'draft' || sub.status === 'returned';

  async function save(submit: boolean, nextPhotos = photos) {
    if (!lab) return;
    setBusy(true); setError(''); setMessage(''); setConfirming(false);
    try {
      const saved = await api.saveLab(versionId, moduleId, cleaned(lab.fields, values), notes, nextPhotos, consent, submit, lab.submission?.revision ?? null);
      setLab({ ...lab, submission: saved });
      setMessage(submit ? 'Submitted. Your assessor will review it and you will see the result here.' : 'Draft saved.');
      onChanged?.();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = 10 - photos.length; const chosen = [...files].slice(0, room);
    if (files.length > room) setError('Each checkpoint can hold up to 10 photos.');
    const bad = chosen.find(f => !IMAGE_TYPES.includes(f.type) || f.size > 10 * 1024 * 1024);
    if (bad) { setError(`${bad.name}: photos must be JPEG, PNG, WebP or HEIC and under 10 MB.`); return; }
    setBusy(true); setError('');
    try {
      const added: string[] = [];
      for (const f of chosen) {
        const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
        added.push(await api.uploadLabPhoto(`${userId}/${versionId}/${moduleId}/${Date.now()}-${safe}`, f));
      }
      const next = [...photos, ...added]; setPhotos(next); setBusy(false); await save(false, next);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return <section className="lab-form" aria-labelledby={`lab-${moduleId}`}>
    <h3 id={`lab-${moduleId}`}>{lab.title}</h3>
    <p><LabStatusBadge status={sub?.status} />{sub?.submittedAt ? <span className="meta"> · submitted {when(sub.submittedAt)}</span> : null}</p>
    {sub?.status === 'returned' && sub.reviewComment ? <div className="notice lab-comment"><strong>Assessor's comment:</strong> {sub.reviewComment}</div> : null}
    {sub?.status === 'approved' && sub.reviewComment ? <div className="notice lab-comment"><strong>Assessor's note:</strong> {sub.reviewComment}</div> : null}
    <p className="meta">Record your own measurements. Values marked temporary in the lessons are estimates; yours are what is assessed. Fields marked * are needed to submit.</p>
    {editable ? <div className="lab-fields">{lab.fields.map(f => <FieldInput key={f.key} field={f} value={values[f.key]} disabled={busy} onChange={v => setValues(old => ({ ...old, [f.key]: v }))} />)}</div>
      : <LabValuesView fields={lab.fields} values={values} />}
    <LabChecksList values={values} />
    {editable ? <label className="lab-field">Notes for the assessor<textarea rows={4} maxLength={10000} disabled={busy} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      : notes ? <p className="lab-notes"><strong>Notes:</strong> {notes}</p> : null}
    <LabPhotos api={api} paths={photos} />
    {editable ? <>
      <label className="lab-field">Add photos (up to 10, under 10 MB each)<input type="file" accept={IMAGE_TYPES.join(',')} multiple disabled={busy || photos.length >= 10} onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} /></label>
      {photos.length ? <button type="button" disabled={busy} onClick={() => { const next = photos.slice(0, -1); setPhotos(next); void save(false, next); }}>Remove last photo</button> : null}
      <label className="lab-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /> Armature may use my values, anonymised, to improve the course's reference numbers.</label>
      <div className="lab-actions">
        <button type="button" disabled={busy} onClick={() => void save(false)}>{busy ? 'Saving…' : 'Save draft'}</button>
        {confirming ? <><span>Submit for review? You cannot edit while it is with the assessor.</span><button className="primary" type="button" disabled={busy} onClick={() => void save(true)}>Yes, submit</button><button type="button" onClick={() => setConfirming(false)}>Cancel</button></>
          : <button className="primary" type="button" disabled={busy} onClick={() => setConfirming(true)}>Submit for review</button>}
      </div>
    </> : null}
    {message ? <p role="status" className="lab-message">{message}</p> : null}
    {error ? <p role="alert" className="error">{error}</p> : null}
  </section>;
}
