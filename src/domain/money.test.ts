import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatMoney, formatReference, parseMoneyToMinor } from './money'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('money helpers', () => {
  it('converts plain decimal amounts to integer minor units', () => {
    expect(parseMoneyToMinor('42')).toBe(4200)
    expect(parseMoneyToMinor('42.5')).toBe(4250)
    expect(parseMoneyToMinor('0.01')).toBe(1)
    expect(parseMoneyToMinor('42,5', 'de-DE')).toBe(4250)
  })

  it('rejects invalid, zero, over-precision, and out-of-range amounts', () => {
    expect(parseMoneyToMinor('0')).toBeNull()
    expect(parseMoneyToMinor('12.345')).toBeNull()
    expect(parseMoneyToMinor('-12')).toBeNull()
    expect(parseMoneyToMinor('1e3')).toBeNull()
    expect(parseMoneyToMinor('1000000.01')).toBeNull()
  })

  it('formats minor units for display only', () => {
    expect(formatMoney(12500)).toBe('$125.00')
    expect(formatMoney(12500, 'EUR', 'de-DE')).toContain('125,00')
    expect(formatDate('2026-10-30T12:00:00Z')).toContain('2026')
  })

  it('formats stable references without exposing internal record identifiers', () => {
    const reference = formatReference('intent-captured-0001', 'PI')

    expect(reference).toMatch(/^PI-[0-9A-Z]{7}$/)
    expect(formatReference('intent-captured-0001', 'PI')).toBe(reference)
    expect(reference).not.toContain('CAPTURED')
    expect(formatReference('01234567-89ab-cdef-0123-456789abcdef', 'PI')).toBe('PI-89ABCDEF')
    expect(formatReference('', 'PI')).toMatch(/^PI-[0-9A-Z]{7}$/)
  })

  it('uses the ASCII decimal fallback when a locale has no decimal format part', () => {
    vi.spyOn(Intl.NumberFormat.prototype, 'formatToParts').mockReturnValue([])
    expect(parseMoneyToMinor('42.50')).toBe(4250)
  })
})