import { useCallback, useState } from 'react'
import { createIntentKeyStore, isOutcomeUnknown } from '../domain/intentKeys'

/** What the user is still waiting to hear about, enough to retry it safely without re-entering anything. */
export type AwaitingIntent =
  | { paymentId: string; action: 'authorize' | 'capture' | 'void' | 'reconcile' }
  | { paymentId: string; action: 'refund'; amountMinor: number; reason: string }

export type IntentAttempt = {
  /** Identifies the logical intent, for example `intent-1:capture`. */
  scope: string
  /** Changes whenever the payload changes, which replaces the key. */
  fingerprint: string
  awaiting: AwaitingIntent
}

function without(entries: Record<string, AwaitingIntent>, scope: string): Record<string, AwaitingIntent> {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => key !== scope))
}

/**
 * Runs one write per user-confirmed intent under the stable intent key pattern: one key per intent, reused on every
 * retry, replaced when the payload changes, discarded once the attempt is resolved. Success is never reported before
 * the server confirms; an unknown outcome stays "awaiting confirmation" until a retry resolves it.
 */
export function useIntentAttempts() {
  const [store] = useState(() => createIntentKeyStore())
  const [awaiting, setAwaiting] = useState<Record<string, AwaitingIntent>>({})

  const run = useCallback(async <T,>(attempt: IntentAttempt, send: (key: string) => Promise<T>): Promise<T> => {
    const key = store.keyFor(attempt.scope, attempt.fingerprint)
    try {
      const result = await send(key)
      store.discard(attempt.scope)
      setAwaiting((current) => without(current, attempt.scope))
      return result
    } catch (cause) {
      if (isOutcomeUnknown(cause)) {
        setAwaiting((current) => ({ ...current, [attempt.scope]: attempt.awaiting }))
      } else {
        store.discard(attempt.scope)
        setAwaiting((current) => without(current, attempt.scope))
      }
      throw cause
    }
  }, [store])

  const reset = useCallback(() => {
    store.clear()
    setAwaiting({})
  }, [store])

  const awaitingFor = useCallback(
    (paymentId: string): AwaitingIntent | null =>
      Object.values(awaiting).find((entry) => entry.paymentId === paymentId) ?? null,
    [awaiting],
  )

  return { run, reset, awaitingFor }
}
