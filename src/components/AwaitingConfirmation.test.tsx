import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithContent } from '../test/renderWithContent'
import { AwaitingConfirmation } from './AwaitingConfirmation'

afterEach(cleanup)

describe('awaiting confirmation notice', () => {
  it('names the action that is unconfirmed and says a retry cannot repeat it', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { container } = renderWithContent(
      <AwaitingConfirmation
        awaiting={{ paymentId: 'intent-1', action: 'capture' }}
        busy={false}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('Awaiting confirmation')).toBeVisible()
    expect(screen.getByText(
      'We could not confirm that the capture finished. Retrying is safe: PayBridge will not apply it twice.',
    )).toBeVisible()
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry safely' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the refund amount so the user knows exactly what is unconfirmed', () => {
    renderWithContent(
      <AwaitingConfirmation
        awaiting={{ paymentId: 'intent-1', action: 'refund', amountMinor: 2000, reason: 'Customer request' }}
        busy={false}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(
      'We could not confirm the $20.00 refund. Retrying is safe: PayBridge will not record it twice.',
    )).toBeVisible()
  })

  it('disables the retry while it is being confirmed', () => {
    renderWithContent(
      <AwaitingConfirmation
        awaiting={{ paymentId: 'intent-1', action: 'void' }}
        busy
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled()
  })
})
