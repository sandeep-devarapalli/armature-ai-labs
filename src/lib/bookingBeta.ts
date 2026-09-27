export type BookingBetaProduct = 'day' | 'week' | 'month' | 'cabin';

export const BOOKING_BETA_ROLLOUT = '2026-11-17';
export const BOOKING_BETA_LAUNCH_END = '2026-12-31';
export const BOOKING_BETA_PRICES = {
  day: { standardPaise: 50_000, launchPaise: 35_000 },
  week: { standardPaise: 250_000, launchPaise: 175_000 },
  month: { standardPaise: 1_000_000, launchPaise: 700_000 },
  cabin: { standardPaise: 7_500_000, launchPaise: 5_250_000 },
} as const;

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Select a valid date.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Select a valid date.');
  }
  return date;
}

export function estimateBookingBeta({ product, dates: inputDates, studentDiscountPercent = 0 }: {
  product: BookingBetaProduct;
  dates: string[];
  studentDiscountPercent?: number;
}) {
  if (!Object.hasOwn(BOOKING_BETA_PRICES, product)) throw new Error('Select a valid pass.');
  if (!Array.isArray(inputDates) || inputDates.length < 1 || inputDates.length > 31) {
    throw new Error('Select between 1 and 31 dates.');
  }
  inputDates.forEach(parseDate);
  if (!Number.isFinite(studentDiscountPercent) || studentDiscountPercent < 0 || studentDiscountPercent > 20) {
    throw new Error('Student discount must be between 0% and 20%.');
  }
  if (product === 'cabin' && studentDiscountPercent !== 0) {
    throw new Error('Student discounts apply only to individual coworking passes.');
  }
  let dates = [...new Set(inputDates)].sort();
  if (product === 'day') {
    if (dates[0].slice(0, 7) !== dates[dates.length - 1].slice(0, 7)) {
      throw new Error('Select day passes within one calendar month.');
    }
  } else {
    if (inputDates.length !== 1) throw new Error('Select one pass start date.');
    const start = parseDate(dates[0]);
    if (product !== 'week' && start.getUTCDate() !== 1) {
      throw new Error('Monthly passes start on the first day of the calendar month.');
    }
    const end = new Date(start);
    if (product === 'week') end.setUTCDate(end.getUTCDate() + 6);
    else end.setUTCMonth(end.getUTCMonth() + 1, 0);
    dates = [];
    for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      dates.push(day.toISOString().slice(0, 10));
    }
  }
  const startsOn = dates[0];
  const endsOn = dates[dates.length - 1];
  const reviewReason = startsOn < BOOKING_BETA_ROLLOUT
    ? 'Services roll out from 17 November 2026. Pricing for earlier dates is not available.'
    : product === 'week' && startsOn <= BOOKING_BETA_LAUNCH_END && endsOn > BOOKING_BETA_LAUNCH_END
      ? 'This week crosses the launch-offer end date. Pricing needs confirmation; no proration is assumed.'
      : null;
  const units = product === 'day' ? dates.length : 1;
  const price = BOOKING_BETA_PRICES[product];
  const launchApplied = reviewReason === null && endsOn <= BOOKING_BETA_LAUNCH_END;
  const subtotalPaise = reviewReason ? null : units * (launchApplied ? price.launchPaise : price.standardPaise);
  const studentDiscountPaise = subtotalPaise === null ? null : Math.round(subtotalPaise * studentDiscountPercent / 100);
  return {
    dates, startsOn, endsOn,
    standardTotalPaise: units * price.standardPaise,
    subtotalPaise,
    studentDiscountPaise,
    totalPaise: subtotalPaise === null || studentDiscountPaise === null ? null : subtotalPaise - studentDiscountPaise,
    launchApplied,
    needsReview: reviewReason !== null,
    reviewReason,
    taxIncluded: false as const,
    studentEligibilityPending: studentDiscountPercent > 0,
  };
}
