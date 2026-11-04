import { afterEach, expect, it, vi } from 'vitest';
import { documentAvailable, GOVERNMENT_ID_RETENTION_VERSION, type LocalDocument } from '../../src/lib/onboarding';
import { onboardingDocumentAvailable } from '../../supabase/functions/_shared/onboarding-retention';

afterEach(() => vi.useRealTimers());

it('fails closed on unbounded, malformed, expired or deleted identity copies', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
  const doc: LocalDocument = { id: 'synthetic', user_id: 'synthetic', kind: 'government_id', id_type: 'pan', uploaded_at: '2026-11-04', expires_at: '2026-11-05T10:00:00Z', deleted_at: null };
  expect(documentAvailable(doc)).toBe(true);
  for (const unavailable of [
    { ...doc, deleted_at: '2026-11-04' },
    { ...doc, expires_at: 'infinity' },
    { ...doc, expires_at: 'invalid' },
    { ...doc, expires_at: '2020-01-01' },
    { ...doc, expires_at: '2026-11-04T10:00:00Z' },
  ]) {
    expect(documentAvailable(unavailable)).toBe(false);
    expect(onboardingDocumentAvailable(unavailable)).toBe(false);
  }
  expect(onboardingDocumentAvailable(doc)).toBe(true);
  expect(GOVERNMENT_ID_RETENTION_VERSION).toBe('2026-11-04-active-service-id-v1');
});
