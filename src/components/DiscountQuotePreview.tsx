import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Field } from './Primitives';
import { offerTime } from '../lib/discountOffers';
type Quote = { base_paise: number; launch_discount_paise: number; offer_discount_paise: number; offer_name: string | null; payable_paise: number; expires_at: string };
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
export function DiscountQuotePreview({ client, memberId }: { client: SupabaseClient | null; memberId: string }) {
  const [products, setProducts] = useState<{ id: string; name: string; kind: string; enabled: boolean }[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => { let active = true; if (client) void Promise.resolve(client.rpc('admin_discount_quote_products')).then(result => { if (active) { if (result.error) setError(result.error.message); else setProducts((result.data ?? []).filter((item: { kind: string; enabled: boolean }) => item.kind === 'workspace' && item.enabled)); } }).catch(failure => { if (active) setError(failure.message || 'Quote products could not be loaded.'); }); return () => { active = false; }; }, [client]);
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client) return; setBusy(true); setError(''); setQuote(null);
    const fields = new FormData(event.currentTarget);
    try {
      const result = await client.rpc('admin_preview_discount_access', { p_member_id: memberId, p_product_id: fields.get('product'), p_dates: String(fields.get('dates')).split(',').map(value => value.trim()), p_resource_id: null, p_seats: 1, p_code: String(fields.get('code') ?? '').trim() || null });
      if (result.error) throw result.error; setQuote(result.data);
    } catch (failure) { setError((failure as Error).message || 'Quote could not be calculated.'); } finally { setBusy(false); }
  }
  return <div className="discount-review"><h3>Check a saved offer against a workspace quote</h3><p>This read-only quote uses the assigned member’s eligibility and all saved offers. Unsaved changes are excluded. It does not reserve a place, redeem a discount or take payment.</p>{error && <p role="alert">{error}</p>}{products.length ? <form onSubmit={preview} onChange={() => setQuote(null)}><fieldset disabled={busy}><div className="form-grid"><Field label="Quote product"><select name="product">{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field><Field label="Service dates · YYYY-MM-DD, comma separated"><input name="dates" required placeholder="2030-10-01" /></Field><Field label="Optional coupon for quote"><input name="code" /></Field></div><button className="button button-quiet">Calculate server quote</button></fieldset></form> : <p>No enabled coworking products are configured for a server quote.</p>}{quote && <div role="status"><p>Standard price: {money(quote.base_paise)}<br />Launch discount: −{money(quote.launch_discount_paise)}<br />{quote.offer_name || 'Offer discount'}: −{money(quote.offer_discount_paise)}<br /><strong>Total before tax: {money(quote.payable_paise)}</strong></p><p>Quote expires {offerTime(quote.expires_at)} IST. Payment remains closed.</p></div>}</div>;
}
