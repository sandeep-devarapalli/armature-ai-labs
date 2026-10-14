import { expect, it } from 'vitest';
import { documentAvailable, GOVERNMENT_ID_RETENTION_VERSION, type LocalDocument } from '../../src/lib/onboarding';

it('recognizes retained IDs without treating malformed expiry as active', () => {
  const doc: LocalDocument = { id: 'synthetic', user_id: 'synthetic', kind: 'government_id', id_type: 'pan', uploaded_at: '2026-10-14', expires_at: 'infinity', deleted_at: null };
  expect(documentAvailable(doc)).toBe(true);
  expect(documentAvailable({ ...doc, deleted_at: '2026-10-14' })).toBe(false);
  expect(documentAvailable({ ...doc, expires_at: 'invalid' })).toBe(false);
  expect(documentAvailable({ ...doc, expires_at: '2020-01-01' })).toBe(false);
  expect(GOVERNMENT_ID_RETENTION_VERSION).toBe('2026-10-14-equipment-id-v1');
});
