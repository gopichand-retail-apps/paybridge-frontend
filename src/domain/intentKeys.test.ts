import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { createIntentKeyStore, isOutcomeUnknown } from './intentKeys'

function sequentialKeys() {
  let next = 0
  return () => `key-${(next += 1)}`
}

describe('intent key store', () => {
  it('returns the same key for the same intent and payload, however often it is asked', () => {
    const store = createIntentKeyStore(sequentialKeys())

    const first = store.keyFor('intent-1:capture', 'intent-1')

    expect(store.keyFor('intent-1:capture', 'intent-1')).toBe(first)
    expect(store.keyFor('intent-1:capture', 'intent-1')).toBe(first)
  })

  it('replaces the key when the payload changes and never hands back the superseded one', () => {
    const store = createIntentKeyStore(sequentialKeys())

    const original = store.keyFor('intent-1:refund', '2000|Customer request')
    const edited = store.keyFor('intent-1:refund', '2500|Customer request')

    expect(edited).not.toBe(original)
    expect(store.keyFor('intent-1:refund', '2500|Customer request')).toBe(edited)
    expect(store.keyFor('intent-1:refund', '2000|Customer request')).not.toBe(original)
  })

  it('keeps separate intents and separate actions on separate keys', () => {
    const store = createIntentKeyStore(sequentialKeys())

    const keys = new Set([
      store.keyFor('intent-1:capture', 'a'),
      store.keyFor('intent-1:void', 'a'),
      store.keyFor('intent-2:capture', 'a'),
    ])

    expect(keys.size).toBe(3)
  })

  it('forgets a key once the attempt is resolved so the next attempt is a new intent', () => {
    const store = createIntentKeyStore(sequentialKeys())
    const first = store.keyFor('intent-1:reconcile', 'intent-1')

    expect(store.has('intent-1:reconcile')).toBe(true)
    store.discard('intent-1:reconcile')

    expect(store.has('intent-1:reconcile')).toBe(false)
    expect(store.keyFor('intent-1:reconcile', 'intent-1')).not.toBe(first)
  })

  it('discarding an unknown scope is harmless', () => {
    const store = createIntentKeyStore(sequentialKeys())

    expect(() => store.discard('never-used')).not.toThrow()
  })

  it('clears every pending key at once, as sign-out does', () => {
    const store = createIntentKeyStore(sequentialKeys())
    store.keyFor('intent-1:capture', 'a')
    store.keyFor('intent-2:refund', 'b')

    store.clear()

    expect(store.has('intent-1:capture')).toBe(false)
    expect(store.has('intent-2:refund')).toBe(false)
  })

  it('generates real unique keys by default and holds them in memory only', () => {
    const store = createIntentKeyStore()

    const first = store.keyFor('intent-1:capture', 'a')
    const second = store.keyFor('intent-2:capture', 'a')

    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})

describe('outcome classification', () => {
  it('treats a network failure, an abort and a timeout as an unknown outcome', () => {
    expect(isOutcomeUnknown(new TypeError('Failed to fetch'))).toBe(true)
    expect(isOutcomeUnknown(new DOMException('The operation was aborted', 'AbortError'))).toBe(true)
    expect(isOutcomeUnknown(new DOMException('Timed out', 'TimeoutError'))).toBe(true)
  })

  it('treats a server error or an unreadable reply as an unknown outcome', () => {
    expect(isOutcomeUnknown(new ApiError('Server error', 500, 'INTERNAL_ERROR', 'r1'))).toBe(true)
    expect(isOutcomeUnknown(new ApiError('Bad gateway', 502, 'INVALID_RESPONSE', ''))).toBe(true)
    expect(isOutcomeUnknown(new ApiError('Unavailable', 503, 'REQUEST_FAILED', ''))).toBe(true)
  })

  it('treats a client-side rejection as a definite outcome', () => {
    expect(isOutcomeUnknown(new ApiError('Conflict', 409, 'INVALID_PAYMENT_TRANSITION', 'r2'))).toBe(false)
    expect(isOutcomeUnknown(new ApiError('Forbidden', 403, 'ROLE_REQUIRED', 'r3'))).toBe(false)
    expect(isOutcomeUnknown(new ApiError('Not found', 404, 'PAYMENT_NOT_FOUND', 'r4'))).toBe(false)
    expect(isOutcomeUnknown(new ApiError('Slow down', 429, 'RATE_LIMITED', 'r5'))).toBe(false)
  })
})
