import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles/tokens.css' // canonical design tokens — must load before index.css
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { initAnalytics } from './lib/analytics'
import { initWebVitals } from './lib/webVitals'
import { initErrorReporting } from './lib/errorReporting'
import { initActivityTracking } from './tools/lib/activity'
import { registerServiceWorker } from './lib/serviceWorker'

// Privacy-first observability. Each initialiser is a no-op unless an analytics
// endpoint is configured AND the user has not opted out (DNT / GPC).
initAnalytics()
initWebVitals()
initErrorReporting()
initActivityTracking()

// Offline support. The money tools keep their data in localStorage, so once the
// shell is cached the whole of Budget, Expenses and Goals works with no
// connection at all — which is the point: people check their spending on the
// move, where the connection is worst.
registerServiceWorker()

// Preconnect to Supabase so the first authenticated request skips DNS/TLS
// setup. Done here (not index.html) because the URL comes from the env.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
if (supabaseUrl) {
  try {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = new URL(supabaseUrl).origin
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  } catch {
    // A malformed URL just means no preconnect hint — never block boot.
  }
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>,
)
