import type {
  AuditEvent,
  Overview,
  PaymentIntent,
  Reconciliation,
  SessionUser,
  WebhookEvent,
} from '../api'

export const merchantUser: SessionUser = {
  id: 'user-merchant-01',
  displayName: 'Alex Morgan',
  role: 'MERCHANT',
  merchantId: 'merchant-demo-01',
}

export const operatorUser: SessionUser = {
  id: 'user-operator-01',
  displayName: 'Morgan Patel',
  role: 'OPERATOR',
  merchantId: null,
}

export const auditorUser: SessionUser = {
  id: 'user-auditor-01',
  displayName: 'Sam Rivera',
  role: 'AUDITOR',
  merchantId: null,
}

const defaultIntent: PaymentIntent = {
  id: 'intent-demo-created',
  merchantId: 'merchant-demo-01',
  merchantName: 'API merchant label',
  amountMinor: 12500,
  currency: 'USD',
  description: 'API payment description',
  status: 'CREATED',
  simulationOutcome: 'APPROVE',
  capturedAmountMinor: 0,
  refundedAmountMinor: 0,
  webhookEventCount: 0,
  latestReconciliationResult: null,
  createdAt: '2026-10-30T12:00:00Z',
  updatedAt: '2026-10-30T12:00:00Z',
  authorizedAt: null,
  capturedAt: null,
}

export function paymentIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return { ...defaultIntent, ...overrides }
}

export const overview: Overview = {
  totalIntentCount: 1,
  capturedAmountMinor: 0,
  refundedAmountMinor: 0,
  awaitingAuthorizationCount: 1,
  declinedCount: 0,
  pendingWebhookCount: 0,
  reconciliationMismatchCount: 0,
  capturedIntentCount: 0,
  authorizedIntentCount: 0,
}

export const webhookEvent: WebhookEvent = {
  eventId: 'event-demo-capture',
  paymentIntentId: 'intent-demo-captured',
  eventType: 'PAYMENT_CAPTURED',
  amountMinor: 12500,
  signatureVerified: true,
  receivedAt: '2026-10-30T12:10:00Z',
}

export const reconciliation: Reconciliation = {
  id: 'reconciliation-demo-01',
  paymentIntentId: 'intent-demo-captured',
  expectedCapturedMinor: 12500,
  observedCapturedMinor: 12500,
  expectedRefundedMinor: 0,
  observedRefundedMinor: 0,
  result: 'MATCHED',
  reconciledAt: '2026-10-30T12:15:00Z',
}

export const auditEvent: AuditEvent = {
  id: 'audit-demo-01',
  actorId: 'user-merchant-01',
  merchantId: 'merchant-demo-01',
  eventName: 'payment_intent.created',
  entityType: 'payment_intent',
  entityId: 'intent-demo-created',
  createdAt: '2026-10-30T12:00:00Z',
}
