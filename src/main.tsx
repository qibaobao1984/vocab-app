import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadVoices } from './lib/tts'

preloadVoices()
if (typeof window !== 'undefined') {
  const init = () => {
    preloadVoices()
    window.removeEventListener('pointerdown', init)
    window.removeEventListener('keydown', init)
  }
  window.addEventListener('pointerdown', init, { once: false })
  window.addEventListener('keydown', init, { once: false })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
