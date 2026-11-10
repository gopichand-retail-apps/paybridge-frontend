import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ContentContext } from './content-context'
import type { ContentContextValue } from './content-context'
import { contentModelSchema, type ContentModel } from './content-schema'

type ContentProviderProps = { appId: string; modelUrl: string; children: ReactNode }

export function ContentProvider({ appId, modelUrl, children }: ContentProviderProps) {
  const [model, setModel] = useState<ContentModel | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(modelUrl, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('CONTENT_MODEL_REQUEST_FAILED')
        const payload: unknown = await response.json()
        const parsed = contentModelSchema.safeParse(payload)
        if (!parsed.success || parsed.data.appId !== appId) throw new Error('CONTENT_MODEL_INVALID')
        if (!parsed.data.messages['meta.title'] || !parsed.data.messages['meta.description']) {
          throw new Error('CONTENT_MODEL_METADATA_MISSING')
        }
        return parsed.data
      })
      .then((contentModel) => {
        document.documentElement.lang = contentModel.locale
        document.title = contentModel.messages['meta.title']
        const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
        if (description) description.content = contentModel.messages['meta.description']
        setModel(contentModel)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true)
      })
    return () => controller.abort()
  }, [appId, modelUrl])

  const value = useMemo<ContentContextValue | null>(() => {
    if (!model) return null
    return {
      model,
      t: (key, values = {}) => {
        const template = model.messages[key]
        if (template === undefined) throw new Error(`CONTENT_KEY_MISSING:${key}`)
        return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, name: string) => {
          const replacement = values[name]
          if (replacement === undefined) throw new Error(`CONTENT_VALUE_MISSING:${name}`)
          return String(replacement)
        })
      },
    }
  }, [model])

  if (!model || !value) {
    return (
      <main className="boot-screen" role={loadFailed ? 'alert' : 'status'} aria-busy={!loadFailed}>
        {!loadFailed && <span className="brand-mark" aria-hidden="true" />}
      </main>
    )
  }

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}