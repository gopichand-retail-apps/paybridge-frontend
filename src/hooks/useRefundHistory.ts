import { useCallback, useEffect, useState } from 'react'
import { api, type RefundHistory } from '../api'

export type RefundHistoryState =
  | { status: 'loading' }
  | { status: 'ready'; history: RefundHistory }
  | { status: 'error' }

type Settled = { requestKey: string; outcome: RefundHistory | 'error' }

/**
 * Loads the server's refund history for one payment. It reloads when the payment changes, when its refunded total
 * changes (a refund was confirmed, here or elsewhere) and on demand. The state is derived from the request key, so a
 * reply that belongs to a different payment or an older request is never shown as current.
 */
export function useRefundHistory(paymentId: string | null, refundedAmountMinor: number, enabled: boolean) {
  const [reloads, setReloads] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)
  const requestKey = `${paymentId}|${refundedAmountMinor}|${reloads}`

  useEffect(() => {
    if (!enabled || paymentId === null) return
    let current = true
    api.refundHistory(paymentId)
      .then((history) => {
        if (current) setSettled({ requestKey, outcome: history })
      })
      .catch(() => {
        if (current) setSettled({ requestKey, outcome: 'error' })
      })
    return () => {
      current = false
    }
  }, [enabled, paymentId, requestKey])

  const reload = useCallback(() => setReloads((count) => count + 1), [])
  const state: RefundHistoryState = settled?.requestKey !== requestKey
    ? { status: 'loading' }
    : settled.outcome === 'error'
      ? { status: 'error' }
      : { status: 'ready', history: settled.outcome }
  return { state, reload }
}
