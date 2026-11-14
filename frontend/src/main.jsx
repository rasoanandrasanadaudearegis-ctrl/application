import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Acces from './Acces.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Acces />
  </StrictMode>,
)
