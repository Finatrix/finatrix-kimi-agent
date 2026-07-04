import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary'
import LoginReminderModal from './components/LoginReminderModal'

// Route-level code-splitting: each page (and its heavy deps like the
// Supabase-backed tools) loads only when its route is visited.
const Home = lazy(() => import('./pages/Home'))
const ToolsLayout = lazy(() => import('./tools/ToolsLayout'))
const ToolsIndex = lazy(() => import('./tools/ToolsIndex'))
const ToolRoute = lazy(() => import('./tools/ToolRoute'))
const CareersLayout = lazy(() => import('./careers/CareersLayout'))
const CareersDashboard = lazy(() => import('./careers/pages/CareersDashboard'))
const CareersUpload = lazy(() => import('./careers/pages/CareersUpload'))
const ResumeLibrary = lazy(() => import('./careers/pages/ResumeLibrary'))
const JobsPage = lazy(() => import('./careers/pages/JobsPage'))
const ApplicationsPage = lazy(() => import('./careers/pages/ApplicationsPage'))
const CompaniesPage = lazy(() => import('./careers/pages/CompaniesPage'))
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
          <Route path="/tools" element={<ToolsLayout />}>
            <Route index element={<ToolsIndex />} />
            <Route path=":toolId" element={<ToolRoute />} />
          </Route>
          <Route path="/careers" element={<CareersLayout />}>
            <Route index element={<CareersDashboard />} />
            <Route path="dashboard" element={<CareersDashboard />} />
            <Route path="upload" element={<CareersUpload />} />
            <Route path="resumes" element={<ResumeLibrary />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="recruiters" element={<RecruitersPage />} />
            <Route path="network" element={<NetworkPage />} />
            <Route path="interviews" element={<InterviewPrepPage />} />
            <Route path="assessments" element={<AssessmentsPage />} />
            <Route path="offers" element={<OffersPage />} />
            <Route path="knowledge" element={<KnowledgeBasePage />} />
            <Route path="coach" element={<CareerCoachPage />} />
            <Route path="profile" element={<CareerProfilePage />} />
            <Route path="settings" element={<CareersSettings />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <LoginReminderModal />
    </ErrorBoundary>
  )
}
