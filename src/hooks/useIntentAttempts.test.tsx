import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { useIntentAttempts, type IntentAttempt } from './useIntentAttempts'

const capture: IntentAttempt = {
  scope: 'intent-1:capture',
  fingerprint: 'intent-1',
  awaiting: { paymentId: 'intent-1', action: 'capture' },
}

describe('useIntentAttempts', () => {
  it('sends with a fresh key, resolves the attempt on success and starts the next one on a new key', async () => {
    const { result } = renderHook(() => useIntentAttempts())
    const send = vi.fn().mockResolvedValue('done')

    await act(async () => {
      await expect(result.current.run(capture, send)).resolves.toBe('done')
      await result.current.run(capture, send)
    })

    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]?.[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(send.mock.calls[1]?.[0]).not.toBe(send.mock.calls[0]?.[0])
    expect(result.current.awaitingFor('intent-1')).toBeNull()
  })

  it('marks an unknown outcome as awaiting confirmation and reuses the same key for the retry', async () => {
    const { result } = renderHook(() => useIntentAttempts())
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce('confirmed')

    await act(async () => {
      await expect(result.current.run(capture, send)).rejects.toThrow('Failed to fetch')
    })
    expect(result.current.awaitingFor('intent-1')).toEqual(capture.awaiting)
    expect(result.current.awaitingFor('another-intent')).toBeNull()

    await act(async () => {
      await result.current.run(capture, send)
    })

    expect(send.mock.calls[1]?.[0]).toBe(send.mock.calls[0]?.[0])
    expect(result.current.awaitingFor('intent-1')).toBeNull()
  })

  it('treats a server error as unknown and keeps the key', async () => {
    const { result } = renderHook(() => useIntentAttempts())
    const send = vi.fn()
      .mockRejectedValueOnce(new ApiError('Unavailable', 503, 'REQUEST_FAILED', ''))
      .mockResolvedValueOnce('confirmed')

    await act(async () => {
      await expect(result.current.run(capture, send)).rejects.toBeInstanceOf(ApiError)
      await result.current.run(capture, send)
    })

    expect(send.mock.calls[1]?.[0]).toBe(send.mock.calls[0]?.[0])
  })

  it('resolves the attempt when the server definitely rejects it, so the next try is a new intent', async () => {
    const { result } = renderHook(() => useIntentAttempts())
    const send = vi.fn()
      .mockRejectedValueOnce(new ApiError('Conflict', 409, 'INVALID_PAYMENT_TRANSITION', 'r1'))
      .mockResolvedValueOnce('done')

    await act(async () => {
      await expect(result.current.run(capture, send)).rejects.toBeInstanceOf(ApiError)
    })
    expect(result.current.awaitingFor('intent-1')).toBeNull()

    await act(async () => {
      await result.current.run(capture, send)
    })
    expect(send.mock.calls[1]?.[0]).not.toBe(send.mock.calls[0]?.[0])
  })

  it('clears a pending retry when the retry itself is definitely rejected', async () => {
    const { result } = renderHook(() => useIntentAttempts())
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError('Conflict', 409, 'PAYMENT_STATE_CONFLICT', 'r2'))

    await act(async () => {
      await expect(result.current.run(capture, send)).rejects.toThrow()
      await expect(result.current.run(capture, send)).rejects.toBeInstanceOf(ApiError)
    })

    expect(result.current.awaitingFor('intent-1')).toBeNull()
  })

  it('replaces the key when the payload changes while an attempt is pending', async () => {
    const { result } = renderHook(() => useIntentAttempts())
    const refund = (amountMinor: number): IntentAttempt => ({
      scope: 'intent-1:refund',
      fingerprint: `${amountMinor}|Customer request`,
      awaiting: { paymentId: 'intent-1', action: 'refund', amountMinor, reason: 'Customer request' },
    })
    const send = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await act(async () => {
      await expect(result.current.run(refund(2000), send)).rejects.toThrow()
      await expect(result.current.run(refund(2000), send)).rejects.toThrow()
      await expect(result.current.run(refund(2500), send)).rejects.toThrow()
    })

    expect(send.mock.calls[1]?.[0]).toBe(send.mock.calls[0]?.[0])
    expect(send.mock.calls[2]?.[0]).not.toBe(send.mock.calls[0]?.[0])
    expect(result.current.awaitingFor('intent-1')).toMatchObject({ amountMinor: 2500 })
  })

  it('forgets every key and pending notice on reset, as sign-out does', async () => {
    const { result } = renderHook(() => useIntentAttempts())
    const send = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await act(async () => {
      await expect(result.current.run(capture, send)).rejects.toThrow()
    })
    act(() => result.current.reset())
    await act(async () => {
      await expect(result.current.run(capture, send)).rejects.toThrow()
    })

    expect(send.mock.calls[1]?.[0]).not.toBe(send.mock.calls[0]?.[0])
  })
})
