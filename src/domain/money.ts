export function parseMoneyToMinor(input: string, locale = 'en-US'): number | null {
  const normalized = input.trim()
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value ?? '.'
  const parts = normalized.split(decimal)
  if (parts.length > 2 || !/^\d{1,7}$/.test(parts[0])) return null
  if (parts[1] !== undefined && !/^\d{1,2}$/.test(parts[1])) return null
  const [whole = '0', fraction = ''] = parts
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  return minor > 0n && minor <= 100_000_000n ? Number(minor) : null
}

export function formatMoney(amountMinor: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .format(amountMinor / 100)
}

export function formatDate(value: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatReference(value: string, prefix: string): string {
  const compactId = value.replaceAll('-', '')
  const suffix = /^[a-f0-9]{32}$/i.test(compactId)
    ? compactId.slice(-8).toUpperCase()
    : hashReference(value)
  return `${prefix}-${suffix}`
}

function hashReference(value: string): string {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0
  }
  return hash.toString(36).toUpperCase().padStart(7, '0')
}