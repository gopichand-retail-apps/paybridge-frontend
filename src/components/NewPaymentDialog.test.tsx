import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewPaymentDialog } from './NewPaymentDialog'
import { renderWithContent } from '../test/renderWithContent'

afterEach(cleanup)

describe('new payment dialog', () => {
  it('validates amount and description before submitting', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    renderWithContent(
      <NewPaymentDialog busy={false} error="" onClose={vi.fn()} onCreate={onCreate} />,
    )

    await user.clear(screen.getByLabelText(/Amount \(USD\)/))
    await user.type(screen.getByLabelText(/Amount \(USD\)/), '0')
    await user.click(screen.getByRole('button', { name: 'Create intent' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount between $0.01 and $1,000,000.00.')
    expect(onCreate).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText(/Amount \(USD\)/))
    await user.type(screen.getByLabelText(/Amount \(USD\)/), '125.00')
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'No')
    await user.click(screen.getByRole('button', { name: 'Create intent' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add a short payment description.')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('submits only synthetic request fields and rotates its idempotency key after edits', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    renderWithContent(
      <NewPaymentDialog busy={false} error="" onClose={vi.fn()} onCreate={onCreate} />,
    )

    await user.click(screen.getByRole('button', { name: 'Create intent' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    const firstCall = onCreate.mock.calls[0]
    expect(firstCall?.[0]).toEqual({
      amountMinor: 12500,
      currency: 'USD',
      description: 'Online order · #1049',
      simulationOutcome: 'APPROVE',
    })

    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Synthetic order')
    await user.clear(screen.getByLabelText(/Amount \(USD\)/))
    await user.type(screen.getByLabelText(/Amount \(USD\)/), '42.50')
    await user.click(screen.getByRole('button', { name: 'Declined' }))
    expect(screen.getByRole('button', { name: 'Declined' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Create intent' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2))
    const secondCall = onCreate.mock.calls[1]
    expect(secondCall?.[0]).toEqual({
      amountMinor: 4250,
      currency: 'USD',
      description: 'Synthetic order',
      simulationOutcome: 'DECLINE',
    })
    expect(secondCall?.[1]).not.toBe(firstCall?.[1])
  })

  it('shows API errors and refuses closing while a create request is busy', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container, rerender } = renderWithContent(
      <NewPaymentDialog
        busy={false}
        error="The server could not create the intent."
        onClose={onClose}
        onCreate={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The server could not create the intent.')

    rerender(
      <NewPaymentDialog busy onClose={onClose} error="" onCreate={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled()
    await user.keyboard('{Escape}')

    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop).not.toBeNull()
    if (backdrop) fireEvent.mouseDown(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape, explicit cancellation, and a backdrop click when idle', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = renderWithContent(
      <NewPaymentDialog busy={false} error="" onClose={onClose} onCreate={vi.fn()} />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop).not.toBeNull()
    if (backdrop) fireEvent.mouseDown(backdrop)
    expect(onClose).toHaveBeenCalledTimes(3)

    const dialog = screen.getByRole('dialog')
    fireEvent.mouseDown(dialog)
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
