import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSignIn } from './WorkspaceSignIn'
import { renderWithContent } from '../test/renderWithContent'

afterEach(cleanup)

describe('workspace sign-in', () => {
  it('selects a known profile, reports errors, and submits the server-owned account ID', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn().mockResolvedValue(undefined)
    renderWithContent(
      <WorkspaceSignIn
        accounts={[
          { id: 'merchant-cedar', displayName: 'Untrusted API label', role: 'MERCHANT' },
          { id: 'operator', displayName: 'Morgan Patel', role: 'OPERATOR' },
        ]}
        error="Select a supported profile."
        busy={false}
        isMock={false}
        onLogin={onLogin}
      />,
    )

    expect(screen.getByRole('main')).toHaveAttribute('data-mode', 'server')
    expect(screen.getByRole('alert')).toHaveTextContent('Select a supported profile.')
    expect(screen.getByRole('combobox')).toHaveValue('merchant-cedar')
    expect(screen.getByRole('option', { name: 'Merchant · Casey Rivera' })).toBeVisible()

    await user.selectOptions(screen.getByRole('combobox'), 'operator')
    await user.click(screen.getByRole('button', { name: 'Continue to PayBridge' }))
    expect(onLogin).toHaveBeenCalledWith('operator')
  })

  it('disables sign-in for an empty account list and reflects the busy state', () => {
    const onLogin = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderWithContent(
      <WorkspaceSignIn accounts={[]} error="" busy={false} isMock onLogin={onLogin} />,
    )
    expect(screen.getByRole('main')).toHaveAttribute('data-mode', 'mock')
    expect(screen.getByRole('button', { name: 'Continue to PayBridge' })).toBeDisabled()

    rerender(
      <WorkspaceSignIn
        accounts={[{ id: 'merchant-northstar', displayName: 'Alex Morgan', role: 'MERCHANT' }]}
        error=""
        busy
        isMock
        onLogin={onLogin}
      />,
    )
    expect(screen.getByRole('button', { name: /Opening workspace/ })).toBeDisabled()
  })
})
