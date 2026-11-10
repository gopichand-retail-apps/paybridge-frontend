import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentProvider } from './content'
import { useContent } from './content-context'
import type { Translate } from './content-schema'
import { testModel } from './test/renderWithContent'

function ContentProbe({ onTranslate }: { onTranslate?: (translate: Translate) => void }) {
  const { t } = useContent()
  onTranslate?.(t)
  return <p>{t('app.localProcessing')}</p>
}

function renderProvider(modelUrl = '/paybridge-model.json', appId = 'paybridge') {
  return render(
    <ContentProvider appId={appId} modelUrl={modelUrl}>
      <ContentProbe />
    </ContentProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.querySelector('meta[name="description"]')?.remove()
})

describe('content provider', () => {
  it('fetches without caching, updates document metadata, and interpolates model copy', async () => {
    const meta = document.createElement('meta')
    meta.name = 'description'
    document.head.append(meta)

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(testModel), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    let translate: Translate = () => ''

    render(
      <ContentProvider appId="paybridge" modelUrl="/paybridge-model.json">
        <ContentProbe onTranslate={(value) => { translate = value }} />
      </ContentProvider>,
    )

    expect(await screen.findByText('Local processing')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith('/paybridge-model.json', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    })
    expect(document.documentElement.lang).toBe('en-US')
    expect(document.title).toBe('PayBridge | Payment operations')
    expect(meta.content).toContain('Synthetic payment')
    expect(translate('app.welcome', { role: 'merchant' })).toBe('Welcome to the merchant workspace.')
    expect(() => translate('unknown.message')).toThrow('CONTENT_KEY_MISSING:unknown.message')
    expect(() => translate('app.welcome')).toThrow('CONTENT_VALUE_MISSING:role')
  })

  it.each([
    ['non-success response', 503, testModel, 'paybridge'],
    ['invalid schema', 200, { ...testModel, version: 2 }, 'paybridge'],
    ['mismatched application', 200, testModel, 'another-app'],
    ['missing title', 200, {
      ...testModel,
      messages: Object.fromEntries(Object.entries(testModel.messages).filter(([key]) => key !== 'meta.title')),
    }, 'paybridge'],
    ['missing description', 200, {
      ...testModel,
      messages: Object.fromEntries(
        Object.entries(testModel.messages).filter(([key]) => key !== 'meta.description'),
      ),
    }, 'paybridge'],
  ])('fails closed for a %s model response', async (_label, status, model, appId) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(model), { status }),
    ))

    renderProvider('/model.json', appId)

    expect(await screen.findByRole('alert')).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByText('Local processing')).not.toBeInTheDocument()
  })

  it('stays in loading state while the model is pending and aborts a replaced provider', async () => {
    let signal: AbortSignal | undefined
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>(() => undefined)
    })
    vi.stubGlobal('fetch', fetchMock)

    const view = renderProvider()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    view.unmount()

    expect(signal?.aborted).toBe(true)
  })

  it('does not render a content context outside its provider', () => {
    function MissingProviderProbe() {
      return <p>{useContent().t('app.localProcessing')}</p>
    }

    expect(() => render(<MissingProviderProbe />)).toThrow('CONTENT_PROVIDER_MISSING')
  })
})
