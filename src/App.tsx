import { lazy, Suspense, useEffect, type ReactElement } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary'
import LoginReminderModal from './components/LoginReminderModal'
import RouteFallback from './components/RouteFallback'
import { useScrollRestoration } from './hooks/useScrollRestoration'
import { trackPageView } from './lib/analytics'
import { applySeo } from './lib/seo'
import { RESET_PASSWORD_PATH } from './shared/routes'
import NativeShell from './native/NativeShell'
import KeyboardBar from './components/KeyboardBar'
import { canPurchaseInApp, isNativeApp } from './native/platform'

// Route-level code-splitting: each page (and its heavy deps like the
// Supabase-backed tools) loads only when its route is visited.
const Home = lazy(() => import('./pages/Home'))
const ToolsLayout = lazy(() => import('./tools/ToolsLayout'))
const ToolsIndex = lazy(() => import('./tools/ToolsIndex'))
const ToolRoute = lazy(() => import('./tools/ToolRoute'))
const Dashboard = lazy(() => import('./tools/pages/DashboardPage'))
const CareersAvailability = lazy(() => import('./pages/careers/CareersAvailability'))
const CareersLayout = lazy(() => import('./careers/CareersLayout'))
const CareersDashboard = lazy(() => import('./careers/pages/CareersDashboard'))
const CareersUpload = lazy(() => import('./careers/pages/CareersUpload'))
const ResumeLibrary = lazy(() => import('./careers/pages/ResumeLibrary'))
const JobsPage = lazy(() => import('./careers/pages/JobsPage'))
const MatchQueuePage = lazy(() => import('./careers/pages/MatchQueuePage'))
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
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Profile = lazy(() => import('./pages/Profile'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const NotFound = lazy(() => import('./pages/NotFound'))

// Public marketing + trust surface. Every one of these is registered in
// src/shared/publicPages.ts, which is what makes it indexable, gives it a
// canonical URL and puts it in sitemap.xml; adding a route here without an
// entry there fails `publicPages.test.ts` rather than shipping an orphan page.
const Pricing = lazy(() => import('./pages/marketing/Pricing'))
const About = lazy(() => import('./pages/marketing/About'))
const Faq = lazy(() => import('./pages/marketing/Faq'))
const Help = lazy(() => import('./pages/marketing/Help'))
const Support = lazy(() => import('./pages/marketing/Support'))
const Contact = lazy(() => import('./pages/marketing/Contact'))
const Security = lazy(() => import('./pages/marketing/Security'))
const Refunds = lazy(() => import('./pages/marketing/Refunds'))
const EditorialStandards = lazy(() => import('./pages/marketing/EditorialStandards'))
const CompareAlternative = lazy(() => import('./pages/marketing/Compare'))
const CompareIndex = lazy(() =>
  import('./pages/marketing/Compare').then((m) => ({ default: m.CompareIndex })),
)
const CompanyPage = lazy(() => import('./pages/marketing/Companies'))
const CompaniesIndex = lazy(() =>
  import('./pages/marketing/Companies').then((m) => ({ default: m.CompaniesIndex })),
)
const CareersLanding = lazy(() => import('./pages/careers/CareersLanding'))
const CareersFeatures = lazy(() => import('./pages/careers/CareersFeatures'))
const CareersCompare = lazy(() => import('./pages/careers/CareersCompare'))
const CareersCompareIndex = lazy(() =>
  import('./pages/careers/CareersCompare').then((m) => ({ default: m.CareersCompareIndex })),
)

// The knowledge layer. Every URL it serves is registered in
// src/shared/content.ts, which is what makes it indexable, gives it a canonical
// and puts it in sitemap.xml — and what makes the edge Worker answer 404 for any
// /learn URL that is NOT registered, rather than rendering a soft 404.
const LearnHub = lazy(() => import('./learn/LearnHub'))
const TopicPage = lazy(() => import('./learn/TopicPage'))
const ArticlePage = lazy(() => import('./learn/ArticlePage'))

/**
 * A page that exists to sell, which the Android app replaces with the screen
 * a member actually uses.
 *
 * Google Play forbids an app from offering, pricing or linking to a purchase
 * made outside Play Billing (see `canPurchaseInApp`). The pricing page and the
 * Careers marketing pages are all price tables and purchase CTAs, so in the app
 * they resolve to the member-facing screen instead of a dead end. The website
 * is unaffected.
 */
const CAREERS_HOME = '/careers/dashboard'
function webOnly(page: ReactElement, appDestination: string): ReactElement {
  return canPurchaseInApp() ? page : <Navigate to={appDestination} replace />
}

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

/**
 * Where each navigation lands: top for a new page, the saved offset for
 * back/forward, the target element for a `#fragment`. A leaf component rather
 * than a hook call in `App` so that subscribing to the location does not
 * re-render the whole route table on every navigation.
 * See hooks/useScrollRestoration.ts.
 */
function ScrollManager() {
  useScrollRestoration()
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
      <ScrollManager />
      <NativeShell />
      <KeyboardBar />
      <Suspense fallback={<RouteFallback />}>
        {/* The single `main` landmark for the whole app (WCAG 1.3.1). This was
            a plain <div>, which gave screen-reader users no way to jump to the
            content and made the skip link above a no-op — a <div> cannot
            receive focus, so activating it moved the caret nowhere. `tabIndex
            -1` makes it a valid programmatic focus target without adding it to
            the tab order. */}
        <main id="main" tabIndex={-1}>
        <Routes>
          {/* The app opens on the product, not the marketing page that sells
              it — someone who installed FinatriX has already been sold. */}
          <Route path="/" element={isNativeApp() ? <Navigate to="/tools/dashboard" replace /> : <Home />} />
          {/* Legacy route — the landing page now lives at "/". */}
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/tools" element={<ToolsLayout />}>
            <Route index element={<ToolsIndex />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path=":toolId" element={<ToolRoute />} />
          </Route>
          {/* Clean top-level alias for the hub. */}
          <Route path="/dashboard" element={<Navigate to="/tools/dashboard" replace />} />

          {/* ── Public marketing + trust surface ──────────────────────────
              These render the landing chrome, are indexable, and are the only
              way an anonymous visitor can evaluate or price the paid product. */}
          <Route path="/pricing" element={webOnly(<Pricing />, '/careers/billing')} />
          <Route path="/about" element={<About />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/help" element={<Help />} />
          <Route path="/support" element={<Support />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/security" element={<Security />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/editorial-standards" element={<EditorialStandards />} />

          {/* The money-tool comparison surface. Distinct from /careers/compare,
              which compares job platforms — see the note in publicPages.ts. */}
          <Route path="/compare" element={<CompareIndex />} />
          <Route path="/compare/:alternative" element={<CompareAlternative />} />

          {/* Company intelligence. At the root rather than under /careers,
              because /careers/companies is already a gated app section. */}
          <Route path="/companies" element={<CompaniesIndex />} />
          <Route path="/companies/:company" element={<CompanyPage />} />

          {/* ── The knowledge layer ───────────────────────────────────────
              A hub, a page per topic, and a page per article. The two
              parameterised routes render the real NotFound page for a slug
              that is not registered, so the rendered page agrees with the 404
              the edge already returns for it. */}
          <Route path="/learn" element={<LearnHub />} />
          <Route path="/learn/:topic" element={<TopicPage />} />
          <Route path="/learn/:topic/:slug" element={<ArticlePage />} />

          {/* The launch gate wraps marketing and workspace routes before any
              authentication, subscriptions or Careers data can mount. */}
          <Route element={<CareersAvailability />}>
            <Route path="/careers" element={webOnly(<CareersLanding />, CAREERS_HOME)} />
            <Route path="/careers/features" element={webOnly(<CareersFeatures />, CAREERS_HOME)} />
            <Route path="/careers/compare" element={webOnly(<CareersCompareIndex />, CAREERS_HOME)} />
            <Route path="/careers/compare/:rival" element={webOnly(<CareersCompare />, CAREERS_HOME)} />

            <Route path="/careers" element={<CareersLayout />}>
              <Route path="dashboard" element={<CareersDashboard />} />
              <Route path="upload" element={<CareersUpload />} />
              <Route path="resumes" element={<ResumeLibrary />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="queue" element={<MatchQueuePage />} />
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
            <Route path="/careers/*" element={<NotFound />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          {/* Where Supabase password-recovery links land. Registered in
              shared/routes.ts too, so the edge serves it 200 rather than
              404-ing a user who is holding a valid recovery grant. */}
          <Route path={RESET_PASSWORD_PATH} element={<ResetPassword />} />
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
