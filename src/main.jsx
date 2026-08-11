import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import NetworkingCRM from './NetworkingCRM.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('index.html is missing the #root element the app mounts into')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <NetworkingCRM />
    </ErrorBoundary>
  </StrictMode>,
)
