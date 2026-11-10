import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import type { PaymentIntent } from './api'

const intent: PaymentIntent = {
  id: 'intent-a1b2c3d4',
  merchantId: 'merchant-demo-01',
  merchantName: 'Northstar Goods',
  amountMinor: 12500,
  currency: 'USD',
  description: 'Synthetic order',
  status: 'CAPTURED',
  simulationOutcome: 'APPROVE',
  capturedAmountMinor: 12500,
  refundedAmountMinor: 0,
  webhookEventCount: 1,
  latestReconciliationResult: 'MATCHED',
  createdAt: '2026-10-30T12:00:00Z',
  updatedAt: '2026-10-30T12:10:00Z',
  authorizedAt: '2026-10-30T12:01:00Z',
  capturedAt: '2026-10-30T12:05:00Z',
}

const userResponse = {
  user: {
    id: 'user-merchant-01',
    displayName: 'Alex Morgan',
    role: 'MERCHANT',
    merchantId: 'merchant-demo-01',
  },
  localProfileSession: true,
}

const overviewResponse = {
  totalIntentCount: 1,
  capturedAmountMinor: 12500,
  refundedAmountMinor: 0,
  awaitingAuthorizationCount: 0,
  declinedCount: 0,
  pendingWebhookCount: 0,
  reconciliationMismatchCount: 0,
  capturedIntentCount: 1,
  authorizedIntentCount: 0,
}

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), { status, headers })
}

function mockedFetch() {
  return vi.mocked(globalThis.fetch)
}

