import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'

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
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
)
