import { describe, expect, it } from 'vitest'
import {
  contentModelSchema,
  dataCurrency,
  dataKeys,
  dataString,
  dataStringAt,
  dataStringFrom,
  dataStringOr,
  dataStringRecord,
  errorMessage,
} from './content-schema'
import type { ContentModel, Translate } from './content-schema'
import { testModel } from './test/renderWithContent'

const translate: Translate = (key) => testModel.messages[key] ?? `missing:${key}`

function withData(data: Record<string, unknown>): ContentModel {
  return { ...testModel, data }
}

describe('content model validation', () => {
  it('accepts a strict, versioned model and rejects invalid metadata and extra fields', () => {
    expect(contentModelSchema.safeParse(testModel).success).toBe(true)
    expect(contentModelSchema.safeParse({ ...testModel, version: 2 }).success).toBe(false)
    expect(contentModelSchema.safeParse({ ...testModel, appId: '' }).success).toBe(false)
    expect(contentModelSchema.safeParse({ ...testModel, locale: 'x' }).success).toBe(false)
    expect(contentModelSchema.safeParse({ ...testModel, unexpected: true }).success).toBe(false)
  })

  it('validates primitive and record data without silently accepting missing values', () => {
    expect(dataString(testModel, 'defaultProfile')).toBe('merchant-northstar')
    expect(() => dataString(withData({ label: 12 }), 'label')).toThrow('CONTENT_DATA_INVALID:label')

    expect(dataCurrency(testModel, 'currency.code')).toBe('USD')
    expect(() => dataCurrency(withData({ currency: 'EUR' }), 'currency')).toThrow(
      'CONTENT_DATA_INVALID:currency',
    )

    expect(dataStringRecord(testModel, 'merchantNames')['merchant-demo-01']).toBe('Northstar Goods')
    expect(() => dataStringRecord(withData({ names: { invalid: 1 } }), 'names'))
      .toThrow('CONTENT_DATA_INVALID:names')
    expect(dataStringFrom(testModel, 'merchantNames', 'merchant-demo-02')).toBe('Cedar & Coast')
    expect(() => dataStringFrom(testModel, 'merchantNames', 'unknown'))
      .toThrow('CONTENT_DATA_INVALID:merchantNames.unknown')
  })

  it('uses only explicit string fallbacks and validates nested content records', () => {
    expect(dataStringOr(testModel, 'paymentDescriptions', 'unknown', 'API description'))
      .toBe('API description')
    expect(dataStringOr(testModel, 'paymentDescriptions', 'intent-demo-created', 'fallback'))
      .toBe('Online order · #1048')
    expect(() => dataStringOr(withData({ labels: 'not-a-record' }), 'labels', 'x', 'fallback'))
      .toThrow('CONTENT_DATA_INVALID:labels')
    expect(() => dataStringOr(withData({ labels: { x: 1 } }), 'labels', 'x', 'fallback'))
      .toThrow('CONTENT_DATA_INVALID:labels.x')

    expect(dataKeys(testModel, 'eventTypes')).toEqual(['PAYMENT_CAPTURED', 'PAYMENT_REFUNDED'])
    expect(() => dataKeys(withData({ labels: null }), 'labels')).toThrow('CONTENT_DATA_INVALID:labels')

    expect(dataStringAt(testModel, 'profiles', 'operator', 'name')).toBe('Morgan Patel')
    expect(() => dataStringAt(withData({ profiles: 'invalid' }), 'profiles', 'operator', 'name'))
      .toThrow('CONTENT_DATA_INVALID:profiles.operator.name')
    expect(() => dataStringAt(withData({ profiles: { operator: 'invalid' } }), 'profiles', 'operator', 'name'))
      .toThrow('CONTENT_DATA_INVALID:profiles.operator.name')
    expect(() => dataStringAt(testModel, 'profiles', 'operator', 'missing'))
      .toThrow('CONTENT_DATA_INVALID:profiles.operator.missing')
  })

  it('maps known API error codes and falls back without exposing arbitrary messages', () => {
    expect(errorMessage(testModel, translate, { code: 'AUTH_REQUIRED', message: 'untrusted' }))
      .toBe('Sign in to continue.')
    expect(errorMessage(testModel, translate, { code: 'UNMAPPED', message: 'private details' }))
      .toBe('The request could not be completed. Try again.')
    expect(errorMessage(testModel, translate, { code: 10, message: 'private details' }))
      .toBe('The request could not be completed. Try again.')
    expect(errorMessage(testModel, translate, null))
      .toBe('The request could not be completed. Try again.')
    expect(errorMessage(testModel, translate, 'raw exception text'))
      .toBe('The request could not be completed. Try again.')
  })
})
