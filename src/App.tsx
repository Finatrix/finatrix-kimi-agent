import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary'

// Route-level code-splitting: each page (and its heavy deps like GSAP/Lenis or
// the Supabase-backed tools) loads only when its route is visited.
const Home = lazy(() => import('./pages/Home'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Profile = lazy(() => import('./pages/Profile'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const NotFound = lazy(() => import('./pages/NotFound'))

function RouteFallback() {
  return <div className="min-h-screen bg-[#060607]" aria-hidden="true" />
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* Legacy route — the landing page now lives at "/". */}
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
