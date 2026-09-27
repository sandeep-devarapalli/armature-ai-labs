import { describe, expect, it } from 'vitest';
import { estimateBookingBeta } from '../../src/lib/bookingBeta';

describe('read-only booking beta estimates', () => {
  it.each([
    ['day', '2026-11-17', 35_000, 50_000],
    ['week', '2026-12-01', 175_000, 250_000],
    ['month', '2026-12-01', 700_000, 1_000_000],
    ['cabin', '2026-12-01', 5_250_000, 7_500_000],
  ] as const)('uses approved whole-product launch pricing for %s', (product, start, launch, standard) => {
    const result = estimateBookingBeta({ product, dates: [start] });
    expect(result.totalPaise).toBe(launch);
    expect(result.standardTotalPaise).toBe(standard);
    expect(result.taxIncluded).toBe(false);
  });

  it('applies the student estimate after the launch discount', () => {
    const result = estimateBookingBeta({ product: 'month', dates: ['2026-12-01'], studentDiscountPercent: 20 });
    expect(result.totalPaise).toBe(560_000);
    expect(result.studentDiscountPaise).toBe(140_000);
    expect(result.studentEligibilityPending).toBe(true);
  });

  it('uses base pricing after expiry, including the individual student estimate', () => {
    const result = estimateBookingBeta({ product: 'day', dates: ['2027-01-01'], studentDiscountPercent: 20 });
    expect(result.totalPaise).toBe(40_000);
    expect(result.launchApplied).toBe(false);
  });

  it('deduplicates and sorts selected day passes within one month', () => {
    const result = estimateBookingBeta({ product: 'day', dates: ['2026-12-03', '2026-12-01', '2026-12-03'] });
    expect(result.dates).toEqual(['2026-12-01', '2026-12-03']);
    expect(result.totalPaise).toBe(70_000);
  });

  it('counts a week as seven consecutive days and includes the launch final day', () => {
    const result = estimateBookingBeta({ product: 'week', dates: ['2026-12-25'] });
    expect(result.dates).toHaveLength(7);
    expect(result.endsOn).toBe('2026-12-31');
    expect(result.totalPaise).toBe(175_000);
  });

  it('withholds a cross-expiry weekly total instead of inventing proration', () => {
    const result = estimateBookingBeta({ product: 'week', dates: ['2026-12-26'], studentDiscountPercent: 20 });
    expect(result.endsOn).toBe('2027-01-01');
    expect(result.needsReview).toBe(true);
    expect(result.totalPaise).toBeNull();
    expect(result.subtotalPaise).toBeNull();
    expect(result.studentDiscountPaise).toBeNull();
  });

  it('withholds totals before service rollout, including a partly open November month', () => {
    for (const product of ['day', 'week', 'month', 'cabin'] as const) {
      const result = estimateBookingBeta({ product, dates: [product === 'day' || product === 'week' ? '2026-11-16' : '2026-11-01'] });
      expect(result.needsReview).toBe(true);
      expect(result.totalPaise).toBeNull();
    }
  });

  it('uses UTC calendar boundaries including leap years', () => {
    const result = estimateBookingBeta({ product: 'month', dates: ['2028-02-01'] });
    expect(result.dates).toHaveLength(29);
    expect(result.endsOn).toBe('2028-02-29');
    expect(result.totalPaise).toBe(1_000_000);
  });

  it.each(['2027-02-29', '2026-11-31', '2026-13-01', '2026-1-01', '2026-12-01T00:00:00Z', ''])('rejects invalid or non-date input %s', date => {
    expect(() => estimateBookingBeta({ product: 'day', dates: [date] })).toThrow('valid date');
  });

  it('rejects day selections across months and non-first monthly starts', () => {
    expect(() => estimateBookingBeta({ product: 'day', dates: ['2026-11-30', '2026-12-01'] })).toThrow('one calendar month');
    expect(() => estimateBookingBeta({ product: 'month', dates: ['2026-12-02'] })).toThrow('first day');
    expect(() => estimateBookingBeta({ product: 'week', dates: ['2026-12-01', '2026-12-02'] })).toThrow('one pass start');
  });

  it('rejects empty date selections, invalid discounts and cabin student discounts', () => {
    expect(() => estimateBookingBeta({ product: 'day', dates: [] })).toThrow('Select between');
    for (const studentDiscountPercent of [-1, 21, Number.NaN, Infinity]) {
      expect(() => estimateBookingBeta({ product: 'day', dates: ['2026-12-01'], studentDiscountPercent })).toThrow('between 0% and 20%');
    }
    expect(() => estimateBookingBeta({ product: 'cabin', dates: ['2026-12-01'], studentDiscountPercent: 20 })).toThrow('individual coworking');
  });
});

it('rejects a week that overflows the supported calendar', () => {
  expect(() => estimateBookingBeta({ product: 'week', dates: ['9999-12-31'] })).toThrow(/four-digit/);
});
