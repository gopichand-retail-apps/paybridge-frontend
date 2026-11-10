import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

function FocusDialog({ empty = false }: { empty?: boolean }) {
  const ref = useDialogFocus<HTMLDivElement>()
  return (
    <div ref={ref} role="dialog" aria-label="Test dialog">
      {!empty && (
        <>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </>
      )}
    </div>
  )
}

describe('dialog focus management', () => {
  it('moves focus into the dialog, traps tab navigation, and restores prior focus', () => {
    render(<button type="button">Outside action</button>)
    const outside = screen.getByRole('button', { name: 'Outside action' })
    outside.focus()

    const view = render(<FocusDialog />)
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    const first = screen.getByRole('button', { name: 'First action' })
    const last = screen.getByRole('button', { name: 'Last action' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    outside.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(document.activeElement).toBe(last)
    view.unmount()
    expect(document.activeElement).toBe(outside)
  })

  it('does not trap other keys or dialogs without focusable controls', () => {
    const view = render(<FocusDialog empty />)
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    fireEvent.keyDown(dialog, { key: 'Enter' })
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(dialog).toBeInTheDocument()
    view.unmount()

    function NoDialog() {
      useDialogFocus<HTMLDivElement>()
      return null
    }

    render(<NoDialog />)
  })

  it('does not try to restore focus to a disconnected element', () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()

    const view = render(<FocusDialog />)
    outside.remove()
    view.unmount()

    expect(document.body).toBeInTheDocument()
  })
})
