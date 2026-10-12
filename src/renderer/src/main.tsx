import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/components.css'
import './styles/app.css'

const root = document.getElementById('root')
if (!root) throw new Error('Wurzelelement fehlt')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
