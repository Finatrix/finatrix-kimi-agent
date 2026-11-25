/**
 * One job, drawn the same way everywhere it appears: search results, saved
 * jobs and the one-at-a-time review card. The card shows facts about the
 * posting and the user's match; the caller supplies the actions, so there is
 * exactly one primary button per card.
 *
 * Company intelligence is deliberately absent: it describes the employer, not
 * the job, and must not read as a fact about this posting.
 */
import { useId, useState, type ReactNode } from 'react';
import { WorkRightsChip } from '../../components/WorkRightsChip';
import { classifyApplyUrl } from '../../search/applyUrl';
import type { CareersMarket, DeclaredRights } from '../../markets';
import type { NormalizedJob } from '../../types/jobs';
import { formatDate } from '../../utils/format';
import { CxIcon } from '../../ui/icons';
import { FitMeter } from '../../ui/primitives';
import { safeHttpUrl } from '../../../lib/sanitize';
import './jobs.css';

/**
 * Truthful trust/quality chips. Every label maps to an observable fact the
 * backend computed (a real date, a real score, an enrichment that actually
 * ran) — see providers/badges.ts. There is deliberately no generic "Verified".
 */
const TRUST_BADGES: Record<string, string> = {
  posted_today: 'Posted today',
  fresh_this_week: 'Fresh listing',
  updated_recently: 'Updated recently',
  salary_listed: 'Salary listed',
  remote_friendly: 'Remote-friendly',
  high_confidence: 'High-confidence match',
  ai_summary: 'AI summary',
  skills_matched: 'Matches your skills',
};

export type JobCardJob = Pick<
  NormalizedJob,
  'title' | 'company' | 'location' | 'work_mode' | 'employment_type' | 'salary_min' | 'salary_max'
  | 'currency' | 'posted_at' | 'apply_url' | 'via' | 'country' | 'work_rights' | 'badges'
> & { workMode?: string; employment?: string };

export interface JobCardProps {
  job: JobCardJob;
  declaredRights?: Partial<Record<CareersMarket, DeclaredRights>>;
  /** Resume match 0–100, or null when no resume is selected. */
  score?: number | null;
  /** True when the score comes from the full AI match rather than the quick one. */
  aiMatch?: boolean;
  /** The quick match rests on little evidence. */
  thinData?: boolean;
  why?: string[];
  addable?: string[];
  missing?: string[];
  /** The card's one primary action. */
  primary: ReactNode;
  /** Quiet actions shown after the primary one. */
  secondary?: ReactNode;
  /** Extra body between the facts and the actions (review card strengths and gaps). */
  children?: ReactNode;
  /** Heading level for the title; the review page uses h2. */
  headingLevel?: 'h2' | 'h3';
  /** Hide the where-to-apply link (the review card opens it from its primary action). */
  hideLink?: boolean;
  /** Saved jobs carry no match, so they skip the meter. */
  hideFit?: boolean;
  className?: string;
}

/** Providers send employment type as raw tokens ("fulltime", "PART_TIME"). */
const EMPLOYMENT_LABEL: Record<string, string> = {
  fulltime: 'Full-time', parttime: 'Part-time', contract: 'Contract', contractor: 'Contract',
  temporary: 'Temporary', internship: 'Internship', intern: 'Internship', permanent: 'Permanent',
  casual: 'Casual', freelance: 'Freelance', volunteer: 'Volunteer',
};

function employmentLabel(raw: string): string {
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  return EMPLOYMENT_LABEL[key] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Where the posting lives, named from the destination so label and link agree. */
function jobSource(job: Pick<JobCardJob, 'apply_url' | 'via'>) {
  const target = classifyApplyUrl(job.apply_url, job.via);
  const board = target.kind === 'aggregator' ? target.label.replace(/^View on /, '') : job.via;
  return {
    direct: target.direct,
    line: target.direct ? 'Direct from employer' : board ? `Via ${board}` : 'Source not stated',
    linkLabel: target.direct ? 'Apply on employer site' : target.label,
  };
}

export function JobCard({
  job, declaredRights, score = null, aiMatch = false, thinData = false,
  why = [], addable = [], missing = [], primary, secondary, children,
  headingLevel = 'h3', hideLink = false, hideFit = false, className,
}: JobCardProps) {
  const uid = useId();
  const [whyOpen, setWhyOpen] = useState(false);
  const Heading = headingLevel;
  const source = jobSource(job);
  const url = safeHttpUrl(job.apply_url);
  const workMode = job.workMode || job.work_mode;
  const employment = job.employment || job.employment_type;
  const badges = (job.badges ?? []).filter((b) => TRUST_BADGES[b]).slice(0, 2);
  const missingOnly = missing.filter((t) => !addable.includes(t));
  const hasWhy = why.length > 0 || addable.length > 0 || missingOnly.length > 0;

  return (
    <article className={`cx-panel jb-card ${className ?? ''}`} aria-labelledby={`${uid}-t`}>
      <div className="jb-top">
        <div className="jb-main">
          <Heading id={`${uid}-t`} className="jb-title">{job.title}</Heading>
          <div className="cx-row-meta jb-meta">
            <span className="jb-company">{job.company || 'Unknown company'}</span>
            {job.location && <span>{job.location}</span>}
            {workMode && <span>{workMode}</span>}
            {employment && <span>{employmentLabel(employment)}</span>}
            {(job.salary_min || job.salary_max) && (
              <span>
                {[job.salary_min, job.salary_max].filter(Boolean).map((n) => n!.toLocaleString()).join(' – ')} {job.currency}
              </span>
            )}
            {job.posted_at && <span>Posted {formatDate(job.posted_at)}</span>}
          </div>
          <p className="jb-source">{source.line}</p>
        </div>
        {!hideFit && (
          <div className="jb-fit">
            <FitMeter score={score} label={aiMatch ? 'AI match' : 'Match'} />
            {score != null && !aiMatch && thinData && <span className="cx-muted jb-thin">Thin data</span>}
          </div>
        )}
      </div>

      {(badges.length > 0 || job.work_rights) && (
        <div className="jb-chips">
          <WorkRightsChip job={job} declared={declaredRights} />
          {badges.map((b) => <span key={b} className="cx-chip">{TRUST_BADGES[b]}</span>)}
        </div>
      )}

      {hasWhy && (
        <div className="jb-why">
          <button
            type="button" className="cx-btn cx-btn-quiet cx-btn-sm"
            aria-expanded={whyOpen} aria-controls={`${uid}-why`}
            onClick={() => setWhyOpen((o) => !o)}
          >
            Why this match
          </button>
          {whyOpen && (
            <div id={`${uid}-why`} className="cx-sub jb-why-body">
              {why.length > 0 && <p>{why.slice(0, 3).join('. ')}</p>}
              {addable.length > 0 && <p>On your profile but not your resume: {addable.slice(0, 4).join(', ')}</p>}
              {missingOnly.length > 0 && <p>Missing from your experience: {missingOnly.slice(0, 4).join(', ')}</p>}
            </div>
          )}
        </div>
      )}

      {children}

      <div className="jb-actions">
        {primary}
        {secondary}
        {!hideLink && url && (
          <a className="cx-btn cx-btn-quiet cx-btn-sm" href={url} target="_blank" rel="noopener noreferrer">
            {source.linkLabel}
            <CxIcon name="external" size={14} />
            <span className="jb-sr"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </article>
  );
}
