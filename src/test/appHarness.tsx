import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { api, type PaymentIntent, type RefundHistory, type SessionUser } from '../api'
import App from '../App'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ContentProvider } from '../content'
import paybridgeModel from '../../public/paybridge-model.json'
import { merchantUser, overview, paymentIntent } from './fixtures'

export function emptyRefundHistory(intent: PaymentIntent): RefundHistory {
  return {
    paymentIntentId: intent.id,
    currency: 'USD',
    capturedAmountMinor: intent.capturedAmountMinor,
    refundedAmountMinor: intent.refundedAmountMinor,
    remainingRefundableMinor: intent.capturedAmountMinor - intent.refundedAmountMinor,
    refunds: [],
  }
}

export function mockWorkspace(payments: PaymentIntent[] = [paymentIntent()], overviewData = overview) {
  return {
    overview: vi.spyOn(api, 'overview').mockResolvedValue(overviewData),
    payments: vi.spyOn(api, 'payments').mockResolvedValue({ paymentIntents: payments }),
    webhooks: vi.spyOn(api, 'webhooks').mockResolvedValue({ webhookEvents: [] }),
    reconciliations: vi.spyOn(api, 'reconciliations').mockResolvedValue({ reconciliations: [] }),
    auditEvents: vi.spyOn(api, 'auditEvents').mockResolvedValue({ auditEvents: [] }),
    refundHistory: vi.spyOn(api, 'refundHistory').mockImplementation(async (id: string) => {
      const known = payments.find((payment) => payment.id === id) ?? paymentIntent({ id })
      return emptyRefundHistory(known)
    }),
  }
}

export function renderApp() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(paybridgeModel), { status: 200 }),
  ))
  return render(
    <ContentProvider appId="paybridge" modelUrl="/paybridge-model.json">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ContentProvider>,
  )
}

export function renderLoggedIn(
  user: SessionUser = merchantUser,
  payments: PaymentIntent[] = [paymentIntent()],
  overviewData = overview,
) {
  vi.spyOn(api, 'csrf').mockResolvedValue(undefined)
  vi.spyOn(api, 'currentUser').mockResolvedValue({ user, localProfileSession: true })
  vi.spyOn(api, 'profiles').mockResolvedValue({
    accounts: [
      { id: 'merchant-northstar', displayName: 'Alex Morgan', role: 'MERCHANT' },
      { id: 'merchant-cedar', displayName: 'Casey Rivera', role: 'MERCHANT' },
      { id: 'operator', displayName: 'Morgan Patel', role: 'OPERATOR' },
      { id: 'auditor', displayName: 'Sam Rivera', role: 'AUDITOR' },
    ],
  })
  const mocks = mockWorkspace(payments, overviewData)
  const view = renderApp()
  return { ...view, mocks }
}
