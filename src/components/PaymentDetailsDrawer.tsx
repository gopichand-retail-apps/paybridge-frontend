import { useState, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  CircleDollarSign,
  FileCheck2,
  LoaderCircle,
  X,
} from 'lucide-react'
import type {
  SessionUser,
  PaymentIntent,
  Reconciliation,
  WebhookEvent,
} from '../api'
import { formatDate, formatMoney, formatReference, parseMoneyToMinor } from '../domain/money'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useContent } from '../content-context'
import { dataString, dataStringFrom, dataStringOr, errorMessage } from '../content-schema'
import { StatusBadge } from './StatusBadge'

export type PaymentAction = 'authorize' | 'capture' | 'void' | 'deliver' | 'reconcile'

interface PaymentDetailsDrawerProps {
  intent: PaymentIntent
  user: SessionUser
  events: WebhookEvent[]
  reconciliations: Reconciliation[]
  busyAction: PaymentAction | 'refund' | null
  error: string
  onClose: () => void
  onAction: (action: PaymentAction) => Promise<void>
  onRefund: (amountMinor: number, reason: string, idempotencyKey: string) => Promise<void>
}

export function PaymentDetailsDrawer({
  intent,
  user,
  events,
  reconciliations,
  busyAction,
  error,
  onClose,
  onAction,
  onRefund,
}: PaymentDetailsDrawerProps) {
  const { model, t } = useContent()
  const currencySymbol = dataString(model, 'currency.symbol')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState(dataString(model, 'defaultRefundReason'))
  const [refundKey, setRefundKey] = useState(() => crypto.randomUUID())
  const [refundError, setRefundError] = useState('')
  const dialogRef = useDialogFocus<HTMLElement>()
  const isOperator = user.role === 'OPERATOR'
  const canMutate = user.role !== 'AUDITOR'
  const isCaptured = intent.capturedAmountMinor > 0
  const remainingRefundMinor = intent.capturedAmountMinor - intent.refundedAmountMinor
  const paymentEvents = events.filter((event) => event.paymentIntentId === intent.id)
  const paymentReconciliations = reconciliations.filter((row) => row.paymentIntentId === intent.id)

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountMinor = parseMoneyToMinor(refundAmount, model.locale)
    if (!amountMinor || amountMinor > remainingRefundMinor) {
      setRefundError(t('details.refundInvalidAmount', {
        amount: formatMoney(remainingRefundMinor, intent.currency, model.locale),
      }))
      return
    }
    if (refundReason.trim().length < 4) {
      setRefundError(t('details.refundInvalidReason'))
      return
    }

    setRefundError('')
    try {
      await onRefund(amountMinor, refundReason.trim(), refundKey)
      setRefundAmount('')
      setRefundKey(crypto.randomUUID())
    } catch (cause) {
      setRefundError(errorMessage(model, t, cause))
    }
  }

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyAction) onClose()
      }}
    >
      <aside
        aria-labelledby="payment-details-title"
        aria-modal="true"
        className="payment-drawer"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busyAction) onClose()
        }}
        ref={dialogRef}
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <span className="eyebrow">{t('details.eyebrow')}</span>
            <p className="drawer-id">{formatReference(intent.id, 'PI')}</p>
          </div>
          <button aria-label={t('details.close')} className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="drawer-scroll">
          <section className="drawer-payment-heading">
            <div>
              <h2 id="payment-details-title">{dataStringOr(model, 'paymentDescriptions', intent.id, intent.description)}</h2>
              <p>{dataStringFrom(model, 'merchantNames', intent.merchantId)}</p>
            </div>
            <StatusBadge status={intent.status} />
          </section>

          <section className="amount-overview" aria-label={t('details.amountLabel')}>
            <span>{t('details.intentAmount')}</span>
            <strong>{formatMoney(intent.amountMinor, intent.currency, model.locale)}</strong>
            <div className="amount-subline">
              <span>{t('details.captured', { amount: formatMoney(intent.capturedAmountMinor, intent.currency, model.locale) })}</span>
              <span>{t('details.refunded', { amount: formatMoney(intent.refundedAmountMinor, intent.currency, model.locale) })}</span>
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-title-row">
              <h3>{t('details.workflow')}</h3>
              <span className="simulation-label">{t('details.simulation', {
                outcome: t(intent.simulationOutcome === 'APPROVE' ? 'payment.approved' : 'payment.declined').toLowerCase(),
              })}</span>
            </div>
            <div className="workflow-timeline">
              <TimelineRow title={t('details.intentCreated')} time={intent.createdAt} done />
              <TimelineRow
                title={t(intent.status === 'DECLINED' ? 'details.authorizationDeclined' : 'details.authorization')}
                time={intent.authorizedAt}
                done={Boolean(intent.authorizedAt) || intent.status === 'DECLINED'}
              />
              <TimelineRow title={t('details.capture')} time={intent.capturedAt} done={Boolean(intent.capturedAt)} />
              <TimelineRow
                title={t('details.webhook')}
                time={paymentEvents[0]?.receivedAt ?? null}
                done={paymentEvents.length > 0}
              />
              <TimelineRow
                title={t('details.reconciliation')}
                time={paymentReconciliations[0]?.reconciledAt ?? null}
                done={paymentReconciliations.length > 0}
              />
            </div>
          </section>

          <section className="drawer-section action-section">
            <div className="section-title-row">
              <h3>{t('details.actions')}</h3>
              <span className="role-note">{t(`role.${user.role}`).toLowerCase()}</span>
            </div>
            {intent.status === 'CREATED' && canMutate && (
              <ActionButton
                busy={busyAction === 'authorize'}
                disabled={busyAction !== null}
                icon={<BadgeCheck aria-hidden="true" size={17} />}
                label={t('details.action.authorize')}
                onClick={() => void onAction('authorize')}
                primary
              />
            )}
            {intent.status === 'AUTHORIZED' && canMutate && (
              <div className="action-grid">
                <ActionButton
                  busy={busyAction === 'capture'}
                  disabled={busyAction !== null}
                  icon={<ArrowDownToLine aria-hidden="true" size={17} />}
                  label={t('details.action.capture')}
                  onClick={() => void onAction('capture')}
                  primary
                />
                {isOperator && (
                  <ActionButton
                    busy={busyAction === 'void'}
                    disabled={busyAction !== null}
                    icon={<Ban aria-hidden="true" size={17} />}
                    label={t('details.action.void')}
                    onClick={() => void onAction('void')}
                  />
                )}
              </div>
            )}
            {isCaptured && canMutate && (
              <ActionButton
                busy={busyAction === 'deliver'}
                disabled={busyAction !== null}
                icon={<ArrowUpRight aria-hidden="true" size={17} />}
                label={t('details.action.deliver')}
                onClick={() => void onAction('deliver')}
              />
            )}
            {isOperator && isCaptured && (
              <ActionButton
                busy={busyAction === 'reconcile'}
                disabled={busyAction !== null}
                icon={<FileCheck2 aria-hidden="true" size={17} />}
                label={t('details.action.reconcile')}
                onClick={() => void onAction('reconcile')}
              />
            )}

            {isOperator && remainingRefundMinor > 0 && isCaptured && (
              <form className="refund-form" onSubmit={(event) => void submitRefund(event)}>
                <h4>{t('details.refundTitle')}</h4>
                <label>
                  <span>{t('details.refundAmount', { amount: formatMoney(remainingRefundMinor, intent.currency, model.locale) })}</span>
                  <span className="amount-input-wrap">
                    <span aria-hidden="true">{currencySymbol}</span>
                    <input
                      inputMode="decimal"
                      onChange={(event) => {
                        setRefundAmount(event.target.value)
                        setRefundKey(crypto.randomUUID())
                      }}
                      placeholder={t('details.refundPlaceholder')}
                      value={refundAmount}
                    />
                  </span>
                </label>
                <label>
                  <span>{t('details.refundReason')}</span>
                  <input
                    maxLength={160}
                    onChange={(event) => {
                      setRefundReason(event.target.value)
                      setRefundKey(crypto.randomUUID())
                    }}
                    value={refundReason}
                  />
                </label>
                {(refundError || error) && <p className="form-error" role="alert">{refundError || error}</p>}
                <button className="secondary-button refund-submit" disabled={busyAction !== null} type="submit">
                  {busyAction === 'refund'
                    ? <><LoaderCircle className="spin" aria-hidden="true" size={16} /> {t('details.recording')}</>
                      : <><CircleDollarSign aria-hidden="true" size={16} /> {t('details.recordRefund')}</>}
                </button>
                  <p className="sandbox-notice">{t('details.refundSafety')}</p>
              </form>
            )}
            {error && !isOperator && <p className="form-error" role="alert">{error}</p>}
            {user.role === 'AUDITOR' && (
              <p className="permission-note">{t('details.auditorReadOnly')}</p>
            )}
            {busyAction && busyAction !== 'refund' && (
              <p className="working-note"><LoaderCircle className="spin" aria-hidden="true" size={15} /> {t('details.working')}</p>
            )}
          </section>

          <section className="drawer-section detail-list">
            <h3>{t('details.intentDetails')}</h3>
            <div><span>{t('details.currency')}</span><strong>{intent.currency}</strong></div>
            <div><span>{t('details.created')}</span><strong>{formatDate(intent.createdAt, model.locale)}</strong></div>
            <div><span>{t('details.lastUpdated')}</span><strong>{formatDate(intent.updatedAt, model.locale)}</strong></div>
            <div><span>{t('details.webhookCount')}</span><strong>{intent.webhookEventCount}</strong></div>
            <div><span>{t('details.latestReconciliation')}</span><strong>{intent.latestReconciliationResult
              ? t(`status.${intent.latestReconciliationResult}`)
              : t('details.notRun')}</strong></div>
          </section>
          <p className="drawer-safety-note">{t('details.safety')}</p>
        </div>
      </aside>
    </div>
  )
}

function TimelineRow({ title, time, done }: { title: string; time: string | null; done: boolean }) {
  const { model, t } = useContent()
  return (
    <div className={done ? 'timeline-row is-done' : 'timeline-row'}>
      <span className="timeline-mark" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{time ? formatDate(time, model.locale) : t('details.pending')}</span>
      </div>
    </div>
  )
}

function ActionButton({
  busy,
  disabled,
  icon,
  label,
  onClick,
  primary = false,
}: {
  busy: boolean
  disabled: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
}) {
  const { t } = useContent()
  return (
    <button
      className={primary ? 'primary-button action-button' : 'secondary-button action-button'}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {busy ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : icon}
      <span>{busy ? t('details.working') : label}</span>
    </button>
  )
}