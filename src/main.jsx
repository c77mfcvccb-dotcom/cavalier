import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { FournisseurAuth } from './contexte/AuthContexte'
import './styles.css'

// Service worker : notifications locales de rappel + installabilité de la PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn("Service worker non enregistré", e)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <FournisseurAuth>
        <App />
      </FournisseurAuth>
    </BrowserRouter>
  </React.StrictMode>
)
