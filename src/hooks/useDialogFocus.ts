import { useEffect, useRef } from 'react'

const FOCUSABLE_ELEMENTS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogFocus<T extends HTMLElement>() {
  const dialogRef = useRef<T>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS))
    focusable[0]?.focus()

    function keepFocusInside(event: KeyboardEvent): void {
      if (event.key !== 'Tab' || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const focusIsOutside = !dialog.contains(document.activeElement)

      if ((event.shiftKey && document.activeElement === first) || (event.shiftKey && focusIsOutside)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
        event.preventDefault()
        first?.focus()
      }
    }

    dialog.addEventListener('keydown', keepFocusInside)
    return () => {
      dialog.removeEventListener('keydown', keepFocusInside)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return dialogRef
}