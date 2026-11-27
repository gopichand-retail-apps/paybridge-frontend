import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { renderLoggedIn } from './test/appHarness'
import { merchantUser, operatorUser, paymentIntent } from './test/fixtures'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const authorized = paymentIntent({
  id: 'intent-demo-authorized',
  status: 'AUTHORIZED',
  authorizedAt: '2026-10-30T12:01:00Z',
})
const captured = paymentIntent({
  ...authorized,
  status: 'CAPTURED',
  capturedAmountMinor: 12500,
  capturedAt: '2026-10-30T12:05:00Z',
})
const openAuthorized = 'Open In-store order · #1047'
const lostResponse = () => new TypeError('Failed to fetch')

describe('stable intent key for payment actions (PB-01)', () => {
  it('reuses one key when a capture is retried after a lost response and shows no success until confirmed', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn(merchantUser, [authorized])
    const capture = vi.spyOn(api, 'capture')
      .mockRejectedValueOnce(lostResponse())
      .mockResolvedValueOnce({ paymentIntent: captured, duplicate: false })

    await user.click(await screen.findByRole('button', { name: openAuthorized }))
    await user.click(screen.getByRole('button', { name: 'Capture' }))

    expect(await screen.findByText('Awaiting confirmation')).toBeVisible()
    expect(screen.queryByText('Simulated capture recorded.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Capture' })).toBeVisible()

    mocks.payments.mockResolvedValue({ paymentIntents: [captured] })
    await user.click(screen.getByRole('button', { name: 'Retry safely' }))

    expect(await screen.findByText('Simulated capture recorded.')).toBeVisible()
    expect(capture).toHaveBeenCalledTimes(2)
    expect(capture.mock.calls[1]?.[0]).toBe(authorized.id)
    expect(capture.mock.calls[1]?.[1]).toBe(capture.mock.calls[0]?.[1])
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()
  })

  it('keeps the same key across a server error and treats the retry as the confirmation', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn(merchantUser, [authorized])
    const capture = vi.spyOn(api, 'capture')
      .mockRejectedValueOnce(new ApiError('Unavailable', 503, 'REQUEST_FAILED', ''))
      .mockResolvedValueOnce({ paymentIntent: captured, duplicate: true })

    await user.click(await screen.findByRole('button', { name: openAuthorized }))
    await user.click(screen.getByRole('button', { name: 'Capture' }))
    expect(await screen.findByText('Awaiting confirmation')).toBeVisible()

    mocks.payments.mockResolvedValue({ paymentIntents: [captured] })
    await user.click(screen.getByRole('button', { name: 'Capture' }))

    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2))
    expect(capture.mock.calls[1]?.[1]).toBe(capture.mock.calls[0]?.[1])
    expect(await screen.findByText('Simulated capture recorded.')).toBeVisible()
  })

  it('uses a new key after the server definitely rejects an attempt and shows no awaiting notice', async () => {
    const user = userEvent.setup()
    renderLoggedIn(merchantUser, [authorized])
    const capture = vi.spyOn(api, 'capture')
      .mockRejectedValue(new ApiError('Conflict', 409, 'INVALID_PAYMENT_TRANSITION', 'request-1'))

    await user.click(await screen.findByRole('button', { name: openAuthorized }))
    await user.click(screen.getByRole('button', { name: 'Capture' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Capture' }))

    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2))
    expect(capture.mock.calls[1]?.[1]).not.toBe(capture.mock.calls[0]?.[1])
  })

  it('discards the pending key on sign-out so a later session starts a new intent', async () => {
    const user = userEvent.setup()
    renderLoggedIn(merchantUser, [authorized])
    vi.spyOn(api, 'logout').mockResolvedValue(undefined)
    vi.spyOn(api, 'login').mockResolvedValue({ user: merchantUser, localProfileSession: true })
    const capture = vi.spyOn(api, 'capture').mockRejectedValue(lostResponse())

    await user.click(await screen.findByRole('button', { name: openAuthorized }))
    await user.click(screen.getByRole('button', { name: 'Capture' }))
    expect(await screen.findByText('Awaiting confirmation')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Close payment details' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(await screen.findByRole('button', { name: 'Continue to PayBridge' }))
    await user.click(await screen.findByRole('button', { name: openAuthorized }))

    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Capture' }))
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2))
    expect(capture.mock.calls[1]?.[1]).not.toBe(capture.mock.calls[0]?.[1])
  })

  it('reloads the payment after a state conflict so the drawer shows the server status', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn(merchantUser, [authorized])
    vi.spyOn(api, 'capture')
      .mockRejectedValue(new ApiError('Conflict', 409, 'PAYMENT_STATE_CONFLICT', 'request-3'))

    await user.click(await screen.findByRole('button', { name: openAuthorized }))
    mocks.payments.mockResolvedValue({ paymentIntents: [captured] })
    await user.click(screen.getByRole('button', { name: 'Capture' }))

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Deliver pending webhooks' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument()
  })
})

