/**
 * The Careers areas. Each is one page with tabs for what used to be separate
 * pages; a tab's content is loaded only when it is opened.
 */
import { Suspense, lazy, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { CAREERS_ROUTES } from '../constants';
import { CxIcon } from '../ui/icons';
import { Skeleton } from '../ui/primitives';
import { Area } from './Area';

const ResumeLibrary = lazy(() => import('../pages/ResumeLibrary'));
const CareersUpload = lazy(() => import('../pages/CareersUpload'));
const CareerProfilePage = lazy(() => import('../pages/CareerProfilePage'));
const JobsPage = lazy(() => import('../pages/JobsPage'));
const MatchQueuePage = lazy(() => import('../pages/MatchQueuePage'));
const ApplicationsPage = lazy(() => import('../pages/ApplicationsPage'));
const TasksPage = lazy(() => import('../pages/TasksPage'));
const AssessmentsPage = lazy(() => import('../pages/AssessmentsPage'));
const OffersPage = lazy(() => import('../pages/OffersPage'));
const InterviewPrepPage = lazy(() => import('../pages/InterviewPrepPage'));
const KnowledgeBasePage = lazy(() => import('../pages/KnowledgeBasePage'));
const CompanyIntelPage = lazy(() => import('../pages/CompanyIntelPage'));
const CompaniesPage = lazy(() => import('../pages/CompaniesPage'));
const RecruitersPage = lazy(() => import('../pages/RecruitersPage'));
const NetworkPage = lazy(() => import('../pages/NetworkPage'));
const CompanyProfilePage = lazy(() => import('../pages/CompanyProfilePage'));

function View({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={4} />}>{children}</Suspense>;
}

export function ResumeArea() {
  return (
    <Area
      title="Resume"
      description="Your resumes and their scores, plus the profile every match is measured against."
      tabs={[
        { key: 'resumes', label: 'Resumes' },
        { key: 'upload', label: 'Upload' },
        { key: 'profile', label: 'Profile' },
      ]}
      actions={(tab) =>
        tab !== 'upload' && (
          <Link className="cx-btn cx-btn-primary" to={CAREERS_ROUTES.upload}>
            <CxIcon name="upload" size={16} />
            Upload a resume
          </Link>
        )
      }
    >
      {(tab) => <View>{tab === 'upload' ? <CareersUpload /> : tab === 'profile' ? <CareerProfilePage /> : <ResumeLibrary />}</View>}
    </Area>
  );
}

export function JobsArea() {
  // Links from before the redesign used `?view=analyzer|saved`.
  const [params] = useSearchParams();
  const legacyView = params.get('view');
  if (!params.get('tab') && (legacyView === 'analyzer' || legacyView === 'saved')) {
    const next = new URLSearchParams(params);
    next.delete('view');
    next.set('tab', legacyView === 'analyzer' ? 'analyse' : 'saved');
    return <Navigate to={`${CAREERS_ROUTES.jobs}?${next}`} replace />;
  }
  return (
    <Area
      title="Jobs"
      description="Live openings from employers and job boards in five countries, scored against your resume."
      tabs={[
        { key: 'search', label: 'Search' },
        { key: 'saved', label: 'Saved' },
        { key: 'review', label: 'Review one by one' },
        { key: 'analyse', label: 'Analyse a job description' },
      ]}
    >
      {(tab) => (
        <View>
          {tab === 'review' ? <MatchQueuePage /> : <JobsPage view={tab === 'analyse' ? 'analyzer' : tab} />}
        </View>
      )}
    </Area>
  );
}

export function ApplicationsArea() {
  return (
    <Area
      title="Applications"
      description="Every role you are pursuing, from saved to offer, with the next thing to do on each."
      tabs={[
        { key: 'pipeline', label: 'Pipeline' },
        { key: 'tasks', label: 'Tasks' },
        { key: 'assessments', label: 'Assessments' },
        { key: 'offers', label: 'Offers' },
      ]}
    >
      {(tab) => (
        <View>
          {tab === 'tasks' ? <TasksPage /> : tab === 'assessments' ? <AssessmentsPage /> : tab === 'offers' ? <OffersPage /> : <ApplicationsPage />}
        </View>
      )}
    </Area>
  );
}

export function InterviewsArea() {
  return (
    <Area
      title="Interviews"
      description="Practise with questions built from your resume and the role, and keep your best stories ready to use."
      tabs={[
        { key: 'practice', label: 'Practice' },
        { key: 'stories', label: 'Story bank' },
      ]}
    >
      {(tab) => <View>{tab === 'stories' ? <KnowledgeBasePage /> : <InterviewPrepPage />}</View>}
    </Area>
  );
}

export function CompaniesArea() {
  return (
    <Area
      title="Companies"
      description="Research employers, keep track of the ones you are targeting and the people you have spoken to."
      tabs={[
        { key: 'directory', label: 'Directory' },
        { key: 'yours', label: 'Your companies' },
        { key: 'people', label: 'People' },
      ]}
    >
      {(tab) => (
        <View>
          {tab === 'yours' ? (
            <CompaniesPage />
          ) : tab === 'people' ? (
            <div className="cx-grid">
              <RecruitersPage />
              <NetworkPage />
            </div>
          ) : (
            <CompanyIntelPage />
          )}
        </View>
      )}
    </Area>
  );
}

const CareersSettings = lazy(() => import('../pages/CareersSettings'));
const BillingPage = lazy(() => import('../pages/BillingPage'));
const AdminDashboard = lazy(() => import('../pages/AdminDashboard'));

export function SettingsArea() {
  return (
    <Area
      title="Settings"
      description="Privacy, alerts, your data and your plan."
      tabs={[
        { key: 'general', label: 'General' },
        { key: 'plan', label: 'Plan' },
      ]}
    >
      {(tab) => <View>{tab === 'plan' ? <BillingPage /> : <CareersSettings />}</View>}
    </Area>
  );
}

export function AdminArea() {
  return (
    <Area title="Admin" description="Subscriptions, AI usage, flags and support. Visible to admins only." tabs={[{ key: 'overview', label: 'Overview' }]}>
      {() => (
        <View>
          <AdminDashboard />
        </View>
      )}
    </Area>
  );
}

export function CompanyProfileArea() {
  return (
    <div className="cx-area">
      <p style={{ margin: '0 0 12px' }}>
        <Link to={CAREERS_ROUTES.intelligence} className="cx-btn cx-btn-quiet cx-btn-sm" style={{ paddingLeft: 0 }}>
          <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><CxIcon name="arrow" size={16} /></span>
          Companies
        </Link>
      </p>
      <View>
        <CompanyProfilePage />
      </View>
    </div>
  );
}
