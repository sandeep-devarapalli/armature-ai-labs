import { describe, expect, it } from 'vitest'
import { buildPassPreview, cabinGuestLimit, eventBufferedInterval, getAgeOnDate, intervalsOverlap, isFullRefundEligible, validateRegistration } from '../../src/lib/membershipPreview'

describe('membership preview rules', () => {
  it('enforces exact birthdays and reviewed guardian email consent', () => {
    expect(getAgeOnDate('2010-09-27', '2026-09-26')).toBe(15)
    const member = { dateOfBirth: '2010-09-26', linkedInUrl: 'https://www.linkedin.com/in/example', guardianEmail: 'guardian@example.test' }
    expect(validateRegistration(member, '2026-09-26')).toEqual(['Staff must review the guardian’s emailed permission before approval.'])
    expect(validateRegistration({ ...member, guardianConsentReviewed: true }, '2026-09-26')).toEqual([])
    expect(validateRegistration({ ...member, dateOfBirth: '2008-09-26', guardianEmail: '' }, '2026-09-26')).toEqual([])
    expect(validateRegistration({ ...member, linkedInUrl: 'https://linkedin.com.evil.test/in/person' }, '2026-09-26')).toContain('Enter your own LinkedIn profile URL.')
  })

  it('rejects invalid and future dates of birth', () => {
    expect(() => getAgeOnDate('2025-02-29', '2026-01-01')).toThrow()
    expect(() => getAgeOnDate('2027-01-01', '2026-01-01')).toThrow()
    expect(getAgeOnDate('2008-02-29', '2026-02-28')).toBe(17)
    expect(getAgeOnDate('2008-02-29', '2026-03-01')).toBe(18)
  })

  it('sorts and deduplicates chosen days but disallows cross-month selections and renewal', () => {
    const pass = buildPassPreview({ kind: 'day', date: '2026-09-22', selectedDates: ['2026-09-30', '2026-09-22', '2026-09-22'], renewalRequested: true })
    expect(pass.dates).toEqual(['2026-09-22', '2026-09-30'])
    expect(pass.renewalRequested).toBe(false)
    expect(pass.startAt).toBe('2026-09-22T03:30:00.000Z')
    expect(() => buildPassPreview({ kind: 'day', date: '2026-09-22', selectedDates: [] })).toThrow()
    expect(() => buildPassPreview({ kind: 'day', date: '2026-09-22', selectedDates: ['2026-10-01'] })).toThrow()
  })

  it('keeps seven consecutive days across years and never extends for closures', () => {
    const pass = buildPassPreview({ kind: 'week', date: '2026-12-29', renewalRequested: true }, ['2027-01-01'])
    expect(pass.dates).toHaveLength(7)
    expect(pass.endDate).toBe('2027-01-04')
    expect(pass.closedDates).toEqual(['2027-01-01'])
    expect(pass.renewalRequested).toBe(true)
    expect(pass.refundDeadline).toBe('2026-12-30T03:30:00.000Z')
  })

  it('uses the whole calendar month including leap day', () => {
    const leap = buildPassPreview({ kind: 'month', date: '2028-02-22' })
    expect(leap.startDate).toBe('2028-02-01')
    expect(leap.endDate).toBe('2028-02-29')
    expect(leap.dates).toHaveLength(29)
    expect(leap.refundDeadline).toBe('2028-02-03T03:30:00.000Z')
    expect(buildPassPreview({ kind: 'month', date: '2027-02-22' }).dates).toHaveLength(28)
  })

  it('requires adulthood at overnight start and considers next-day closures', () => {
    expect(() => buildPassPreview({ kind: 'overnight', date: '2026-09-26', dateOfBirth: '2008-09-27' })).toThrow()
    const pass = buildPassPreview({ kind: 'overnight', date: '2026-12-31', dateOfBirth: '2008-09-26' }, ['2027-01-01'])
    expect(pass.startAt).toBe('2026-12-31T17:30:00.000Z')
    expect(pass.endAt).toBe('2027-01-01T02:30:00.000Z')
    expect(pass.closedDates).toEqual(['2027-01-01'])
    expect(isFullRefundEligible(pass, pass.startAt)).toBe(false)
  })

  it('uses the 9am refund clock, not check-in, with an inclusive deadline', () => {
    const pass = buildPassPreview({ kind: 'day', date: '2026-09-26' })
    expect(isFullRefundEligible(pass, '2026-09-26T08:59:59+05:30')).toBe(false)
    expect(isFullRefundEligible(pass, '2026-09-26T09:00:00+05:30')).toBe(true)
    expect(() => isFullRefundEligible(pass, '2026-09-26T09:30:00')).toThrow()
    expect(isFullRefundEligible(pass, '2026-09-26T10:00:00+05:30')).toBe(true)
    expect(isFullRefundEligible(pass, '2026-09-26T10:00:00.001+05:30')).toBe(false)
    const multiple = buildPassPreview({ kind: 'day', date: '2026-09-26', selectedDates: ['2026-09-26', '2026-09-29'] })
    expect(() => isFullRefundEligible(multiple, pass.startAt)).toThrow()
    expect(isFullRefundEligible(multiple, '2026-09-29T08:59:59+05:30', '2026-09-29')).toBe(false)
    expect(isFullRefundEligible(multiple, '2026-09-29T10:00:00+05:30', '2026-09-29')).toBe(true)
    expect(() => isFullRefundEligible(multiple, pass.startAt, '2026-09-30')).toThrow()
  })

  it('rounds cabin visitor caps down and reserves both event buffers', () => {
    expect(cabinGuestLimit(5)).toBe(2)
    expect(cabinGuestLimit(1)).toBe(0)
    expect(() => cabinGuestLimit(3.5)).toThrow()
    const first = eventBufferedInterval('2026-09-26T17:00:00+05:30', '2026-09-26T18:00:00+05:30')
    expect(new Date(first.start).toISOString()).toBe('2026-09-26T11:10:00.000Z')
    expect(intervalsOverlap(first, eventBufferedInterval('2026-09-26T18:39:00+05:30', '2026-09-26T19:39:00+05:30'))).toBe(true)
    expect(intervalsOverlap(first, eventBufferedInterval('2026-09-26T18:40:00+05:30', '2026-09-26T19:40:00+05:30'))).toBe(false)
    expect(() => eventBufferedInterval('2026-09-26T17:00:00Z', '2026-09-26T17:59:00Z')).toThrow()
  })
})