describe('stable intent key for refunds (PB-01, PB-02)', () => {
  const refundable = paymentIntent({
    id: 'intent-demo-captured',
    status: 'CAPTURED',
    capturedAmountMinor: 12500,
    capturedAt: '2026-10-30T12:05:00Z',
  })
  const refunded = paymentIntent({ ...refundable, status: 'PARTIALLY_REFUNDED', refundedAmountMinor: 2000 })
  const openCaptured = 'Open Subscription renewal · #1046'

  async function startRefund(user: ReturnType<typeof userEvent.setup>, amount: string) {
    await user.click(await screen.findByRole('button', { name: openCaptured }))
    await user.type(screen.getByLabelText(/Refund amount \(up to \$125\.00\)/), amount)
    await user.click(screen.getByRole('button', { name: 'Record refund' }))
  }

  it('retries a lost refund on the same key and reloads the refund history once confirmed', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn(operatorUser, [refundable])
    const refund = vi.spyOn(api, 'refund')
      .mockRejectedValueOnce(lostResponse())
      .mockResolvedValueOnce({ paymentIntent: refunded, duplicate: false })

    await startRefund(user, '20.00')

    expect(await screen.findByText('Awaiting confirmation')).toBeVisible()
    expect(screen.getByText(
      'We could not confirm the $20.00 refund. Retrying is safe: PayBridge will not record it twice.',
    )).toBeVisible()
    expect(screen.getByRole('button', { name: 'Record refund' })).toBeDisabled()
    expect(screen.queryByText('Simulated refund recorded.')).not.toBeInTheDocument()

    const historyCallsBefore = mocks.refundHistory.mock.calls.length
    mocks.payments.mockResolvedValue({ paymentIntents: [refunded] })
    await user.click(screen.getByRole('button', { name: 'Retry safely' }))

    expect(await screen.findByText('Simulated refund recorded.')).toBeVisible()
    expect(refund).toHaveBeenCalledTimes(2)
    expect(refund.mock.calls[1]).toEqual(refund.mock.calls[0])
    expect(refund.mock.calls[0]).toEqual([refundable.id, 2000, 'Customer request', expect.any(String)])
    await waitFor(() => expect(mocks.refundHistory.mock.calls.length).toBeGreaterThan(historyCallsBefore))
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()
  })

  it('still offers the safe retry after the drawer is closed and reopened', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn(operatorUser, [refundable])
    const refund = vi.spyOn(api, 'refund')
      .mockRejectedValueOnce(lostResponse())
      .mockResolvedValueOnce({ paymentIntent: refunded, duplicate: true })

    await startRefund(user, '20.00')
    expect(await screen.findByText('Awaiting confirmation')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Close payment details' }))
    await user.click(screen.getByRole('button', { name: openCaptured }))

    expect(screen.getByText('Awaiting confirmation')).toBeVisible()
    mocks.payments.mockResolvedValue({ paymentIntents: [refunded] })
    await user.click(screen.getByRole('button', { name: 'Retry safely' }))

    await waitFor(() => expect(refund).toHaveBeenCalledTimes(2))
    expect(refund.mock.calls[1]?.[3]).toBe(refund.mock.calls[0]?.[3])
    expect(await screen.findByText('Simulated refund recorded.')).toBeVisible()
  })

  it('uses a new key for an edited refund after the server rejected the first one', async () => {
    const user = userEvent.setup()
    renderLoggedIn(operatorUser, [refundable])
    const refund = vi.spyOn(api, 'refund')
      .mockRejectedValueOnce(new ApiError('Too much', 409, 'REFUND_EXCEEDS_CAPTURE', 'request-2'))
      .mockResolvedValueOnce({ paymentIntent: refunded, duplicate: false })

    await startRefund(user, '20.00')
    expect(await screen.findByText(/not more than|more than the amount still refundable/i)).toBeVisible()
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()

    const amount = screen.getByLabelText(/Refund amount/)
    await user.clear(amount)
    await user.type(amount, '15.00')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))

    await waitFor(() => expect(refund).toHaveBeenCalledTimes(2))
    expect(refund.mock.calls[1]?.[1]).toBe(1500)
    expect(refund.mock.calls[1]?.[3]).not.toBe(refund.mock.calls[0]?.[3])
  })

  it('reloads the balance after the server rejects a refund that exceeded what is still refundable', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn(operatorUser, [refundable])
    vi.spyOn(api, 'refund')
      .mockRejectedValue(new ApiError('Too much', 409, 'REFUND_EXCEEDS_CAPTURE', 'request-4'))
    const alreadyRefunded = paymentIntent({ ...refundable, status: 'PARTIALLY_REFUNDED', refundedAmountMinor: 10000 })

    await user.click(await screen.findByRole('button', { name: openCaptured }))
    expect(screen.getByLabelText(/Refund amount \(up to \$125\.00\)/)).toBeVisible()
    mocks.payments.mockResolvedValue({ paymentIntents: [alreadyRefunded] })
    await user.type(screen.getByLabelText(/Refund amount/), '30.00')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))

    expect(await screen.findByLabelText(/Refund amount \(up to \$25\.00\)/)).toBeVisible()
    expect(screen.getByText('Remaining refundable: $25.00')).toBeVisible()
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()
  })

  it('shows the rejection and clears the notice when the safe retry of a refund is refused', async () => {
    const user = userEvent.setup()
    renderLoggedIn(operatorUser, [refundable])
    vi.spyOn(api, 'refund')
      .mockRejectedValueOnce(lostResponse())
      .mockRejectedValueOnce(new ApiError('Too much', 409, 'REFUND_EXCEEDS_CAPTURE', 'request-5'))

    await startRefund(user, '20.00')
    expect(await screen.findByText('Awaiting confirmation')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry safely' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('more than the amount still refundable')
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Refund amount/)).toBeEnabled()
  })

  it('reports a failed reload after a conflict instead of hiding it', async () => {
    const user = userEvent.setup()
    const { mocks } = renderLoggedIn(operatorUser, [refundable])
    vi.spyOn(api, 'refund')
      .mockRejectedValue(new ApiError('Too much', 409, 'REFUND_EXCEEDS_CAPTURE', 'request-6'))

    await user.click(await screen.findByRole('button', { name: openCaptured }))
    mocks.overview.mockRejectedValue(new ApiError('Unavailable', 503, 'UNKNOWN', 'request-7'))
    await user.type(screen.getByLabelText(/Refund amount/), '30.00')
    await user.click(screen.getByRole('button', { name: 'Record refund' }))

    expect(await screen.findByText('The request could not be completed. Try again.')).toBeVisible()
    expect(screen.getByText(/more than the amount still refundable/)).toBeVisible()
  })
})
