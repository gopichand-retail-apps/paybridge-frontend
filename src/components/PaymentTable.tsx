import { ArrowUpRight, CircleDashed } from 'lucide-react'
import type { PaymentIntent } from '../api'
import { formatDate, formatMoney, formatReference } from '../domain/money'
import { useContent } from '../content-context'
import { dataStringFrom, dataStringOr } from '../content-schema'
import { StatusBadge } from './StatusBadge'

interface PaymentTableProps {
  payments: PaymentIntent[]
  onSelect: (payment: PaymentIntent) => void
}

export function PaymentTable({ payments, onSelect }: PaymentTableProps) {
  const { model, t } = useContent()
  const numberFormat = new Intl.NumberFormat(model.locale)
  if (payments.length === 0) {
    return (
      <div className="empty-state">
        <CircleDashed aria-hidden="true" size={25} />
        <strong>{t('payments.emptyTitle')}</strong>
        <span>{t('payments.emptyDescription')}</span>
      </div>
    )
  }

  return (
    <div className="table-scroll">
      <table className="data-table payment-table">
        <thead>
          <tr>
            <th scope="col">{t('payments.column.payment')}</th>
            <th scope="col">{t('payments.column.merchant')}</th>
            <th scope="col">{t('payments.column.amount')}</th>
            <th scope="col">{t('payments.column.status')}</th>
            <th scope="col">{t('payments.column.webhook')}</th>
            <th scope="col">{t('payments.column.created')}</th>
            <th scope="col"><span className="sr-only">{t('payments.column.open')}</span></th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                <button className="payment-cell-button" onClick={() => onSelect(payment)} type="button">
                  <strong>{dataStringOr(model, 'paymentDescriptions', payment.id, payment.description)}</strong>
                  <span>{formatReference(payment.id, 'PI')}</span>
                </button>
              </td>
              <td className="merchant-cell">{dataStringFrom(model, 'merchantNames', payment.merchantId)}</td>
              <td className="amount-cell">{formatMoney(payment.amountMinor, payment.currency, model.locale)}</td>
              <td><StatusBadge status={payment.status} /></td>
              <td>
                {payment.webhookEventCount > 0
                    ? <span className="webhook-count">{t('payments.webhooksReceived', { count: numberFormat.format(payment.webhookEventCount) })}</span>
                    : <span className="muted-copy">{t('payments.waiting')}</span>}
              </td>
                  <td className="date-cell">{formatDate(payment.createdAt, model.locale)}</td>
              <td>
                <button
                  aria-label={t('payments.openDescription', {
                    description: dataStringOr(model, 'paymentDescriptions', payment.id, payment.description),
                  })}
                  className="row-open-button"
                  onClick={() => onSelect(payment)}
                  type="button"
                >
                  <ArrowUpRight aria-hidden="true" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}