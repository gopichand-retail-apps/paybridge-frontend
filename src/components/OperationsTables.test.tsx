import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AuditEventsTable,
  PaymentStatusLegend,
  ReconciliationTable,
  WebhookEventsTable,
} from './OperationsTables'
import { auditEvent, reconciliation, webhookEvent } from '../test/fixtures'
import { renderWithContent } from '../test/renderWithContent'

afterEach(cleanup)

describe('operations tables', () => {
  it('shows empty states for webhooks, reconciliation, and audit history', () => {
    const { rerender } = renderWithContent(<WebhookEventsTable events={[]} />)
    expect(screen.getByText('No webhook events yet')).toBeVisible()
    expect(screen.getByText('New activity will appear here when the workflow runs.')).toBeVisible()

    rerender(
      <WebhookEventsTable events={[{ ...webhookEvent, signatureVerified: false }]} />,
    )
    expect(screen.getByText('Rejected')).toBeVisible()

    rerender(<ReconciliationTable rows={[]} />)
    expect(screen.getByText('No reconciliation runs')).toBeVisible()

    rerender(<AuditEventsTable events={[]} />)
    expect(screen.getByText('No audit events')).toBeVisible()
  })

  it('renders verified event, reconciliation, and both merchant and platform audit rows', () => {
    const { rerender } = renderWithContent(<WebhookEventsTable events={[webhookEvent]} />)
    expect(screen.getByText('Payment captured')).toBeVisible()
    expect(screen.getByText('Verified')).toBeVisible()
    expect(screen.getByText('$125.00')).toBeVisible()

    rerender(<ReconciliationTable rows={[reconciliation]} />)
    expect(screen.getByText('Matched')).toBeVisible()
    expect(screen.getAllByText('$125.00')).toHaveLength(2)

    rerender(
      <AuditEventsTable events={[
        auditEvent,
        { ...auditEvent, id: 'audit-platform', merchantId: null },
      ]} />,
    )
    expect(screen.getAllByText('Payment intent created')).toHaveLength(2)
    expect(screen.getAllByText('Alex Morgan')).toHaveLength(2)
    expect(screen.getByText('Northstar Goods')).toBeVisible()
    expect(screen.getByText('Platform')).toBeVisible()
  })

  it('renders the complete payment status legend', () => {
    renderWithContent(<PaymentStatusLegend />)
    expect(screen.getByLabelText('Payment statuses')).toBeVisible()
    expect(screen.getByText('Created')).toBeVisible()
    expect(screen.getByText('Authorized')).toBeVisible()
    expect(screen.getByText('Captured')).toBeVisible()
    expect(screen.getByText('Declined')).toBeVisible()
  })
})
