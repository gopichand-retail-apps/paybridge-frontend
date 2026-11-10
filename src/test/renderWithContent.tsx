import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ContentContext, type ContentContextValue } from '../content-context'
import { contentModelSchema, type ContentModel } from '../content-schema'
import paybridgeModel from '../../public/paybridge-model.json'

export const testModel = contentModelSchema.parse(paybridgeModel)

function createContentValue(model: ContentModel): ContentContextValue {
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
}

export function renderWithContent(element: ReactElement, model = testModel) {
  const value = createContentValue(model)
  const result = render(
    <ContentContext.Provider value={value}>
      {element}
    </ContentContext.Provider>,
  )

  return {
    ...result,
    rerender: (next: ReactElement) => result.rerender(
      <ContentContext.Provider value={value}>
        {next}
      </ContentContext.Provider>,
    ),
  }
}
