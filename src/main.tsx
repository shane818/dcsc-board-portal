import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './app.css'
import { org } from './config/org'

// Inject org accent color as a CSS variable so Tailwind's dcsc-red classes
// render the correct color for whichever org this deployment is for.
document.documentElement.style.setProperty('--org-accent', org.accentColor)
document.title = `${org.shortName} Board Portal`

// Set per-org favicon dynamically so each Vercel deployment shows its own icon.
const faviconEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (faviconEl) {
  faviconEl.href = org.faviconPath
  faviconEl.type = org.faviconPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
