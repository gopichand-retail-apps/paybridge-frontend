import { Component, type ReactNode } from 'react'
import { api } from '../api'
import { ContentContext } from '../content-context'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(): void {
    void api.reportUiError().catch(() => undefined)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ContentContext.Consumer>
          {(content) => content && (
            <main className="fatal-error-screen" role="alert">
              <span className="eyebrow">{content.t('errorBoundary.eyebrow')}</span>
              <h1>{content.t('errorBoundary.title')}</h1>
              <p>{content.t('errorBoundary.description')}</p>
              <button className="primary-button" onClick={() => window.location.reload()} type="button">
                {content.t('app.reload')}
              </button>
            </main>
          )}
        </ContentContext.Consumer>
      )
    }
    return this.props.children
  }
}