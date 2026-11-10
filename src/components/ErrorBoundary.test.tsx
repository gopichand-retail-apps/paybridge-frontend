import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ErrorBoundary } from './ErrorBoundary'
import { renderWithContent } from '../test/renderWithContent'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('error boundary', () => {
  it('shows a content-model fallback and sends only the minimal UI error event', async () => {
    const report = vi.spyOn(api, 'reportUiError').mockRejectedValue(new Error('offline'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function BrokenView(): never {
      throw new Error('test-only rendering failure')
    }

    renderWithContent(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('PayBridge hit an unexpected error.')
    expect(screen.getByText('A minimal error event was sent without browser details or payment data.'))
      .toBeVisible()
    expect(report).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalled()
  })

  it('renders no copy without a content provider after catching a child error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function BrokenView(): never {
      throw new Error('test-only rendering failure')
    }

    const { container } = render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })
})
