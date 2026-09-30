import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAccount } from '../context/AccountContext';
import { Field, PageHeader, Section } from '../components/Primitives';
import { supabase } from '../lib/supabase';
import { labDateTimeInput, labInstant } from '../lib/bookingTime';
import { offerAmount, offerTime, type DiscountOffer } from '../lib/discountOffers';
import './AdminDiscountsPage.css';
import { DiscountQuotePreview } from '../components/DiscountQuotePreview';
const blank = (): DiscountOffer => ({ id: '', revision: 0, name: '', description: '', audience: 'public', member_id: null, code: null, value_kind: 'percent', value: 10, categories: ['coworking'], starts_at: '', ends_at: '', state: 'paused', personal_use: 'once', total_limit: null, per_member_limit: null, stack_with_launch: false });
type Member = { user_id: string; name: string; email: string };
type History = { actor_id: string; created_at: string; before_data: DiscountOffer | null; after_data: DiscountOffer };
export function AdminDiscountsPage({ client = supabase as SupabaseClient | null }: { client?: SupabaseClient | null }) {
  const { account, loading } = useAccount();
  if (loading) return <p role="status">Checking discount administration access…</p>;
  if (!account || !['admin', 'super_admin'].includes(account.role)) return <PageHeader title="Admin access required" description="Only Admins and Super admins can manage discounts." />;
  return <DiscountEditor key={account.user_id} client={client} />;
}
function DiscountEditor({ client }: { client: SupabaseClient | null }) {
  const [offers, setOffers] = useState<DiscountOffer[]>([]), [offer, setOffer] = useState(blank);
  const [history, setHistory] = useState<History[]>([]), [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false), [sample, setSample] = useState(500);
  const reviewHeading = useRef<HTMLHeadingElement>(null), editorHeading = useRef<HTMLDivElement>(null);
  useEffect(() => { if (review) { reviewHeading.current?.focus({ preventScroll: true }); reviewHeading.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); } }, [review]);
  const personal = ['personal', 'student'].includes(offer.audience);
  async function rpc(name: string, args?: Record<string, unknown>) {
    if (!client) throw new Error('Connect the backend to manage discounts.');
    const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data;
  }
  useEffect(() => { let active = true; void rpc('admin_discount_offers').then(data => { if (active) setOffers(data ?? []); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [client]);
  useEffect(() => {
    let active = true; setMembers([]);
    if (!personal || !search.trim()) return;
    const timer = window.setTimeout(() => { void rpc('list_basic_members', { p_search: search.trim(), p_status: null, p_role: null, p_page: 1, p_page_size: 25 }).then(data => { if (active) setMembers(data.items); }).catch(e => { if (active) setError(e.message); }); }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [personal, search, client]);
  useEffect(() => { let active = true; if (offer.member_id) void rpc('admin_discount_member', { p_id: offer.member_id }).then(data => { if (active && data) setOffer(current => ({ ...current, member_name: data.name, member_email: data.email })); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [offer.member_id, client]);
  useEffect(() => { let active = true; setHistory([]); if (offer.id) void rpc('discount_offer_history', { p_id: offer.id }).then(data => { if (active) setHistory(data ?? []); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [offer.id, offer.revision, client]);
  function update(change: Partial<DiscountOffer>) { setOffer(current => ({ ...current, ...change })); setReview(false); }
  function preview(event: FormEvent) { event.preventDefault(); setError(''); if (!offer.categories.length) { setError('Choose at least one eligible product category.'); return; } if (personal && !offer.member_id) { setError('Select the member who should receive this offer.'); return; } if (offer.ends_at <= offer.starts_at) { setError('End time must follow the start time.'); return; } setReview(true); }
  async function save() {
    setBusy(true); setError('');
    try {
      const saved = await rpc('save_discount_offer', { p_offer: { ...offer, member_id: personal ? offer.member_id : null, code: offer.audience === 'code' ? offer.code : null }, p_id: offer.id || null, p_expected_revision: offer.id ? offer.revision : null });
      setOffers(await rpc('admin_discount_offers')); setOffer(saved); setReview(false); setMessage('Discount saved and audited. No booking or payment was created.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const saving = offer.value_kind === 'percent' ? sample * offer.value / 100 : offer.value / 100;
  return <>
    <PageHeader meta="Admin · pricing" title="Discounts" description="Manage personal offers and scheduled promotions. The start and end define when a purchase qualifies, not the dates of a lab visit. Paid bookings remain closed. Previewing an offer does not reserve or redeem it." />
    <Section number="01" title="Offers"><button className="button" onClick={() => { setOffer(blank()); setSearch(''); setReview(false); setMessage(''); }}>Create discount</button>
      <div className="discount-offer-list">{offers.map(item => <article key={item.id}><h3>{item.name}</h3><p>{offerAmount(item)} off · {item.audience} · {item.state}</p><p>{offerTime(item.starts_at)} – {offerTime(item.ends_at)} IST</p><button className="button button-quiet" onClick={() => { setOffer(item); setReview(false); setSearch(''); editorHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }}>Edit {item.name}</button></article>)}</div>
      {!offers.length && <p>No offers configured.</p>}
    </Section>
    <Section number="02" title={offer.id ? `Edit ${offer.name}` : 'New discount'}>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <div ref={editorHeading} /><form onSubmit={preview}><fieldset disabled={busy} className="discount-form"><legend>Offer settings</legend><div className="form-grid">
        <Field label="Offer name"><input required maxLength={120} value={offer.name} onChange={e => update({ name: e.target.value })} /></Field>
        <Field label="Audience"><select value={offer.audience} onChange={e => update({ audience: e.target.value as DiscountOffer['audience'], member_id: null, ...(e.target.value === 'student' ? { value_kind: 'percent', value: 20, categories: ['coworking'], stack_with_launch: true } : {}) })}><option value="public">General promotion</option><option value="personal">Personal discount</option><option value="code">Coupon code</option><option value="student">Awarded student discount</option></select></Field>
        <Field label="Discount type"><select disabled={offer.audience === 'student'} value={offer.value_kind} onChange={e => update({ value_kind: e.target.value as DiscountOffer['value_kind'], value: 10 })}><option value="percent">Percentage</option><option value="fixed">Fixed INR amount</option></select></Field>
        <Field label={offer.value_kind === 'percent' ? 'Percentage off' : 'Amount off · INR'}><input required type="number" min={offer.value_kind === 'percent' ? 1 : .01} max={offer.value_kind === 'percent' ? offer.audience === 'student' ? 20 : 100 : undefined} step={offer.value_kind === 'percent' ? 1 : .01} value={offer.value_kind === 'fixed' ? offer.value / 100 : offer.value} onChange={e => update({ value: offer.value_kind === 'fixed' ? Math.round(Number(e.target.value) * 100) : Number(e.target.value) })} /></Field>
        <Field label="Starts · IST"><input required type="datetime-local" value={offer.starts_at ? labDateTimeInput(new Date(offer.starts_at)) : ''} onChange={e => update({ starts_at: e.target.value ? labInstant(e.target.value).toISOString() : '' })} /></Field>
        <Field label="Ends · IST"><input required type="datetime-local" value={offer.ends_at ? labDateTimeInput(new Date(offer.ends_at)) : ''} onChange={e => update({ ends_at: e.target.value ? labInstant(e.target.value).toISOString() : '' })} /></Field>
        <Field label="Status"><select value={offer.state} onChange={e => update({ state: e.target.value as DiscountOffer['state'] })}><option value="paused">Paused</option><option value="active">Active during scheduled dates</option><option value="expired">Expired</option></select></Field>
        {offer.audience === 'code' && <Field label="Coupon code"><input required value={offer.code ?? ''} onChange={e => update({ code: e.target.value })} /></Field>}
        {personal && <><Field label="Find member by name or email"><input value={search} onChange={e => setSearch(e.target.value)} /></Field><Field label="Selected member"><select required value={offer.member_id ?? ''} onChange={e => update({ member_id: e.target.value || null, member_name: members.find(m => m.user_id === e.target.value)?.name, member_email: members.find(m => m.user_id === e.target.value)?.email })}><option value="">Select a member</option>{offer.member_id && !members.some(member => member.user_id === offer.member_id) && <option value={offer.member_id}>{offer.member_name || "Assigned account"} · {offer.member_email || offer.member_id}</option>}{members.map(member => <option key={member.user_id} value={member.user_id}>{member.name} · {member.email}</option>)}</select></Field><Field label="Personal offer usage"><select value={offer.personal_use} onChange={e => update({ personal_use: e.target.value as DiscountOffer['personal_use'] })}><option value="once">One use</option><option value="repeat_until_expiry">Every eligible purchase until expiry</option></select></Field></>}
        <Field label="Total uses · blank for unlimited"><input type="number" min="1" step="1" value={offer.total_limit ?? ''} onChange={e => update({ total_limit: e.target.value ? Number(e.target.value) : null })} /></Field>
        <Field label="Uses per member · blank for unlimited"><input type="number" min="1" step="1" value={offer.per_member_limit ?? ''} onChange={e => update({ per_member_limit: e.target.value ? Number(e.target.value) : null })} /></Field>
      </div><Field label="Member-facing description"><textarea required maxLength={1000} value={offer.description} onChange={e => update({ description: e.target.value })} /></Field>
      <fieldset><legend>Eligible products</legend>{['coworking', 'cabin', 'equipment'].map(category => <label className="discount-check" key={category}><input type="checkbox" disabled={offer.audience === 'student'} checked={offer.categories.includes(category)} onChange={e => update({ categories: e.target.checked ? [...offer.categories, category] : offer.categories.filter(value => value !== category) })} />{category === 'cabin' ? 'Whole cabins' : category}</label>)}</fieldset>
      <label className="discount-check"><input type="checkbox" disabled={offer.audience === 'student'} checked={offer.stack_with_launch} onChange={e => update({ stack_with_launch: e.target.checked })} />Apply after the launch discount</label><p>Otherwise the best eligible offer applies. Personal offers are private. Student awards apply only to individual coworking, up to 20% after the launch offer.</p>
      <button className="button button-primary">Review discount</button></fieldset></form>
      {review && <div className="discount-review" role="region" aria-label="Review discount"><h3 tabIndex={-1} ref={reviewHeading}>Confirm {offer.name}</h3><p>{offerAmount(offer)} off · {offer.categories.join(', ')} · {offer.state}</p><p>{offerTime(offer.starts_at)} to {offerTime(offer.ends_at)} IST</p>{personal && <p>{offer.member_name || "Assigned account"} · {offer.member_email || offer.member_id} · {offer.personal_use === 'once' ? 'One use' : 'Every eligible purchase until expiry'}</p>}<Field label="Illustrative eligible subtotal · INR"><input type="number" min="0" value={sample} onChange={e => setSample(Math.max(0, Number(e.target.value)))} /></Field><p>Illustration: ₹{sample.toFixed(2)} − ₹{Math.min(sample, saving).toFixed(2)} = ₹{Math.max(0, sample - saving).toFixed(2)} before tax. This is not a quote; eligibility, limits and competing offers are checked by the server at booking.</p><button type="button" className="button button-primary" disabled={busy} onClick={() => void save()}>Confirm and save</button> <button type="button" className="button button-quiet" onClick={() => setReview(false)}>Back to editing</button></div>}
      {offer.id && offer.member_id && <DiscountQuotePreview key={`${offer.id}:${offer.revision}:${offer.member_id}`} client={client} memberId={offer.member_id} />}
      {history.length > 0 && <details><summary>Change history</summary><ul>{history.map((entry, index) => <li key={index}>{offerTime(entry.created_at)} IST · actor {entry.actor_id} · {entry.before_data ? `revision ${entry.before_data.revision}` : 'Created'} → revision {entry.after_data.revision} · {entry.after_data.state}</li>)}</ul></details>}
    </Section>
  </>;
}
