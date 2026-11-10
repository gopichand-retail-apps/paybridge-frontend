import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentTable } from './PaymentTable'
import { paymentIntent } from '../test/fixtures'
import { renderWithContent } from '../test/renderWithContent'

afterEach(cleanup)

describe('payment table', () => {
  it('renders an accessible empty state', () => {
    renderWithContent(<PaymentTable payments={[]} onSelect={vi.fn()} />)
    expect(screen.getByText('No payment intents match')).toBeVisible()
    expect(screen.getByText('Try another search or status filter.')).toBeVisible()
  })

  it('renders model copy, webhook states, and opens a selected payment', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const created = paymentIntent({ webhookEventCount: 0 })
    const captured = paymentIntent({
      id: 'intent-unmapped',
      status: 'CAPTURED',
      webhookEventCount: 2,
      capturedAmountMinor: 12500,
      capturedAt: '2026-10-30T12:05:00Z',
    })
    renderWithContent(<PaymentTable payments={[created, captured]} onSelect={onSelect} />)

    expect(screen.getByText('Online order · #1048')).toBeVisible()
    expect(screen.getByText('API payment description')).toBeVisible()
    expect(screen.getByText('Waiting')).toBeVisible()
    expect(screen.getByText('2 received')).toBeVisible()
    expect(screen.getAllByText('Created').length).toBeGreaterThan(0)
    expect(screen.getByText('Captured')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Open API payment description' }))
    expect(onSelect).toHaveBeenCalledWith(captured)
    await user.click(screen.getByRole('button', { name: /^Online order/ }))
    expect(onSelect).toHaveBeenLastCalledWith(created)
  })
})
