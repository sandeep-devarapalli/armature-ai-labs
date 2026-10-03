import { describe, expect, it } from 'vitest';
import { isGoogleMapsUrl, validateEcosystemData } from '../../supabase/functions/_shared/ecosystem-validation';

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
  it('accepts optional guide metadata without deriving a map pin', () => {
    const data = validateEcosystemData({ ...fixture, city: 'bangalore', guideCategories: ['workspaces', 'communities', 'workspaces'], googleMapsUrl: 'https://maps.app.goo.gl/syntheticPlace' });
    expect(data.guideCategories).toEqual(['workspaces', 'communities']);
    expect(data.googleMapsUrl).toBe('https://maps.app.goo.gl/syntheticPlace');
    expect(data).not.toHaveProperty('coordinates');
    expect(validateEcosystemData(fixture)).toEqual(fixture);
  });
  it.each(['https://maps.app.goo.gl/syntheticPlace?g_st=ic', 'https://www.google.com/maps/place/Synthetic', 'https://google.com/maps?cid=123', 'https://maps.google.com/?q=Synthetic'])('accepts actual HTTPS Maps URL syntax: %s', (googleMapsUrl) => {
    expect(validateEcosystemData({ ...fixture, googleMapsUrl }).googleMapsUrl).toBe(googleMapsUrl);
  });
  it.each(['http://maps.google.com/', 'javascript:alert(1)', 'https://google.com/search?q=Synthetic', 'https://google.com/maps-redirect', 'https://maps.app.goo.gl/', 'https://maps.app.goo.gl.evil.test/place', 'https://maps.google.com.evil.test/', 'https://maps.google.com@evil.test/', 'https://user:password@maps.google.com/', 'https://maps.google.com:444/', 'https://maps.google.com\\@evil.test/', 'https://maps.google.com/with space'])('rejects unsafe or non-Maps URL: %s', (googleMapsUrl) => {
    expect(() => validateEcosystemData({ ...fixture, googleMapsUrl })).toThrow(/Google Maps/);
  });
  it('rejects unsupported guide metadata and private Maps links', () => {
    expect(() => validateEcosystemData({ ...fixture, city: 'mumbai' })).toThrow(/city/);
    expect(() => validateEcosystemData({ ...fixture, guideCategories: ['invented'] })).toThrow(/guideCategories/);
    expect(() => validateEcosystemData({ ...fixture, guideCategories: 'cafes' })).toThrow(/guideCategories/);
    expect(() => validateEcosystemData({ ...fixture, primaryType: 'other', subcategory: 'Housing resource', googleMapsUrl: 'https://maps.google.com/?q=Synthetic' })).toThrow(/private map locations/);
  });
  it('rejects every ASCII control and DEL before trimming Maps links', () => {
    for (const code of [...Array.from({ length: 32 }, (_, i) => i), 127]) {
      const control = String.fromCharCode(code);
      for (const googleMapsUrl of [`https://maps.google.com/${control}`, `${control}https://maps.google.com/`]) {
        expect(isGoogleMapsUrl(googleMapsUrl)).toBe(false);
        expect(() => validateEcosystemData({ ...fixture, googleMapsUrl })).toThrow(/Google Maps/);
      }
    }
  });
});
