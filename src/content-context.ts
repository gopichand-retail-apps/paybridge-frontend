import { createContext, useContext } from 'react'
import type { ContentModel, Translate } from './content-schema'

export type ContentContextValue = { model: ContentModel; t: Translate }

export const ContentContext = createContext<ContentContextValue | null>(null)

export function useContent(): ContentContextValue {
  const value = useContext(ContentContext)
  if (!value) throw new Error('CONTENT_PROVIDER_MISSING')
  return value
}