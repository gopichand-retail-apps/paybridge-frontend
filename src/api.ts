import { apiModeConfiguration, resolveApiRequest } from './config'
import { z } from 'zod'

const API_PREFIX = '/api/v1'

export const appRoleSchema = z.enum(['MERCHANT', 'OPERATOR', 'AUDITOR'])
const accountSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: appRoleSchema,
})
const userSchema = accountSchema.extend({
  merchantId: z.string().nullable(),
})
const paymentStatusSchema = z.enum([
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'VOIDED',
  'DECLINED',
])
const outcomeSchema = z.enum(['APPROVE', 'DECLINE'])
const paymentIntentSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  amountMinor: z.number().int(),
  currency: z.literal('USD'),
  description: z.string(),
  status: paymentStatusSchema,
  simulationOutcome: outcomeSchema,
  capturedAmountMinor: z.number().int(),
  refundedAmountMinor: z.number().int(),
  webhookEventCount: z.number().int(),
  latestReconciliationResult: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  authorizedAt: z.string().nullable(),
  capturedAt: z.string().nullable(),
})
const overviewSchema = z.object({
  totalIntentCount: z.number().int(),
  capturedAmountMinor: z.number().int(),
  refundedAmountMinor: z.number().int(),
  awaitingAuthorizationCount: z.number().int(),
  declinedCount: z.number().int(),
  pendingWebhookCount: z.number().int(),
  reconciliationMismatchCount: z.number().int(),
  capturedIntentCount: z.number().int(),
  authorizedIntentCount: z.number().int(),
})
const webhookEventSchema = z.object({
  eventId: z.string(),
  paymentIntentId: z.string(),
  eventType: z.string(),
  amountMinor: z.number().int(),
  signatureVerified: z.boolean(),
  receivedAt: z.string(),
})
const reconciliationSchema = z.object({
  id: z.string(),
  paymentIntentId: z.string(),
  expectedCapturedMinor: z.number().int(),
  observedCapturedMinor: z.number().int(),
  expectedRefundedMinor: z.number().int(),
  observedRefundedMinor: z.number().int(),
  result: z.enum(['MATCHED', 'MISMATCH', 'PENDING']),
  reconciledAt: z.string(),
})
const auditEventSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  merchantId: z.string().nullable(),
  eventName: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  createdAt: z.string(),
})
const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
})
const responseSchemas = {
  csrf: z.object({ token: z.string() }),
  accounts: z.object({ accounts: z.array(accountSchema) }),
  user: z.object({ user: userSchema, localProfileSession: z.boolean() }),
  payments: z.object({ paymentIntents: z.array(paymentIntentSchema) }),
  payment: z.object({ paymentIntent: paymentIntentSchema, duplicate: z.boolean() }),
  overview: overviewSchema,
  webhooks: z.object({ webhookEvents: z.array(webhookEventSchema) }),
  deliveries: z.object({ deliveries: z.array(z.object({
    eventId: z.string(),
    duplicate: z.boolean(),
    signatureVerified: z.boolean(),
    status: z.string(),
  })) }),
  reconciliations: z.object({ reconciliations: z.array(reconciliationSchema) }),
  reconciliation: z.object({ reconciliation: reconciliationSchema }),
  audits: z.object({ auditEvents: z.array(auditEventSchema) }),
  uiError: z.object({ accepted: z.boolean() }),
}

