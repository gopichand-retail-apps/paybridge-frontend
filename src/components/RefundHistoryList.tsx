import { LoaderCircle } from 'lucide-react'
import type { Refund } from '../api'
import { useContent } from '../content-context'
import { dataCurrency } from '../content-schema'
import { formatDate, formatMoney, formatReference } from '../domain/money'
import type { RefundHistoryState } from '../hooks/useRefundHistory'

interface RefundHistoryListProps {
  /** Taken from the payment itself, so it is shown even while the list loads or fails. */
  remainingRefundableMinor: number
  state: RefundHistoryState
  onRetry: () => void
}

export function RefundHistoryList({ remainingRefundableMinor, state, onRetry }: RefundHistoryListProps) {
  const { model, t } = useContent()
  const currency = dataCurrency(model, 'currency.code')

  return (
    <section aria-labelledby="refund-history-title" className="drawer-section refund-history">
      <div className="section-title-row">
        <h3 id="refund-history-title">{t('details.refunds.title')}</h3>
        <span className="refund-remaining">
          {t('details.refunds.remaining', { amount: formatMoney(remainingRefundableMinor, currency, model.locale) })}
        </span>
      </div>
      {state.status === 'loading' && (
        <p aria-live="polite" className="working-note">
          <LoaderCircle aria-hidden="true" className="spin" size={15} /> {t('details.refunds.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <div aria-live="polite" className="refund-history-error">
          <p>{t('details.refunds.error')}</p>
          <button className="secondary-button" onClick={onRetry} type="button">
            {t('details.refunds.retry')}
          </button>
        </div>
      )}
      {state.status === 'ready' && state.history.refunds.length === 0 && (
        <p className="refund-history-empty">{t('details.refunds.empty')}</p>
      )}
      {state.status === 'ready' && state.history.refunds.length > 0 && (
        <ol aria-label={t('details.refunds.listLabel')} className="refund-list">
          {state.history.refunds.map((refund) => <RefundRow key={refund.id} refund={refund} />)}
        </ol>
      )}
    </section>
  )
}

function RefundRow({ refund }: { refund: Refund }) {
  const { model, t } = useContent()
  const money = (amountMinor: number) => formatMoney(amountMinor, refund.currency, model.locale)

  return (
    <li className="refund-row">
      <div className="refund-row-head">
        <strong>{t('details.refunds.reference', { reference: formatReference(refund.id, 'RF') })}</strong>
        <span>{t('details.refunds.amountWithCurrency', {
          amount: money(refund.amountMinor),
          currency: refund.currency,
        })}</span>
      </div>
      <p className="refund-row-reason">{refund.reason}</p>
      <p className="refund-row-meta">
        <span>
          {refund.actorName === null
            ? t('details.refunds.actorUnknown')
            : t('details.refunds.recordedBy', { actor: refund.actorName })}
        </span>
        <span>{formatDate(refund.createdAt, model.locale)}</span>
      </p>
      <p className="refund-row-meta">
        {refund.remainingAfterMinor === null
          ? t('details.refunds.remainingAfterUnknown')
          : t('details.refunds.remainingAfter', { amount: money(refund.remainingAfterMinor) })}
      </p>
    </li>
  )
}
