import { describe, expect, it } from 'vitest';
import { validateEcosystemData } from '../../supabase/functions/_shared/ecosystem-validation';

const fixture = { name: 'Example lab', summary: 'Synthetic public fixture', primaryType: 'supplier', websiteUrl: 'https://example.org' };
describe('ecosystem public payload validation', () => {
  it('retains labelled phones and separate opt-in credit', () => {
    const publicPhones = [{ label: 'Office', number: '+91 8000000000' }, { label: 'Workshop', number: '+91 8000000001' }];
    expect(validateEcosystemData({ ...fixture, publicPhones, credit: { name: 'Public name', link: 'https://example.org/profile' } }).publicPhones).toEqual(publicPhones);
  });
  it('rejects private fields and inherited object keys', () => {
    expect(() => validateEcosystemData({ ...fixture, submitterEmail: 'private@example.org' })).toThrow();
    expect(() => validateEcosystemData(JSON.parse(JSON.stringify(fixture).slice(0, -1) + ',"__proto__":"unsafe"}'))).toThrow();
  });
  it('requires a source for startups and rejects unsafe links', () => {
    expect(() => validateEcosystemData({ ...fixture, primaryType: 'startup' })).toThrow();
    expect(() => validateEcosystemData({ ...fixture, websiteUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => validateEcosystemData({ ...fixture, websiteUrl: 'https://user:password@example.org' })).toThrow();
  });
  it('bounds numbers, categories, and private map locations', () => {
    expect(() => validateEcosystemData({ ...fixture, publicPhones: [{ label: 'Office', number: '8000000000' }] })).toThrow();
    expect(() => validateEcosystemData({ ...fixture, needs: ['invented'] })).toThrow();
    expect(() => validateEcosystemData({ ...fixture, coordinates: [181, 13] })).toThrow();
    expect(() => validateEcosystemData({ ...fixture, primaryType: 'other', subcategory: 'People', coordinates: [77, 13] })).toThrow();
  });
  it('keeps complete existing source/location fields for edits', () => {
    const existing = { ...fixture, slug: 'example-lab', locality: 'Bengaluru', coordinates: [77.5, 13], locationPrecision: 'Locality-level', provenance: 'Historical source', verifiedAt: '2026-07-30', sectors: ['Hardware & sensing'] };
    expect(validateEcosystemData(existing)).toEqual(existing);
  });
});
