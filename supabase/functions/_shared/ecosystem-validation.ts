export const ecosystemPrimaryTypes = ['startup', 'research-ecosystem', 'supplier', 'vendor', 'other'] as const;
export const ecosystemNeeds = ['build', 'source', 'manufacture', 'test', 'learn', 'fund', 'pilot'] as const;
const textFields: Record<string, number> = {
  slug: 100, name: 160, summary: 2000, locality: 300, subcategory: 100,
  websiteUrl: 1000, sourceUrl: 1000, founders: 500, provenance: 2000,
  verifiedAt: 10, publicEmail: 254, accessNote: 2000, tips: 2000,
  engageHow: 1000, salesChannel: 500, priceLevel: 300, minOrder: 300,
  pricingModel: 500, turnaround: 300,
};
const enums: Record<string, readonly string[]> = {
  primaryType: ecosystemPrimaryTypes,
  entityType: ['Startup', 'Company', 'Research & ecosystem'],
  locationPrecision: ['Address-level', 'Locality-level', 'City-level', 'Metro presence'],
  confidence: ['High', 'Medium'], locationConfidence: ['High', 'Medium'],
};
const arrayFields: Record<string, readonly string[]> = {
  alsoListedAs: ecosystemPrimaryTypes, needs: ecosystemNeeds,
  sectors: ['Robotics', 'Physical AI', 'Drones & aerospace', 'Space hardware', 'Industrial automation', 'Hardware & sensing', 'Edge & embedded systems', 'Learning & training', 'Research & ecosystem'],
};
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
export function publicUrl(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
export function validateEcosystemData(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Listing details must be an object.');
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Object.hasOwn(textFields, key)) {
      if (typeof value !== 'string' || value.length > textFields[key]) throw new Error(`Invalid ${key}.`);
      data[key] = value.trim();
    } else if (Object.hasOwn(enums, key)) {
      if (typeof value !== 'string' || !enums[key].includes(value)) throw new Error(`Invalid ${key}.`);
      data[key] = value;
    } else if (Object.hasOwn(arrayFields, key)) {
      if (!Array.isArray(value) || value.length > 12 || value.some(v => typeof v !== 'string' || !arrayFields[key].includes(v))) throw new Error(`Invalid ${key}.`);
      data[key] = [...new Set(value)];
    } else if (key === 'coordinates') {
      if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== 'number' || !Number.isFinite(v)) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('Invalid coordinates.');
      data[key] = value;
    } else if (key === 'publicPhones') {
      if (!Array.isArray(value) || value.length > 5) throw new Error('Add no more than five public phone numbers.');
      data[key] = value.map(phone => {
        if (!phone || typeof phone.label !== 'string' || !phone.label.trim() || phone.label.length > 60 || typeof phone.number !== 'string' || !/^\+[1-9][0-9 ()-]{6,24}$/.test(phone.number)) throw new Error('Phone numbers need a label and country code.');
        return { label: phone.label.trim(), number: phone.number.trim() };
      });
    } else if (key === 'credit') {
      if (value === null) data.credit = null;
      else {
        const credit = value as { name?: unknown; link?: unknown };
        if (!credit || typeof credit.name !== 'string' || !credit.name.trim() || credit.name.length > 120 || (credit.link !== undefined && (typeof credit.link !== 'string' || credit.link.length > 1000 || (credit.link && !publicUrl(credit.link))))) throw new Error('Invalid public contributor credit.');
        data.credit = { name: credit.name.trim(), link: credit.link || '' };
      }
    } else throw new Error(`Unsupported listing field: ${key}.`);
  }
  if (typeof data.name !== 'string' || data.name.length < 2 || typeof data.summary !== 'string' || data.summary.length < 10 || !data.primaryType) throw new Error('Type, name and a useful summary are required.');
  if (data.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(data.slug))) throw new Error('Invalid listing identifier.');
  for (const key of ['websiteUrl', 'sourceUrl']) if (data[key] && !publicUrl(String(data[key]))) throw new Error('Public links must use HTTP or HTTPS.');
  if (data.publicEmail && !emailPattern.test(String(data.publicEmail))) throw new Error('Invalid public email.');
  if (!data.websiteUrl && !data.sourceUrl && !data.publicEmail && !(data.publicPhones as unknown[] | undefined)?.length) throw new Error('Add at least one public link or contact.');
  if (data.primaryType === 'startup' && !data.sourceUrl) throw new Error('Startups need a source link.');
  if (data.verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.verifiedAt))) throw new Error('Invalid source-check date.');
  if (data.primaryType === 'other' && /people|person|housing/i.test(String(data.subcategory || '')) && data.coordinates) throw new Error('People and housing resources must not contain private map coordinates.');
  if (data.coordinates && !['Address-level', 'Locality-level'].includes(String(data.locationPrecision))) throw new Error('Unconfirmed locations must remain unpinned.');
  return data;
}
