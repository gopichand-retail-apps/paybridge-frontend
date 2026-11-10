import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { auditorUser, merchantUser, operatorUser, paymentIntent, reconciliation, webhookEvent } from '../test/fixtures'
import { renderWithContent } from '../test/renderWithContent'
import { PaymentDetailsDrawer } from './PaymentDetailsDrawer'

afterEach(cleanup)

type DrawerProps = Parameters<typeof PaymentDetailsDrawer>[0]

function renderDrawer(overrides: Partial<DrawerProps> = {}) {
  const props: DrawerProps = {
    intent: paymentIntent(),
    user: merchantUser,
    events: [],
    reconciliations: [],
    busyAction: null,
    error: '',
    onClose: vi.fn(),
    onAction: vi.fn().mockResolvedValue(undefined),
    onRefund: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  const view = renderWithContent(<PaymentDetailsDrawer {...props} />)
  return { ...view, props }
}

describe('payment details drawer', () => {
  it('shows safe details and allows a merchant to authorize only a created intent', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn().mockResolvedValue(undefined)
    renderDrawer({ onAction })

    expect(screen.getByRole('heading', { name: 'Online order · #1048' })).toBeVisible()
    expect(screen.getByText('Northstar Goods')).toBeVisible()
    expect(screen.getAllByText('Created').length).toBeGreaterThan(0)
    expect(screen.getByText('approved simulation')).toBeVisible()
    expect(screen.getByText('Captured $0.00')).toBeVisible()
    expect(screen.getByText('PayBridge stores no PAN, CVV, bank credentials, or live payment tokens.'))
      .toBeVisible()
    expect(screen.getByRole('button', { name: 'Simulate authorization' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Pending')).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Simulate authorization' }))
    expect(onAction).toHaveBeenCalledWith('authorize')
  })

  it('shows capture to merchants and operator-only void and reconciliation actions', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn().mockResolvedValue(undefined)
    const authorized = paymentIntent({
      status: 'AUTHORIZED',
      authorizedAt: '2026-10-30T12:01:00Z',
    })
    const { rerender } = renderDrawer({ intent: authorized, onAction })
    expect(screen.getByRole('button', { name: 'Capture' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument()

    rerender(
      <PaymentDetailsDrawer
        intent={authorized}
        user={operatorUser}
        events={[]}
        reconciliations={[]}
        busyAction={null}
        error=""
        onClose={vi.fn()}
        onAction={onAction}
        onRefund={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    expect(screen.getByRole('button', { name: 'Void' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Run reconciliation' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Capture' }))
    await user.click(screen.getByRole('button', { name: 'Void' }))
    expect(onAction).toHaveBeenNthCalledWith(1, 'capture')
    expect(onAction).toHaveBeenCalledWith('void')
  })

  it('limits mutation actions for auditors and shows a role-specific read-only notice', () => {
    renderDrawer({
      intent: paymentIntent({ status: 'DECLINED', simulationOutcome: 'DECLINE' }),
      user: auditorUser,
      error: 'A protected action was denied.',
    })

    expect(screen.getByText('Authorization declined')).toBeVisible()
    expect(screen.getByText('Auditors have read-only access to payment records.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('A protected action was denied.')
    expect(screen.queryByRole('button', { name: 'Simulate authorization' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument()
  })

  it('renders captured event and reconciliation history and validates simulated refunds', async () => {
    const user = userEvent.setup()
    const onRefund = vi.fn().mockResolvedValue(undefined)
    const captured = paymentIntent({
      id: 'intent-demo-captured',
      status: 'CAPTURED',
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
      webhookEventCount: 1,
      latestReconciliationResult: 'MATCHED',
    })
    renderDrawer({
      intent: captured,
      user: operatorUser,
      events: [webhookEvent],
      reconciliations: [reconciliation],
      onRefund,
    })

    expect(screen.getByText('Subscription renewal · #1046')).toBeVisible()
    expect(screen.getByText('Matched')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Deliver pending webhooks' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Run reconciliation' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Deliver pending webhooks' }))
    await user.click(screen.getByRole('button', { name: 'Run reconciliation' }))

    const amount = screen.getByLabelText(/Refund amount \(up to \$125\.00\)/)
    const reason = screen.getByLabelText('Reason')
    await user.type(amount, '0')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a value no greater than $125.00.')
    expect(onRefund).not.toHaveBeenCalled()

    await user.clear(amount)
    await user.type(amount, '130.00')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a value no greater than $125.00.')

    await user.clear(amount)
    await user.type(amount, '20.00')
    await user.clear(reason)
    await user.type(reason, 'abc')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add a short reason for the refund record.')

    await user.clear(reason)
    await user.type(reason, 'Customer request')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))
    await waitFor(() => expect(onRefund).toHaveBeenCalledTimes(1))
    expect(onRefund.mock.calls[0]?.[0]).toBe(2000)
    expect(onRefund.mock.calls[0]?.[1]).toBe('Customer request')
    expect(onRefund.mock.calls[0]?.[2]).toBeTruthy()
  })

  it('shows safely mapped refund failures and hides refund controls for read-only or settled records', async () => {
    const user = userEvent.setup()
    const onRefund = vi.fn().mockRejectedValue(
      new ApiError('untrusted server detail', 409, 'CONFLICT', 'request-1'),
    )
    const captured = paymentIntent({
      id: 'intent-demo-captured',
      status: 'PARTIALLY_REFUNDED',
      capturedAmountMinor: 12500,
      refundedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    const { rerender } = renderDrawer({
      intent: captured,
      user: operatorUser,
      onRefund,
    })
    expect(screen.queryByRole('heading', { name: 'Record a refund' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deliver pending webhooks' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Run reconciliation' })).toBeVisible()

    const refundable = paymentIntent({
      id: 'intent-demo-captured',
      status: 'CAPTURED',
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    rerender(
      <PaymentDetailsDrawer
        intent={refundable}
        user={operatorUser}
        events={[]}
        reconciliations={[]}
        busyAction={null}
        error=""
        onClose={vi.fn()}
        onAction={vi.fn().mockResolvedValue(undefined)}
        onRefund={onRefund}
      />,
    )
    await user.type(screen.getByLabelText(/Refund amount \(up to \$125\.00\)/), '1.00')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The payment state changed. Refresh and try again.',
    )
    expect(screen.queryByText('untrusted server detail')).not.toBeInTheDocument()
  })

  it('honors busy state and closes on Escape or backdrop only when not busy', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const captured = paymentIntent({
      status: 'CAPTURED',
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    const { container, rerender } = renderDrawer({
      intent: captured,
      busyAction: 'deliver',
      onClose,
    })

    expect(screen.getAllByText('Updating payment state…')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Updating payment state…' })).toBeDisabled()
    await user.keyboard('{Escape}')
    const backdrop = container.querySelector('.drawer-backdrop')
    expect(backdrop).not.toBeNull()
    if (backdrop) fireEvent.mouseDown(backdrop)
    expect(onClose).not.toHaveBeenCalled()

    rerender(
      <PaymentDetailsDrawer
        intent={captured}
        user={merchantUser}
        events={[]}
        reconciliations={[]}
        busyAction={null}
        error=""
        onClose={onClose}
        onAction={vi.fn().mockResolvedValue(undefined)}
        onRefund={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