beforeEach(async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  await api.logout()
  fetchMock.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API request handling', () => {
  it('uses response schemas, request IDs, credentialed requests, and CSRF on mutations', async () => {
    mockedFetch()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-token' }))
      .mockResolvedValueOnce(jsonResponse(userResponse))

    await api.csrf()
    await api.login('merchant-northstar')

    const [url, init] = mockedFetch().mock.calls[1] ?? []
    expect(url).toBe('/api/v1/auth/profile-login')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(JSON.parse(String(init?.body))).toEqual({ accountId: 'merchant-northstar' })
    const headers = new Headers(init?.headers)
    expect(headers.get('X-XSRF-TOKEN')).toBe('csrf-token')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/)
    expect(headers.get('X-Trace-ID')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('calls all read endpoints and encodes filters and resource identifiers', async () => {
    mockedFetch()
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockResolvedValueOnce(jsonResponse(userResponse))
      .mockResolvedValueOnce(jsonResponse(overviewResponse))
      .mockResolvedValueOnce(jsonResponse({ paymentIntents: [intent] }))
      .mockResolvedValueOnce(jsonResponse({ paymentIntents: [] }))
      .mockResolvedValueOnce(jsonResponse({ paymentIntents: [] }))
      .mockResolvedValueOnce(jsonResponse({ paymentIntent: intent, duplicate: false }))
      .mockResolvedValueOnce(jsonResponse({ webhookEvents: [] }))
      .mockResolvedValueOnce(jsonResponse({ reconciliations: [] }))
      .mockResolvedValueOnce(jsonResponse({ auditEvents: [] }))

    expect(await api.profiles()).toEqual({ accounts: [] })
    expect(await api.currentUser()).toEqual(userResponse)
    expect(await api.overview()).toEqual(overviewResponse)
    expect(await api.payments({ q: 'a b', status: 'CAPTURED', limit: 25 }))
      .toEqual({ paymentIntents: [intent] })
    expect(await api.payments()).toEqual({ paymentIntents: [] })
    expect(await api.payments({ q: '', limit: 0 })).toEqual({ paymentIntents: [] })
    expect(await api.payment('intent/a b')).toEqual({ paymentIntent: intent, duplicate: false })
    expect(await api.webhooks()).toEqual({ webhookEvents: [] })
    expect(await api.reconciliations()).toEqual({ reconciliations: [] })
    expect(await api.auditEvents()).toEqual({ auditEvents: [] })

    const urls = mockedFetch().mock.calls.map(([url]) => String(url))
    expect(urls).toContain('/api/v1/payment-intents?q=a+b&status=CAPTURED&limit=25')
    expect(urls).toContain('/api/v1/payment-intents')
    expect(urls).toContain('/api/v1/payment-intents/intent%2Fa%20b')
    expect(urls).toContain('/api/v1/webhook-events?limit=100')
    expect(urls).toContain('/api/v1/reconciliations?limit=100')
    expect(urls).toContain('/api/v1/audit-events?limit=100')
  })

  it('sends state-changing requests with idempotency keys and does not add payment fields', async () => {
    mockedFetch()
      .mockResolvedValueOnce(jsonResponse({ paymentIntent: intent, duplicate: false }))
      .mockResolvedValueOnce(jsonResponse({ paymentIntent: intent, duplicate: false }))
      .mockResolvedValueOnce(jsonResponse({ paymentIntent: intent, duplicate: false }))
      .mockResolvedValueOnce(jsonResponse({ paymentIntent: intent, duplicate: false }))
      .mockResolvedValueOnce(jsonResponse({ paymentIntent: intent, duplicate: false }))
      .mockResolvedValueOnce(jsonResponse({
        deliveries: [{ eventId: 'event-1', duplicate: false, signatureVerified: true, status: 'DELIVERED' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        reconciliation: {
          id: 'recon-1',
          paymentIntentId: intent.id,
          expectedCapturedMinor: 12500,
          observedCapturedMinor: 12500,
          expectedRefundedMinor: 0,
          observedRefundedMinor: 0,
          result: 'MATCHED',
          reconciledAt: '2026-10-30T12:15:00Z',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ webhookEvents: [] }))
      .mockResolvedValueOnce(jsonResponse({ accepted: true }))

    await api.createIntent({
      amountMinor: 12500,
      currency: 'USD',
      description: 'Synthetic order',
      simulationOutcome: 'APPROVE',
    }, 'create-key-0001')
    await api.authorize(intent.id, 'authorize-key-01')
    await api.capture(intent.id, 'capture-key-001')
    await api.void(intent.id, 'void-key-00001')
    await api.refund(intent.id, 1000, 'Customer request', 'refund-key-001')
    await api.deliverWebhooks(intent.id)
    await api.reconcile(intent.id, 'reconcile-key-1')
    await api.webhooks(intent.id)
    await api.reportUiError()

    const calls = mockedFetch().mock.calls
    const createHeaders = new Headers(calls[0]?.[1]?.headers)
    expect(createHeaders.get('Idempotency-Key')).toBe('create-key-0001')
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      amountMinor: 12500,
      currency: 'USD',
      description: 'Synthetic order',
      simulationOutcome: 'APPROVE',
    })
    for (const index of [1, 2, 3, 6]) {
      expect(new Headers(calls[index]?.[1]?.headers).get('Idempotency-Key')).toBeTruthy()
    }
    expect(JSON.parse(String(calls[4]?.[1]?.body))).toEqual({
      amountMinor: 1000,
      reason: 'Customer request',
    })
    expect(calls[5]?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(calls[8]?.[1]?.body))).toEqual({ eventName: 'ui.error' })
  })

  it('maps structured and malformed error responses without trusting unvalidated bodies', async () => {
    mockedFetch()
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'ROLE_REQUIRED', message: 'Restricted', requestId: 'request-safe-01' },
      }, 403))
      .mockResolvedValueOnce(new Response('not json', {
        status: 503,
        headers: { 'X-Request-ID': 'request-header-01' },
      }))

    const structured = await api.overview().catch((cause: unknown) => cause)
    expect(structured).toBeInstanceOf(ApiError)
    expect(structured).toMatchObject({
      status: 403,
      code: 'ROLE_REQUIRED',
      requestId: 'request-safe-01',
      message: 'Restricted',
    })

    const malformed = await api.overview().catch((cause: unknown) => cause)
    expect(malformed).toBeInstanceOf(ApiError)
    expect(malformed).toMatchObject({
      status: 503,
      code: 'REQUEST_FAILED',
      requestId: 'request-header-01',
      message: 'The request could not be completed',
    })
  })

  it('rejects invalid successful payloads and preserves network failures', async () => {
    mockedFetch()
      .mockResolvedValueOnce(jsonResponse({ totalIntentCount: 'one' }))
      .mockRejectedValueOnce(new Error('offline'))

    await expect(api.overview()).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_RESPONSE',
      message: 'The server returned an invalid response',
    })
    await expect(api.overview()).rejects.toThrow('offline')
  })

  it('clears the CSRF token on logout and reports no-content errors safely', async () => {
    mockedFetch()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ accepted: true }))
    await api.csrf()
    await api.logout()
    await api.reportUiError()

    const postHeaders = new Headers(mockedFetch().mock.calls[1]?.[1]?.headers)
    const laterHeaders = new Headers(mockedFetch().mock.calls[2]?.[1]?.headers)
    expect(postHeaders.get('X-XSRF-TOKEN')).toBe('csrf-token')
    expect(laterHeaders.has('X-XSRF-TOKEN')).toBe(false)

    mockedFetch().mockResolvedValueOnce(jsonResponse({
      error: { code: 'ACCESS_DENIED', message: 'Blocked', requestId: 'request-no-content-01' },
    }, 403))
    const cause = await api.logout().catch((error: unknown) => error)
    expect(cause).toBeInstanceOf(ApiError)
    expect(cause).toMatchObject({ status: 403, code: 'ACCESS_DENIED', requestId: 'request-no-content-01' })

    mockedFetch().mockResolvedValueOnce(new Response('not json', { status: 502 }))
    const malformed = await api.logout().catch((error: unknown) => error)
    expect(malformed).toBeInstanceOf(ApiError)
    expect(malformed).toMatchObject({
      status: 502,
      code: 'REQUEST_FAILED',
      requestId: '',
      message: 'The request could not be completed',
    })
  })
})
