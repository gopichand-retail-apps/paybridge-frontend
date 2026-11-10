import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, type PaymentIntent, type SessionUser } from './api'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ContentProvider } from './content'
import paybridgeModel from '../public/paybridge-model.json'
import {
  auditorUser,
  merchantUser,
  operatorUser,
  overview,
  paymentIntent,
  reconciliation,
} from './test/fixtures'

function mockWorkspace(payments: PaymentIntent[] = [paymentIntent()], overviewData = overview) {
  return {
    overview: vi.spyOn(api, 'overview').mockResolvedValue(overviewData),
    payments: vi.spyOn(api, 'payments').mockResolvedValue({ paymentIntents: payments }),
    webhooks: vi.spyOn(api, 'webhooks').mockResolvedValue({ webhookEvents: [] }),
    reconciliations: vi.spyOn(api, 'reconciliations').mockResolvedValue({ reconciliations: [] }),
    auditEvents: vi.spyOn(api, 'auditEvents').mockResolvedValue({ auditEvents: [] }),
  }
}

function renderApp() {
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

function renderLoggedIn(
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('workspace navigation and recovery', () => {
  it('searches and filters payments and visits each operations workspace', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn()
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Payment intents/ }))
    const search = screen.getByRole('textbox', { name: 'Search payment intents' })
    await user.type(search, ' order ')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'CAPTURED')
    await waitFor(() => expect(mocks.payments).toHaveBeenLastCalledWith({
      q: 'order',
      status: 'CAPTURED',
      limit: 100,
    }))
    expect(screen.getByRole('heading', { name: 'Payment intents' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Open Online order · #1048' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Close payment details' }))

    await user.click(screen.getByRole('button', { name: 'Webhook events' }))
    expect(screen.getByRole('heading', { name: 'Webhook events' })).toBeVisible()
    expect(screen.getByText('No webhook events yet')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Reconciliation' }))
    expect(screen.getByRole('heading', { name: 'Reconciliation' })).toBeVisible()
    expect(screen.getByText('No reconciliation runs')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Audit history' }))
    expect(screen.getByRole('heading', { name: 'Audit history' })).toBeVisible()
    expect(screen.getByText('No audit events')).toBeVisible()
  })

  it('renders empty overview signals and the zero-intent lifecycle state', async () => {
    const { container } = renderLoggedIn(
      auditorUser,
      [],
      { ...overview, totalIntentCount: 0, awaitingAuthorizationCount: 0 },
    )
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    expect(container.querySelector('.lifecycle-empty')).not.toBeNull()
    expect(container.querySelector('.nav-count')).toBeNull()
    expect(screen.getByText('No payment intents match')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'New payment intent' })).not.toBeInTheDocument()
  })

  it('recovers a logged-in session from a workspace fetch failure and dismisses errors', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'csrf').mockResolvedValue(undefined)
    vi.spyOn(api, 'currentUser').mockResolvedValue({ user: merchantUser, localProfileSession: true })
    const mocks = mockWorkspace()
    mocks.overview.mockRejectedValueOnce(new ApiError('private detail', 503, 'CONFLICT', 'request-2'))

    renderApp()
    expect(await screen.findByRole('heading', { name: 'Workspace data is unavailable' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('The payment state changed. Refresh and try again.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()

    mocks.overview.mockRejectedValueOnce(new ApiError('private detail', 503, 'CONFLICT', 'request-3'))
    await user.click(screen.getByRole('button', { name: 'Refresh workspace data' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The payment state changed. Refresh and try again.',
    )
    await user.click(screen.getByRole('button', { name: 'Dismiss error' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a retry affordance when CSRF bootstrap fails before any profile loads', async () => {
    vi.spyOn(api, 'csrf').mockRejectedValue(new ApiError('private detail', 503, 'UNKNOWN', 'request-4'))
    vi.spyOn(api, 'currentUser')
    mockWorkspace()

    renderApp()
    expect(await screen.findByRole('heading', { name: 'Open your workspace' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('The request could not be completed. Try again.')
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeVisible()
    expect(api.currentUser).not.toHaveBeenCalled()
  })
})

describe('workspace actions', () => {
  it('runs merchant authorization, capture, and webhook delivery from server-returned state', async () => {
    const user = userEvent.setup()
    const created = paymentIntent()
    const authorized = paymentIntent({
      status: 'AUTHORIZED',
      authorizedAt: '2026-10-30T12:01:00Z',
    })
    const captured = paymentIntent({
      status: 'CAPTURED',
      authorizedAt: '2026-10-30T12:01:00Z',
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    const { mocks } = renderLoggedIn(merchantUser, [created])
    mocks.payments
      .mockResolvedValueOnce({ paymentIntents: [created] })
      .mockResolvedValueOnce({ paymentIntents: [authorized] })
      .mockResolvedValueOnce({ paymentIntents: [captured] })
      .mockResolvedValueOnce({ paymentIntents: [captured] })
    const authorize = vi.spyOn(api, 'authorize').mockResolvedValue({
      paymentIntent: authorized,
      duplicate: false,
    })
    const capture = vi.spyOn(api, 'capture').mockResolvedValue({
      paymentIntent: captured,
      duplicate: false,
    })
    const deliver = vi.spyOn(api, 'deliverWebhooks').mockResolvedValue({ deliveries: [] })

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Open Online order · #1048' }))
    await user.click(screen.getByRole('button', { name: 'Simulate authorization' }))
    await waitFor(() => expect(authorize).toHaveBeenCalledWith(created.id, expect.any(String)))
    expect(await screen.findByRole('status')).toHaveTextContent('Authorization simulation completed.')
    expect(await screen.findByRole('button', { name: 'Capture' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Capture' }))
    await waitFor(() => expect(capture).toHaveBeenCalledWith(created.id, expect.any(String)))
    expect(await screen.findByRole('button', { name: 'Deliver pending webhooks' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Deliver pending webhooks' }))
    await waitFor(() => expect(deliver).toHaveBeenCalledWith(created.id))
  })

  it('runs operator void and reconciliation actions on their permitted states', async () => {
    const user = userEvent.setup()
    const authorized = paymentIntent({
      id: 'intent-demo-authorized',
      status: 'AUTHORIZED',
      authorizedAt: '2026-10-30T12:01:00Z',
    })
    const captured = paymentIntent({
      id: 'intent-demo-captured',
      status: 'CAPTURED',
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    renderLoggedIn(operatorUser, [authorized, captured])
    const voidIntent = vi.spyOn(api, 'void').mockResolvedValue({
      paymentIntent: paymentIntent({ ...authorized, status: 'VOIDED' }),
      duplicate: false,
    })
    const reconcile = vi.spyOn(api, 'reconcile').mockResolvedValue({ reconciliation })

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Open In-store order · #1047' }))
    await user.click(screen.getByRole('button', { name: 'Void' }))
    await waitFor(() => expect(voidIntent).toHaveBeenCalledWith(authorized.id, expect.any(String)))

    await user.click(screen.getByRole('button', { name: 'Close payment details' }))
    await user.click(screen.getByRole('button', { name: 'Open Subscription renewal · #1046' }))
    await user.click(screen.getByRole('button', { name: 'Run reconciliation' }))
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(captured.id, expect.any(String)))
  })

  it('maps action failures safely and supports dismissing drawer errors', async () => {
    const user = userEvent.setup()
    renderLoggedIn()
    const authorize = vi.spyOn(api, 'authorize').mockRejectedValue(
      new ApiError('private response detail', 409, 'CONFLICT', 'request-5'),
    )

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Open Online order · #1048' }))
    await user.click(screen.getByRole('button', { name: 'Simulate authorization' }))
    await waitFor(() => expect(authorize).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The payment state changed. Refresh and try again.',
    )
    expect(screen.queryByText('private response detail')).not.toBeInTheDocument()
  })

  it('creates new and duplicate intents through the API and displays the returned intent', async () => {
    const user = userEvent.setup()
    renderLoggedIn()
    const created = paymentIntent({ id: 'intent-created-by-api', description: 'API-created order' })
    const createIntent = vi.spyOn(api, 'createIntent')
      .mockResolvedValueOnce({ paymentIntent: created, duplicate: false })
      .mockResolvedValueOnce({ paymentIntent: created, duplicate: true })

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'New payment intent' }))
    await user.click(screen.getByRole('button', { name: 'Create intent' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Payment intent created.')
    expect(createIntent).toHaveBeenCalledTimes(1)
    expect(createIntent.mock.calls[0]?.[0]).toEqual({
      amountMinor: 12500,
      currency: 'USD',
      description: 'Online order · #1049',
      simulationOutcome: 'APPROVE',
    })
    expect(screen.getByRole('heading', { name: 'API-created order' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Close payment details' }))

    await user.click(screen.getByRole('button', { name: 'New payment intent' }))
    await user.click(screen.getByRole('button', { name: 'Create intent' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Existing intent loaded safely.'))
    expect(createIntent).toHaveBeenCalledTimes(2)
    expect(createIntent.mock.calls[0]?.[1]).not.toBe(createIntent.mock.calls[1]?.[1])
  })

  it('shows mapped create and logout errors and returns to API-owned profile selection', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'csrf').mockResolvedValue(undefined)
    vi.spyOn(api, 'currentUser').mockRejectedValue(
      new ApiError('sign in', 401, 'AUTH_REQUIRED', 'request-6'),
    )
    const profiles = vi.spyOn(api, 'profiles').mockResolvedValue({
      accounts: [{ id: 'auditor', displayName: 'Sam Rivera', role: 'AUDITOR' }],
    })
    mockWorkspace()
    const login = vi.spyOn(api, 'login').mockRejectedValue(
      new ApiError('private details', 400, 'INVALID_PROFILE', 'request-7'),
    )
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Open your workspace' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continue to PayBridge' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Select a supported workspace profile.')
    expect(login).toHaveBeenCalledWith('auditor')
    expect(profiles).toHaveBeenCalledTimes(1)
  })

  it('returns to profile selection after logout and keeps an error toast when logout fails', async () => {
    const user = userEvent.setup()
    renderLoggedIn()
    const logout = vi.spyOn(api, 'logout').mockResolvedValue(undefined)
    const csrf = vi.spyOn(api, 'csrf').mockResolvedValue(undefined)

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Open your workspace' })).toBeVisible()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(csrf).toHaveBeenCalledTimes(2)

    const { unmount } = renderLoggedIn()
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    vi.spyOn(api, 'logout').mockRejectedValue(
      new ApiError('private details', 409, 'CONFLICT', 'request-8'),
    )
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The payment state changed. Refresh and try again.',
    )
    unmount()
  })

  it('refreshes selected payment state and safely reports missing or failed refresh data', async () => {
    const user = userEvent.setup()
    const initial = paymentIntent()
    const updated = paymentIntent({
      status: 'CAPTURED',
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    const { mocks } = renderLoggedIn(merchantUser, [initial])
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Open Online order · #1048' }))
    mocks.payments.mockResolvedValue({ paymentIntents: [updated] })
    await user.click(screen.getByRole('button', { name: 'Refresh workspace data' }))
    expect(await screen.findByRole('button', { name: 'Deliver pending webhooks' })).toBeVisible()

    mocks.payments.mockResolvedValue({ paymentIntents: [] })
    await user.click(screen.getByRole('button', { name: 'Refresh workspace data' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    mocks.overview.mockRejectedValueOnce(new ApiError('private details', 503, 'UNKNOWN', 'request-9'))
    await user.click(screen.getByRole('button', { name: 'Refresh workspace data' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The request could not be completed. Try again.')
  })

  it('records an operator refund using the selected synthetic intent and reason', async () => {
    const user = userEvent.setup()
    const captured = paymentIntent({
      id: 'intent-demo-captured',
      status: 'CAPTURED',
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    const refunded = paymentIntent({
      ...captured,
      status: 'PARTIALLY_REFUNDED',
      refundedAmountMinor: 2000,
    })
    const { mocks } = renderLoggedIn(operatorUser, [captured])
    mocks.payments
      .mockResolvedValueOnce({ paymentIntents: [captured] })
      .mockResolvedValueOnce({ paymentIntents: [refunded] })
    const refund = vi.spyOn(api, 'refund').mockResolvedValue({
      paymentIntent: refunded,
      duplicate: false,
    })

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Open Subscription renewal · #1046' }))
    await user.type(screen.getByLabelText(/Refund amount \(up to \$125\.00\)/), '20.00')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))

    await waitFor(() => expect(refund).toHaveBeenCalledWith(
      captured.id,
      2000,
      'Customer request',
      expect.any(String),
    ))
    expect(await screen.findByRole('status')).toHaveTextContent('Simulated refund recorded.')
    expect(screen.getAllByText('Partially refunded').length).toBeGreaterThan(0)
  })
})
