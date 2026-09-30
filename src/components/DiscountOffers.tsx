import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAccount } from '../context/AccountContext';
import { supabase } from '../lib/supabase';
import { offerAmount, offerTime, type DiscountOffer } from '../lib/discountOffers';
import { Section } from './Primitives';

export function DiscountOffers({ categories, client = supabase as SupabaseClient | null }: { categories: string[]; client?: SupabaseClient | null }) {
  const { account } = useAccount();
  const [snapshot, setSnapshot] = useState<{ userId: string | null; offers: DiscountOffer[] }>({ userId: null, offers: [] });
  const userId = account?.user_id ?? null;
  useEffect(() => {
    let active = true;
    if (!client) return;
    void Promise.all([client.rpc('public_discount_offers', undefined, { get: true }), userId ? client.rpc('my_discount_offers', undefined, { get: true }) : Promise.resolve({ data: [], error: null })]).then(results => {
      if (active) setSnapshot({ userId, offers: results.flatMap((result, index) => result.error ? [] : (result.data ?? []).map((offer: DiscountOffer) => ({ ...offer, ...(index === 0 ? { audience: 'public' } : {}) }))) });
    }).catch(() => { if (active) setSnapshot({ userId, offers: [] }); });
    return () => { active = false; };
  }, [client, userId]);
  const offers = snapshot.userId === userId ? snapshot.offers.filter(offer => offer.categories.some(category => categories.includes(category))) : [];
  if (!offers.length) return null;
  return <Section number="Offers" title="Offers"><div className="card-grid">{offers.map(offer => <article className="card" key={offer.id}><h3>{offer.name}</h3><p>{offerAmount(offer)} off · {offer.audience === 'public' ? 'General promotion' : 'Your private offer'}</p><p>{offer.description}</p><p>Eligible purchases from {offerTime(offer.starts_at)} to {offerTime(offer.ends_at)} IST. {offer.categories.join(', ')} only.</p>{offer.audience !== 'public' && <p>{offer.personal_use === 'once' ? 'One use.' : 'Repeat use until expiry.'}</p>}<p>{offer.stack_with_launch ? 'Applies after eligible launch pricing.' : 'Best eligible offer applies; not combined with launch pricing.'} Usage limits and eligibility apply. Paid bookings remain closed.</p></article>)}</div></Section>;
}
