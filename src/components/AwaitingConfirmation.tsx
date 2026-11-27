import { LoaderCircle } from 'lucide-react'
import { useContent } from '../content-context'
import { dataCurrency } from '../content-schema'
import { formatMoney } from '../domain/money'
import type { AwaitingIntent } from '../hooks/useIntentAttempts'

interface AwaitingConfirmationProps {
  awaiting: AwaitingIntent
  busy: boolean
  onRetry: () => Promise<unknown>
}

/**
 * Shown when a write may or may not have taken effect. Retrying reuses the original idempotency key, so the server
 * either replays the original result or rejects it; it can never apply the write twice.
 */
export function AwaitingConfirmation({ awaiting, busy, onRetry }: AwaitingConfirmationProps) {
  const { model, t } = useContent()
  const currency = dataCurrency(model, 'currency.code')
  const body = awaiting.action === 'refund'
    ? t('details.awaiting.refundBody', { amount: formatMoney(awaiting.amountMinor, currency, model.locale) })
    : t('details.awaiting.body', { action: t(`details.awaiting.action.${awaiting.action}`) })

  return (
    <div aria-live="polite" className="awaiting-note">
      <strong>{t('details.awaiting.title')}</strong>
      <p>{body}</p>
      <button className="secondary-button" disabled={busy} onClick={() => void onRetry()} type="button">
        {busy
          ? <><LoaderCircle aria-hidden="true" className="spin" size={16} /> {t('details.awaiting.retrying')}</>
          : t('details.awaiting.retry')}
      </button>
    </div>
  )
}
