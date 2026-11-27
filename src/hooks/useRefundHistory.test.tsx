import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, type RefundHistory } from '../api'
import { useRefundHistory } from './useRefundHistory'

afterEach(() => {
  vi.restoreAllMocks()
})

function historyFor(paymentIntentId: string, refundedAmountMinor = 0): RefundHistory {
  return {
    paymentIntentId,
    currency: 'USD',
    capturedAmountMinor: 10000,
    refundedAmountMinor,
    remainingRefundableMinor: 10000 - refundedAmountMinor,
    refunds: [],
  }
}

describe('useRefundHistory', () => {
  it('loads the history of an enabled payment from the API', async () => {
    const spy = vi.spyOn(api, 'refundHistory').mockResolvedValue(historyFor('intent-1'))

    const { result } = renderHook(() => useRefundHistory('intent-1', 0, true))

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(spy).toHaveBeenCalledWith('intent-1')
  })

  it('does not call the API when there is nothing to show', () => {
    const spy = vi.spyOn(api, 'refundHistory').mockResolvedValue(historyFor('intent-1'))

    renderHook(() => useRefundHistory('intent-1', 0, false))
    renderHook(() => useRefundHistory(null, 0, true))

    expect(spy).not.toHaveBeenCalled()
  })

  it('reports a failure and recovers on reload without losing the page', async () => {
    const spy = vi.spyOn(api, 'refundHistory')
      .mockRejectedValueOnce(new ApiError('Unavailable', 503, 'REQUEST_FAILED', ''))
      .mockResolvedValueOnce(historyFor('intent-1'))

    const { result } = renderHook(() => useRefundHistory('intent-1', 0, true))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }))

    act(() => result.current.reload())

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('reloads when the refunded total changes, for example after a confirmed refund', async () => {
    const spy = vi.spyOn(api, 'refundHistory')
      .mockResolvedValueOnce(historyFor('intent-1', 0))
      .mockResolvedValueOnce(historyFor('intent-1', 2000))

    const { result, rerender } = renderHook(
      ({ refunded }) => useRefundHistory('intent-1', refunded, true),
      { initialProps: { refunded: 0 } },
    )
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    rerender({ refunded: 2000 })

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'ready', history: { refundedAmountMinor: 2000 } })
    })
  })

  it('ignores a slow reply for a payment that is no longer selected', async () => {
    let resolveFirst: (value: RefundHistory) => void = () => undefined
    vi.spyOn(api, 'refundHistory').mockImplementation((id: string) => id === 'intent-1'
      ? new Promise<RefundHistory>((resolve) => { resolveFirst = resolve })
      : Promise.resolve(historyFor('intent-2')))

    const { result, rerender } = renderHook(
      ({ id }) => useRefundHistory(id, 0, true),
      { initialProps: { id: 'intent-1' } },
    )
    rerender({ id: 'intent-2' })
    await waitFor(() => expect(result.current.state).toMatchObject({
      status: 'ready',
      history: { paymentIntentId: 'intent-2' },
    }))

    await act(async () => resolveFirst(historyFor('intent-1')))

    expect(result.current.state).toMatchObject({ status: 'ready', history: { paymentIntentId: 'intent-2' } })
  })
})
