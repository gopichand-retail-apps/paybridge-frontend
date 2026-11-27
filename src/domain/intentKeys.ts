import { ApiError } from '../api'

/**
 * One idempotency key per payment intent (stable intent key pattern).
 *
 * The key is created when the user confirms an intent, reused for every retry of that intent, replaced when the
 * payload changes, and forgotten once the attempt is resolved or the user signs out. It lives in memory only:
 * nothing is written to browser storage, so a shared terminal cannot leak a pending intent (decision D-11).
 */
export interface IntentKeyStore {
  /** Key for `scope`; reused while `fingerprint` is unchanged, replaced when it changes. */
  keyFor(scope: string, fingerprint: string): string
  has(scope: string): boolean
  /** The attempt is resolved (confirmed or definitely rejected): the next attempt is a new intent. */
  discard(scope: string): void
  /** Forget every pending intent, as sign-out does. */
  clear(): void
}

type PendingKey = { fingerprint: string; key: string }

export function createIntentKeyStore(newKey: () => string = () => crypto.randomUUID()): IntentKeyStore {
  const pending = new Map<string, PendingKey>()

  return {
    keyFor(scope, fingerprint) {
      const current = pending.get(scope)
      if (current?.fingerprint === fingerprint) return current.key
      const next = { fingerprint, key: newKey() }
      pending.set(scope, next)
      return next.key
    },
    has: (scope) => pending.has(scope),
    discard: (scope) => {
      pending.delete(scope)
    },
    clear: () => pending.clear(),
  }
}

/**
 * True when the request may or may not have taken effect: no reply arrived (network failure, abort, timeout), or the
 * reply was a server error or could not be read. The key must be kept and the retry must reuse it. A 4xx reply is a
 * definite answer, so the attempt is resolved.
 */
export function isOutcomeUnknown(cause: unknown): boolean {
  if (cause instanceof ApiError) return cause.status >= 500
  return true
}
