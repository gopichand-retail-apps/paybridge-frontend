import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Refund, RefundHistory } from '../api'
import { formatDate, formatReference } from '../domain/money'
import { renderWithContent } from '../test/renderWithContent'
import { RefundHistoryList } from './RefundHistoryList'

afterEach(cleanup)

const refund = (overrides: Partial<Refund> = {}): Refund => ({
  id: 'refund-0001',
  paymentIntentId: 'intent-demo-captured',
  actorId: 'user-operator-01',
  actorName: 'Morgan Patel',
  reason: 'Damaged item',
  currency: 'USD',
  amountMinor: 1500,
  remainingAfterMinor: 6000,
  createdAt: '2026-10-30T12:20:00Z',
  ...overrides,
})

const history = (refunds: Refund[]): RefundHistory => ({
  paymentIntentId: 'intent-demo-captured',
  currency: 'USD',
  capturedAmountMinor: 10000,
  refundedAmountMinor: 4000,
  remainingRefundableMinor: 6000,
  refunds,
})

function renderList(
  state: Parameters<typeof RefundHistoryList>[0]['state'],
  onRetry = vi.fn(),
  remainingRefundableMinor = 6000,
) {
  return renderWithContent(
    <RefundHistoryList remainingRefundableMinor={remainingRefundableMinor} state={state} onRetry={onRetry} />,
  )
}

describe('refund history list', () => {
  it('always shows the remaining refundable balance from the payment, even while loading', () => {
    renderList({ status: 'loading' })

    expect(screen.getByRole('heading', { name: 'Refund history' })).toBeVisible()
    expect(screen.getByText('Remaining refundable: $60.00')).toBeVisible()
    expect(screen.getByText('Loading refund history…')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('says plainly when nothing has been refunded', () => {
    renderList({ status: 'ready', history: history([]) }, vi.fn(), 10000)

    expect(screen.getByText('No refunds recorded yet.')).toBeVisible()
    expect(screen.getByText('Remaining refundable: $100.00')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows reference, amount with currency, reason, actor, time and the balance left after each refund', () => {
    renderList({
      status: 'ready',
      history: history([
        refund({ id: 'refund-0002', amountMinor: 1500, reason: 'Damaged item', remainingAfterMinor: 6000 }),
        refund({ id: 'refund-0001', amountMinor: 2500, reason: 'Customer request', remainingAfterMinor: 7500 }),
      ]),
    })

    const items = within(screen.getByRole('list', { name: 'Recorded refunds' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)

    const newest = within(items[0] as HTMLElement)
    expect(newest.getByText(`Refund ${formatReference('refund-0002', 'RF')}`)).toBeVisible()
    expect(newest.getByText('$15.00 USD')).toBeVisible()
    expect(newest.getByText('Damaged item')).toBeVisible()
    expect(newest.getByText('Recorded by Morgan Patel')).toBeVisible()
    expect(newest.getByText(formatDate('2026-10-30T12:20:00Z'))).toBeVisible()
    expect(newest.getByText('Remaining after: $60.00')).toBeVisible()

    const oldest = within(items[1] as HTMLElement)
    expect(oldest.getByText('$25.00 USD')).toBeVisible()
    expect(oldest.getByText('Remaining after: $75.00')).toBeVisible()
  })

  it('never invents an actor or a balance for a refund recorded before they were tracked', () => {
    renderList({
      status: 'ready',
      history: history([refund({ actorId: null, actorName: null, remainingAfterMinor: null })]),
    })

    expect(screen.getByText('Actor not recorded')).toBeVisible()
    expect(screen.getByText('Remaining after: not recorded')).toBeVisible()
    expect(screen.queryByText(/Recorded by/)).not.toBeInTheDocument()
  })

  it('shows a retryable error without hiding the balance, and does not use an alert role', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderList({ status: 'error' }, onRetry)

    expect(screen.getByText('Refund history could not be loaded.')).toBeVisible()
    expect(screen.getByText('Remaining refundable: $60.00')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
