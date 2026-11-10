import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ContentProvider } from './content'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContentProvider appId="paybridge" modelUrl="/paybridge-model.json">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ContentProvider>
  </StrictMode>,
)
