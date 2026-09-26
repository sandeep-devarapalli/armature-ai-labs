export type PassKind = 'day' | 'week' | 'month' | 'overnight'
const DAY = 86_400_000

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Use a valid YYYY-MM-DD date.')
  const result = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) {
    throw new RangeError('Use a valid calendar date.')
  }
  return result
}

function addDays(value: string, days: number): string {
  return new Date(dateValue(value) + days * DAY).toISOString().slice(0, 10)
}

function atHour(value: string, hour: number): string {
  dateValue(value)
  return new Date(`${value}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString()
}

export function getAgeOnDate(dateOfBirth: string, date: string): number {
  dateValue(dateOfBirth)
  dateValue(date)
  if (dateOfBirth > date) throw new RangeError('Date of birth cannot be in the future.')
  return Number(date.slice(0, 4)) - Number(dateOfBirth.slice(0, 4))
    - (date.slice(5) < dateOfBirth.slice(5) ? 1 : 0)
}

export interface RegistrationPreview {
  dateOfBirth: string
  linkedInUrl: string
  guardianEmail?: string
  guardianConsentReviewed?: boolean
}

export function validateRegistration(input: RegistrationPreview, today: string): string[] {
  const errors: string[] = []
  let age: number
  try { age = getAgeOnDate(input.dateOfBirth, today) } catch { return ['Enter a valid date of birth.'] }
  if (age < 16) errors.push('Membership starts at age 16.')
  if (!/^https:\/\/(www\.)?linkedin\.com\/in\/[^/?#\s]+\/?(?:[?#].*)?$/i.test(input.linkedInUrl.trim())) {
    errors.push('Enter your own LinkedIn profile URL.')
  }
  if (age >= 16 && age < 18) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guardianEmail?.trim() ?? '')) {
      errors.push('A guardian email address is required.')
    }
    if (!input.guardianConsentReviewed) errors.push('Staff must review the guardian’s emailed permission before approval.')
  }
  return errors
}

export interface PassSelection {
  kind: PassKind
  date: string
  selectedDates?: string[]
  dateOfBirth?: string
  renewalRequested?: boolean
}

export interface PassPreview {
  kind: PassKind
  dates: string[]
  startDate: string
  endDate: string
  startAt: string
  endAt: string
  closedDates: string[]
  renewalAllowed: boolean
  renewalRequested: boolean
  accessLabel: string
  refundDeadline: string | null
  refundInterpretation: string
}

export function buildPassPreview(selection: PassSelection, closures: string[] = []): PassPreview {
  dateValue(selection.date)
  closures.forEach(dateValue)
  let dates: string[]
  if (selection.kind === 'day') {
    dates = [...new Set(selection.selectedDates ?? [selection.date])].sort()
    if (!dates.length) throw new RangeError('Select at least one day.')
    dates.forEach(dateValue)
    if (dates.some(date => date.slice(0, 7) !== selection.date.slice(0, 7))) {
      throw new RangeError('Day-pass dates must be within the selected month.')
    }
  } else if (selection.kind === 'month') {
    const first = `${selection.date.slice(0, 7)}-01`
    dates = []
    for (let date = first; date.slice(0, 7) === first.slice(0, 7); date = addDays(date, 1)) dates.push(date)
  } else if (selection.kind === 'week') {
    dates = Array.from({ length: 7 }, (_, i) => addDays(selection.date, i))
  } else if (selection.kind === 'overnight') {
    if (!selection.dateOfBirth || getAgeOnDate(selection.dateOfBirth, selection.date) < 18) {
      throw new RangeError('Overnight access is adults-only (18+).')
    }
    dates = [selection.date]
  } else {
    throw new RangeError('Unknown pass type.')
  }
  const startDate = dates[0]
  const overnight = selection.kind === 'overnight'
  const endDate = overnight ? addDays(startDate, 1) : dates[dates.length - 1]
  const startAt = atHour(startDate, overnight ? 23 : 9)
  const renewalAllowed = selection.kind === 'week' || selection.kind === 'month'
  const refundHours = selection.kind === 'day' ? 1 : selection.kind === 'week' ? 24 : 48
  const coveredDates = overnight ? [startDate, endDate] : dates
  return {
    kind: selection.kind, dates, startDate, endDate, startAt,
    endAt: atHour(endDate, overnight ? 8 : 17),
    closedDates: coveredDates.filter(date => closures.includes(date)),
    renewalAllowed, renewalRequested: renewalAllowed && !!selection.renewalRequested,
    accessLabel: overnight ? '23:00–08:00 next day · Asia/Kolkata' : '09:00–17:00 on selected open dates · Asia/Kolkata',
    refundDeadline: overnight ? null : new Date(Date.parse(startAt) + refundHours * 3_600_000).toISOString(),
    refundInterpretation: overnight ? 'Overnight refund policy is not defined.' : selection.kind === 'day'
      ? 'Per-date preview: full refund from 09:00 through 10:00 IST; pre-start and multi-date order policies await confirmation.'
      : `Preview interpretation: ${refundHours} elapsed hours from 09:00 IST on the first date; confirmation pending. Pre-start refunds are undefined.`,
  }
}

export function isFullRefundEligible(pass: PassPreview, now: string, dayDate?: string): boolean {
  const timestamp = Date.parse(now)
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(now) || !Number.isFinite(timestamp)) throw new RangeError('Enter a valid current timestamp.')
  if (!pass.refundDeadline) return false
  let start = Date.parse(pass.startAt)
  let deadline = Date.parse(pass.refundDeadline)
  if (pass.kind === 'day') {
    if (!dayDate && pass.dates.length > 1) throw new RangeError('Choose the individual day being refunded.')
    const date = dayDate ?? pass.startDate
    if (!pass.dates.includes(date)) throw new RangeError('The refund date is not in this pass.')
    start = Date.parse(atHour(date, 9))
    deadline = Date.parse(atHour(date, 10))
  }
  return timestamp >= start && timestamp <= deadline
}

export function cabinGuestLimit(seats: number): number {
  if (!Number.isInteger(seats) || seats < 1) throw new RangeError('Cabin seats must be a positive whole number.')
  return Math.floor(seats / 2)
}

export interface TimeInterval { start: number; end: number }
export function eventBufferedInterval(start: string, end: string): TimeInterval {
  const startTime = Date.parse(start)
  const endTime = Date.parse(end)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime - startTime < 3_600_000) {
    throw new RangeError('Events require a valid interval of at least one hour.')
  }
  return { start: startTime - 20 * 60_000, end: endTime + 20 * 60_000 }
}

export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end
}
