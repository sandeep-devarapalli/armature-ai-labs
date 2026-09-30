export type DiscountOffer = {
  id: string; revision: number; name: string; description: string; audience: 'public' | 'personal' | 'code' | 'student';
  member_id: string | null; member_name?: string; member_email?: string; code: string | null; value_kind: 'percent' | 'fixed'; value: number;
  categories: string[]; starts_at: string; ends_at: string; state: 'active' | 'paused' | 'expired';
  personal_use: 'once' | 'repeat_until_expiry'; total_limit: number | null; per_member_limit: number | null; stack_with_launch: boolean;
};
export const offerAmount = (offer: Pick<DiscountOffer, 'value_kind' | 'value'>) => offer.value_kind === 'percent' ? `${offer.value}%` : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(offer.value / 100);
export const offerTime = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
