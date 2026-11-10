import { ClipboardList, Radio, Scale } from 'lucide-react'
import type { AuditEvent, Reconciliation, WebhookEvent } from '../api'
import { formatDate, formatMoney, formatReference } from '../domain/money'
import { useContent } from '../content-context'
import { dataString, dataStringFrom } from '../content-schema'
import { StatusBadge } from './StatusBadge'

export function WebhookEventsTable({ events }: { events: WebhookEvent[] }) {
  const { model, t } = useContent()
  const currency = dataString(model, 'currency.code')
  if (events.length === 0) {
    return <EmptyState icon={<Radio aria-hidden="true" size={23} />} title={t('operations.webhooks.empty')} />
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('operations.column.event')}</th>
            <th scope="col">{t('operations.column.type')}</th>
            <th scope="col">{t('operations.column.intent')}</th>
            <th scope="col">{t('operations.column.amount')}</th>
            <th scope="col">{t('operations.column.signature')}</th>
            <th scope="col">{t('operations.column.received')}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.eventId}>
              <td className="mono-cell">{formatReference(event.eventId, 'EVT')}</td>
              <td><span className="event-type">{dataStringFrom(model, 'eventTypes', event.eventType)}</span></td>
              <td className="mono-cell">{formatReference(event.paymentIntentId, 'PI')}</td>
              <td className="amount-cell">{formatMoney(event.amountMinor, currency, model.locale)}</td>
              <td>
                <span className="verified-state">
                  <i aria-hidden="true" /> {t(event.signatureVerified ? 'operations.signatureVerified' : 'operations.signatureRejected')}
                </span>
              </td>
              <td className="date-cell">{formatDate(event.receivedAt, model.locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReconciliationTable({ rows }: { rows: Reconciliation[] }) {
  const { model, t } = useContent()
  const currency = dataString(model, 'currency.code')
  if (rows.length === 0) {
    return <EmptyState icon={<Scale aria-hidden="true" size={23} />} title={t('operations.reconciliation.empty')} />
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('operations.column.intent')}</th>
            <th scope="col">{t('operations.column.captureExpected')}</th>
            <th scope="col">{t('operations.column.webhookObserved')}</th>
            <th scope="col">{t('operations.column.refundsExpected')}</th>
            <th scope="col">{t('operations.column.result')}</th>
            <th scope="col">{t('operations.column.runTime')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="mono-cell">{formatReference(row.paymentIntentId, 'PI')}</td>
              <td className="amount-cell">{formatMoney(row.expectedCapturedMinor, currency, model.locale)}</td>
              <td className="amount-cell">{formatMoney(row.observedCapturedMinor, currency, model.locale)}</td>
              <td className="amount-cell">{formatMoney(row.expectedRefundedMinor, currency, model.locale)}</td>
              <td><StatusBadge status={row.result} /></td>
              <td className="date-cell">{formatDate(row.reconciledAt, model.locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AuditEventsTable({ events }: { events: AuditEvent[] }) {
  const { model, t } = useContent()
  if (events.length === 0) {
    return <EmptyState icon={<ClipboardList aria-hidden="true" size={23} />} title={t('operations.audit.empty')} />
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t('operations.column.event')}</th>
            <th scope="col">{t('operations.column.actor')}</th>
            <th scope="col">{t('operations.column.resource')}</th>
            <th scope="col">{t('operations.column.merchant')}</th>
            <th scope="col">{t('operations.column.time')}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td><span className="audit-event-name">{dataStringFrom(model, 'auditEvents', event.eventName)}</span></td>
              <td className="mono-cell">{dataStringFrom(model, 'userNames', event.actorId)}</td>
              <td className="mono-cell">{dataStringFrom(model, 'entityTypes', event.entityType)} · {formatReference(event.entityId, 'REF')}</td>
              <td className="muted-copy">{event.merchantId
                ? dataStringFrom(model, 'merchantNames', event.merchantId)
                : t('operations.platform')}</td>
              <td className="date-cell">{formatDate(event.createdAt, model.locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PaymentStatusLegend() {
  const { t } = useContent()
  return (
    <div className="status-legend" aria-label={t('operations.statusLegend')}>
      <StatusBadge status="CREATED" />
      <StatusBadge status="AUTHORIZED" />
      <StatusBadge status="CAPTURED" />
      <StatusBadge status="DECLINED" />
    </div>
  )
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  const { t } = useContent()
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{t('operations.emptyDescription')}</span>
    </div>
  )
}