export type AppRole = z.infer<typeof appRoleSchema>
export type WorkspaceProfile = z.infer<typeof accountSchema>
export type SessionUser = z.infer<typeof userSchema>
export type PaymentStatus = z.infer<typeof paymentStatusSchema>
export type SimulationOutcome = z.infer<typeof outcomeSchema>
export type PaymentIntent = z.infer<typeof paymentIntentSchema>
export type Overview = z.infer<typeof overviewSchema>
export type WebhookEvent = z.infer<typeof webhookEventSchema>
export type Reconciliation = z.infer<typeof reconciliationSchema>
export type AuditEvent = z.infer<typeof auditEventSchema>
export type CreateIntentRequest = {
  amountMinor: number
  currency: 'USD'
  description: string
  simulationOutcome: SimulationOutcome
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string

  constructor(
    message: string,
    status: number,
    code: string,
    requestId: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

let csrfToken = ''

async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.output<T>> {
  const headers = new Headers(init.headers)
  headers.set('X-Request-ID', crypto.randomUUID())
  headers.set('X-Trace-ID', crypto.randomUUID())
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (init.method && init.method !== 'GET' && csrfToken) headers.set('X-XSRF-TOKEN', csrfToken)

  const target = resolveApiRequest(path, apiModeConfiguration)
  const response = await fetch(target.url, {
    ...init,
    headers,
    credentials: target.credentials,
  })
  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    const parsedError = errorSchema.safeParse(payload)
    const details = parsedError.success ? parsedError.data.error : null
    throw new ApiError(
      details?.message ?? 'The request could not be completed',
      response.status,
      details?.code ?? 'REQUEST_FAILED',
      details?.requestId ?? response.headers.get('X-Request-ID') ?? '',
    )
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiError('The server returned an invalid response', 502, 'INVALID_RESPONSE', '')
  }
  return parsed.data
}

async function requestNoContent(path: string, init: RequestInit): Promise<void> {
  const headers = new Headers(init.headers)
  headers.set('X-Request-ID', crypto.randomUUID())
  headers.set('X-Trace-ID', crypto.randomUUID())
  if (init.method && init.method !== 'GET' && csrfToken) headers.set('X-XSRF-TOKEN', csrfToken)
  const target = resolveApiRequest(path, apiModeConfiguration)
  const response = await fetch(target.url, { ...init, headers, credentials: target.credentials })
  if (response.ok) return

  const payload: unknown = await response.json().catch(() => undefined)
  const parsedError = errorSchema.safeParse(payload)
  const details = parsedError.success ? parsedError.data.error : null
  throw new ApiError(
    details?.message ?? 'The request could not be completed',
    response.status,
    details?.code ?? 'REQUEST_FAILED',
    details?.requestId ?? response.headers.get('X-Request-ID') ?? '',
  )
}

function encodeQuery(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export const api = {
  csrf: async () => {
    const result = await request(`${API_PREFIX}/auth/csrf`, responseSchemas.csrf)
    csrfToken = result.token
  },
  profiles: () => request(`${API_PREFIX}/auth/profiles`, responseSchemas.accounts),
  login: (accountId: string) => request(`${API_PREFIX}/auth/profile-login`, responseSchemas.user, {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  }),
  currentUser: () => request(`${API_PREFIX}/auth/me`, responseSchemas.user),
  logout: async () => {
    await requestNoContent(`${API_PREFIX}/auth/logout`, { method: 'POST' })
    csrfToken = ''
  },
  overview: () => request(`${API_PREFIX}/overview`, responseSchemas.overview),
  payments: (filters: { status?: string; q?: string; limit?: number } = {}) => request(
    `${API_PREFIX}/payment-intents${encodeQuery(filters)}`,
    responseSchemas.payments,
  ),
  payment: (id: string) => request(
    `${API_PREFIX}/payment-intents/${encodeURIComponent(id)}`,
    responseSchemas.payment,
  ),
  createIntent: (body: CreateIntentRequest, idempotencyKey: string) => request(
    `${API_PREFIX}/payment-intents`,
    responseSchemas.payment,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    },
  ),
  authorize: (id: string, idempotencyKey: string) => action(id, 'authorize', idempotencyKey),
  capture: (id: string, idempotencyKey: string) => action(id, 'capture', idempotencyKey),
  void: (id: string, idempotencyKey: string) => action(id, 'void', idempotencyKey),
  refund: (id: string, amountMinor: number, reason: string, idempotencyKey: string) => request(
    `${API_PREFIX}/payment-intents/${encodeURIComponent(id)}/refunds`,
    responseSchemas.payment,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amountMinor, reason }),
    },
  ),
  deliverWebhooks: (id: string) => request(
    `${API_PREFIX}/payment-intents/${encodeURIComponent(id)}/webhook-deliveries`,
    responseSchemas.deliveries,
    { method: 'POST' },
  ),
  reconcile: (id: string, idempotencyKey: string) => request(
    `${API_PREFIX}/payment-intents/${encodeURIComponent(id)}/reconcile`,
    responseSchemas.reconciliation,
    { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
  ),
  webhooks: (intentId?: string) => request(
    `${API_PREFIX}/webhook-events${encodeQuery({ intentId, limit: 100 })}`,
    responseSchemas.webhooks,
  ),
  reconciliations: () => request(`${API_PREFIX}/reconciliations?limit=100`, responseSchemas.reconciliations),
  auditEvents: () => request(`${API_PREFIX}/audit-events?limit=100`, responseSchemas.audits),
  reportUiError: () => request(`${API_PREFIX}/client-errors`, responseSchemas.uiError, {
    method: 'POST',
    body: JSON.stringify({ eventName: 'ui.error' }),
  }),
}

function action(id: string, operation: string, idempotencyKey: string) {
  return request(
    `${API_PREFIX}/payment-intents/${encodeURIComponent(id)}/${operation}`,
    responseSchemas.payment,
    { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
  )
}