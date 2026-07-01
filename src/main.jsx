import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import NetworkingCRM from './NetworkingCRM.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NetworkingCRM />
  </StrictMode>,
)
