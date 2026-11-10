import { useRef, useState, type FormEvent } from 'react'
import { CreditCard, X } from 'lucide-react'
import type { CreateIntentRequest, SimulationOutcome } from '../api'
import { formatMoney, parseMoneyToMinor } from '../domain/money'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useContent } from '../content-context'
import { dataCurrency, dataString } from '../content-schema'

interface NewPaymentDialogProps {
  busy: boolean
  error: string
  onClose: () => void
  onCreate: (request: CreateIntentRequest, idempotencyKey: string) => Promise<void>
}

export function NewPaymentDialog({ busy, error, onClose, onCreate }: NewPaymentDialogProps) {
  const { model, t } = useContent()
  const currency = dataCurrency(model, 'currency.code')
  const currencySymbol = dataString(model, 'currency.symbol')
  const [amount, setAmount] = useState(dataString(model, 'defaultPaymentAmount'))
  const [description, setDescription] = useState(dataString(model, 'defaultPaymentDescription'))
  const [outcome, setOutcome] = useState<SimulationOutcome>('APPROVE')
  const idempotencyKey = useRef(crypto.randomUUID())
  const [validationError, setValidationError] = useState('')
  const dialogRef = useDialogFocus<HTMLElement>()

  function rotateIdempotencyKey(): void {
    idempotencyKey.current = crypto.randomUUID()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountMinor = parseMoneyToMinor(amount, model.locale)
    if (!amountMinor) {
      setValidationError(t('payment.invalidAmount', {
        minimum: formatMoney(1, currency, model.locale),
        maximum: formatMoney(100_000_000, currency, model.locale),
      }))
      return
    }
    if (description.trim().length < 3) {
      setValidationError(t('payment.invalidDescription'))
      return
    }
    setValidationError('')
    void onCreate({
      amountMinor,
      currency,
      description: description.trim(),
      simulationOutcome: outcome,
    }, idempotencyKey.current)
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        aria-labelledby="new-payment-title"
        aria-modal="true"
        className="modal-card create-payment-dialog"
        ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose()
        }}
        role="dialog"
      >
        <div className="modal-topline">
          <span className="eyebrow">{t('payment.newIntentEyebrow')}</span>
          <button aria-label={t('payment.closeDialog')} className="icon-button" disabled={busy} onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <h2 id="new-payment-title">{t('payment.createTitle')}</h2>
        <p className="modal-intro">{t('payment.createDescription')}</p>

        <form className="payment-form" onSubmit={submit}>
          <label>
            <span>{t('payment.description')}</span>
            <input
              autoFocus
              maxLength={160}
              onChange={(event) => {
                setDescription(event.target.value)
                rotateIdempotencyKey()
              }}
              required
              value={description}
            />
          </label>
          <label>
            <span>{t('payment.amount', { currency })}</span>
            <span className="amount-input-wrap">
              <span aria-hidden="true">{currencySymbol}</span>
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setAmount(event.target.value)
                  rotateIdempotencyKey()
                }}
                required
                value={amount}
              />
            </span>
          </label>

          <fieldset className="simulation-choice">
            <legend>{t('payment.processorOutcome')}</legend>
            <div className="segmented-control">
              <button
                aria-pressed={outcome === 'APPROVE'}
                className={outcome === 'APPROVE' ? 'segment is-selected' : 'segment'}
                onClick={() => {
                  setOutcome('APPROVE')
                  rotateIdempotencyKey()
                }}
                type="button"
              >
                <span className="scenario-dot scenario-approved" /> {t('payment.approved')}
              </button>
              <button
                aria-pressed={outcome === 'DECLINE'}
                className={outcome === 'DECLINE' ? 'segment is-selected' : 'segment'}
                onClick={() => {
                  setOutcome('DECLINE')
                  rotateIdempotencyKey()
                }}
                type="button"
              >
                <span className="scenario-dot scenario-declined" /> {t('payment.declined')}
              </button>
            </div>
          </fieldset>

          {(validationError || error) && (
            <p className="form-error" role="alert">{validationError || error}</p>
          )}
          <div className="sandbox-notice">
            <CreditCard aria-hidden="true" size={16} />
            <span>{t('payment.sandboxNotice')}</span>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">{t('payment.cancel')}</button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? t('payment.creating') : t('payment.createIntent')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}