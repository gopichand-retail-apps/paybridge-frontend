import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('react-dom/client')
  vi.doUnmock('./App.tsx')
  vi.resetModules()
  document.body.innerHTML = ''
})

describe('application entry point', () => {
  it('mounts the strict-mode content provider and error boundary on the root element', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const renderTree = vi.fn<(element: ReactNode) => void>()
    const createRoot = vi.fn(() => ({ render: renderTree }))
    vi.doMock('react-dom/client', () => ({ createRoot }))
    vi.doMock('./App.tsx', () => ({ default: () => null }))

    await import('./main')

    expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'))
    expect(renderTree).toHaveBeenCalledTimes(1)
    const tree = renderTree.mock.calls[0]?.[0]
    expect(tree).toMatchObject({ type: StrictMode })
  })
})
