import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary'
import LoginReminderModal from './components/LoginReminderModal'
import RouteFallback from './components/RouteFallback'
import { trackPageView } from './lib/analytics'
import { applySeo } from './lib/seo'

// Route-level code-splitting: each page (and its heavy deps like the
// Supabase-backed tools) loads only when its route is visited.
const Home = lazy(() => import('./pages/Home'))
const ToolsLayout = lazy(() => import('./tools/ToolsLayout'))
const ToolsIndex = lazy(() => import('./tools/ToolsIndex'))
const ToolRoute = lazy(() => import('./tools/ToolRoute'))
const Dashboard = lazy(() => import('./tools/pages/DashboardPage'))
const CareersLayout = lazy(() => import('./careers/CareersLayout'))
const CareersDashboard = lazy(() => import('./careers/pages/CareersDashboard'))
const CareersUpload = lazy(() => import('./careers/pages/CareersUpload'))
const ResumeLibrary = lazy(() => import('./careers/pages/ResumeLibrary'))
const JobsPage = lazy(() => import('./careers/pages/JobsPage'))
const ApplicationsPage = lazy(() => import('./careers/pages/ApplicationsPage'))
const CompaniesPage = lazy(() => import('./careers/pages/CompaniesPage'))
const CompanyIntelPage = lazy(() => import('./careers/pages/CompanyIntelPage'))
const CompanyProfilePage = lazy(() => import('./careers/pages/CompanyProfilePage'))
const InterviewPrepPage = lazy(() => import('./careers/pages/InterviewPrepPage'))
const CareerCoachPage = lazy(() => import('./careers/pages/CareerCoachPage'))
const CareerProfilePage = lazy(() => import('./careers/pages/CareerProfilePage'))
const CareersSettings = lazy(() => import('./careers/pages/CareersSettings'))
const TasksPage = lazy(() => import('./careers/pages/TasksPage'))
const RecruitersPage = lazy(() => import('./careers/pages/RecruitersPage'))
const NetworkPage = lazy(() => import('./careers/pages/NetworkPage'))
const AssessmentsPage = lazy(() => import('./careers/pages/AssessmentsPage'))
const OffersPage = lazy(() => import('./careers/pages/OffersPage'))
const KnowledgeBasePage = lazy(() => import('./careers/pages/KnowledgeBasePage'))
const BillingPage = lazy(() => import('./careers/pages/BillingPage'))
const AdminDashboard = lazy(() => import('./careers/pages/AdminDashboard'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Profile = lazy(() => import('./pages/Profile'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const NotFound = lazy(() => import('./pages/NotFound'))

/**
 * Applies the route's identity on every client-side navigation: analytics, then
 * the full head — title, description, canonical, robots, Open Graph, Twitter
 * card and per-route JSON-LD.
 *
 * All of it comes from `seoForPath`, the same pure function the edge Worker uses
 * to write these values into the served bytes. The per-route title map that used
 * to live here (and a second, overlapping copy in `ToolRoute.tsx`) now lives
 * there too — one map instead of three that had to agree by hand.
 */
function RouteMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    // Privacy-first page view (route template only — never the raw URL).
    trackPageView(pathname)
    applySeo(pathname)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-[#D4AF37] focus:px-4 focus:py-2 focus:font-mono focus:text-[12px] focus:text-black"
      >
        Skip to content
      </a>
      <RouteMetadata />
      <Suspense fallback={<RouteFallback />}>
        {/* The single `main` landmark for the whole app (WCAG 1.3.1). This was
            a plain <div>, which gave screen-reader users no way to jump to the
            content and made the skip link above a no-op — a <div> cannot
            receive focus, so activating it moved the caret nowhere. `tabIndex
            -1` makes it a valid programmatic focus target without adding it to
            the tab order. */}
        <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* Legacy route — the landing page now lives at "/". */}
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/tools" element={<ToolsLayout />}>
            <Route index element={<ToolsIndex />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path=":toolId" element={<ToolRoute />} />
          </Route>
          {/* Clean top-level alias for the hub. */}
          <Route path="/dashboard" element={<Navigate to="/tools/dashboard" replace />} />
          <Route path="/careers" element={<CareersLayout />}>
            <Route index element={<CareersDashboard />} />
            <Route path="dashboard" element={<CareersDashboard />} />
            <Route path="upload" element={<CareersUpload />} />
            <Route path="resumes" element={<ResumeLibrary />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="intelligence" element={<CompanyIntelPage />} />
            <Route path="intelligence/company" element={<CompanyProfilePage />} />
            <Route path="recruiters" element={<RecruitersPage />} />
            <Route path="network" element={<NetworkPage />} />
            <Route path="interviews" element={<InterviewPrepPage />} />
            <Route path="assessments" element={<AssessmentsPage />} />
            <Route path="offers" element={<OffersPage />} />
            <Route path="knowledge" element={<KnowledgeBasePage />} />
            <Route path="coach" element={<CareerCoachPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="profile" element={<CareerProfilePage />} />
            <Route path="settings" element={<CareersSettings />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </main>
      </Suspense>
      <LoginReminderModal />
    </ErrorBoundary>
  )
}
