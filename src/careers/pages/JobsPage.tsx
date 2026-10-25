/**
 * Jobs — the Phase 2 flagship: multi-provider search, saved jobs, and the
 * job description analyzer (paste or upload), all feeding one shared
 * "workbench" modal that runs the analyse → match → tailor → cover-letter
 * pipeline against the selected resume version.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
// Aliased: this file already has a local `track()` that saves a job as a tracked
// application. Two different `track`s in one 900-line file is a bug waiting to
// be written, and the alias makes which one is meant unmissable at the call site.
import { track as trackEvent } from '../../lib/analytics';
import { useToast } from '../../tools/ui/Toast';
import { Tabs } from '../../tools/ui/Tabs';
import { MoneyField } from '../../tools/ui/MoneyField';
import { CountryOptions } from '../components/CountryOptions';
import { CoverLetterModal } from '../components/CoverLetterModal';
import { JobIntelView } from '../components/JobIntelView';
import { MatchPanel } from '../components/MatchPanel';
import { EmptyState, ErrorCard, ModalShell, SkeletonCards, PageLoading } from '../components/states';
import { JobCard } from '../areas/jobs/JobCard';
import { CxIcon } from '../ui/icons';
import { Empty } from '../ui/primitives';
import { CAREERS_ROUTES, INDUSTRY_OPTIONS } from '../constants';
import { useCareers } from '../context/CareersContext';
import { tailorResumeWithAI } from '../ai/tasks-jobs';
import { createApplication } from '../services/applications';
import { analyzeJobText, type JobIntelResult } from '../services/jobIntel';
import {
  deleteJob,
  jobContentSha,
  listSavedJobs,
  saveJob,
  saveJobDescription,
  searchProviders,
} from '../services/jobsService';
import { matchResumeToJob } from '../services/matchService';
import { withRegistryJobs } from '../services/registryJobs';
import { saveTailoredVersion, setSectionAccepted } from '../services/resumeTailoring';
import type { ResumeTailoredVersionRow } from '../types/phase3';
import { runSearchPipeline, type ScoredJob, type SearchReport } from '../search/pipeline';
import { enrichScoredJobs } from '../search/enrich';
import { intelBoost, type RankPreferences } from '../search/rerank';
import { searchCompanies } from '../services/companyIntelligence';
import { listSavedCompanies } from '../services/companyIntelUser';
import type { CompanyIntel, CompanyFilters } from '../types/companyIntel';
import { classifyApplyUrl } from '../search/applyUrl';
import type { QuickMatchInput } from '../search/quickMatch';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import {
  DEFAULT_MATCH_THRESHOLD,
  DEFAULT_SEARCH_PARAMS,
  matchBand,
  type JobRow,
  type JobSearchParams,
  type MatchReport,
  type NormalizedJob,
  type TailoringReport,
} from '../types/jobs';
import { toCareersError, withRetry, type CareersError } from '../utils/errors';
import { capitalise, formatDate, scoreColor } from '../utils/format';
import { safeHttpUrl } from '../../lib/sanitize';

// ─────────────────────────── resume version picker ───────────────────────────

function completeVersions(resumes: ResumeWithVersions[]): { label: string; version: ResumeVersionRow }[] {
  return resumes.flatMap((r) =>
    r.versions
      .filter((v) => v.status === 'complete' && v.parsed)
      .map((v) => ({ label: `${r.name} · v${v.version_number}`, version: v }))
  );
}

// ─────────────────────────── workbench (shared detail modal) ───────────────────────────

interface WorkbenchTarget {
  jobText: string;
  company: string;
  title: string;
  jobRow?: JobRow;
  descriptionId?: string;
  normalized?: NormalizedJob;
}

function JobWorkbench({
  target,
  version,
  initialIntel,
  initialMatch,
  onMatched,
  onClose,
}: {
  target: WorkbenchTarget;
  version: ResumeVersionRow | null;
  initialIntel: JobIntelResult | null;
  initialMatch: MatchReport | null;
  onMatched: (key: string, report: MatchReport, intel: JobIntelResult) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { settings } = useCareers();
  const { notify } = useToast();
  const [tab, setTab] = useState<'intel' | 'match' | 'tailor'>('intel');
  const [intel, setIntel] = useState<JobIntelResult | null>(initialIntel);
  const [match, setMatch] = useState<MatchReport | null>(initialMatch);
  const [tailor, setTailor] = useState<TailoringReport | null>(null);
  const [tailorRow, setTailorRow] = useState<ResumeTailoredVersionRow | null>(null);
  const [busy, setBusy] = useState<'' | 'intel' | 'match' | 'tailor' | 'track'>('');
  const [letterOpen, setLetterOpen] = useState(false);

  const ensureIntel = useCallback(async (): Promise<JobIntelResult | null> => {
    if (intel) return intel;
    if (!user) return null;
    setBusy('intel');
    try {
      const result = await analyzeJobText(
        user.id, target.jobText,
        { jobId: target.jobRow?.id, descriptionId: target.descriptionId },
        settings.model
      );
      setIntel(result);
      return result;
    } catch (e) {
      notify(toCareersError(e).message, 'error');
      return null;
    } finally {
      setBusy('');
    }
  }, [intel, user, target, settings.model, notify]);

  useEffect(() => {
    if (!intel) void ensureIntel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runMatch = async () => {
    if (!user || !version) {
      notify('Pick an analysed resume version first (top of the page).', 'error');
      return;
    }
    const currentIntel = await ensureIntel();
    if (!currentIntel) return;
    setBusy('match');
    try {
      const report = await matchResumeToJob(user.id, version, null, {
        jobId: target.jobRow?.id,
        descriptionId: target.descriptionId,
        jobText: target.jobText,
        job: {
          industry: target.jobRow?.industry ?? currentIntel.analysis.extraction.industry,
          location: target.jobRow?.location ?? currentIntel.analysis.extraction.location,
          work_mode: target.jobRow?.work_mode ?? currentIntel.analysis.extraction.workMode,
          salary_min: target.jobRow?.salary_min ?? null,
          salary_max: target.jobRow?.salary_max ?? null,
        },
        analysis: currentIntel.analysis,
        keywords: currentIntel.keywords,
      }, settings.model);
      setMatch(report);
      setTab('match');
      const key = await workbenchKey(target);
      onMatched(key, report, currentIntel);
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const runTailor = async () => {
    if (!user || !version?.parsed) {
      notify('Pick an analysed resume version first (top of the page).', 'error');
      return;
    }
    setBusy('tailor');
    try {
      const { result } = await withRetry(
        () => tailorResumeWithAI(version.parsed!, version.career_dna, target.jobText, settings.model),
        { attempts: 2 }
      );
      setTailor(result);
      setTab('tailor');
      // Module 3 — persist the proposal; the stored resume version is never touched.
      const saved = await saveTailoredVersion(user.id, version.id, target.jobText, result, {
        jobId: target.jobRow?.id,
      });
      setTailorRow(saved);
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const toggleAccepted = async (section: string, accepted: boolean) => {
    if (!user || !tailorRow) return;
    try {
      const updated = await setSectionAccepted(user.id, tailorRow.id, section, accepted, tailorRow.accepted_sections);
      setTailorRow(updated);
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const track = async () => {
    if (!user) return;
    setBusy('track');
    try {
      await createApplication(user.id, {
        company_name: target.company || intel?.analysis.extraction.company || 'Unknown company',
        job_title: target.title || intel?.analysis.extraction.title || 'Unknown role',
        job_id: target.jobRow?.id ?? null,
        resume_version_id: version?.id ?? null,
        location: target.jobRow?.location ?? '',
        work_mode: target.jobRow?.work_mode ?? '',
        source: target.jobRow?.source ?? 'manual',
        job_url: target.jobRow?.apply_url ?? target.normalized?.apply_url ?? '',
        salary_text: intel?.analysis.extraction.salaryInfo ?? '',
        match_score: match?.overall ?? null,
        ats_score: version?.ats_score ?? null,
        closes_at: target.jobRow?.closes_at ?? target.normalized?.closes_at ?? null,
      });
      notify('Added to Applications.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setBusy('');
    }
  };

  // A pasted description has no title or company until the analysis reads them from the text.
  const title = target.title || intel?.analysis.extraction.title || 'Job description';
  const company = target.company || intel?.analysis.extraction.company || '';
  const heading = company ? `${title} — ${company}` : title;

  return (
    <ModalShell label={heading} onClose={onClose} wide>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 style={{ flex: 1, marginBottom: 0 }}>{heading}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="job-meta" style={{ marginBottom: 14 }}>
          {match && (
            <span>
              <span className={`tl-dot tl-${matchBand(match.overall)}`} />
              <b style={{ color: scoreColor(match.overall) }}>{match.overall}% match</b>
            </span>
          )}
          {target.jobRow?.location && <span>{target.jobRow.location}</span>}
          {safeHttpUrl(target.jobRow?.apply_url ?? target.normalized?.apply_url) && (
            <a
              href={safeHttpUrl(target.jobRow?.apply_url ?? target.normalized?.apply_url)}
              target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold)' }}
            >
              {classifyApplyUrl(
                target.jobRow?.apply_url ?? target.normalized?.apply_url ?? '',
                target.jobRow?.raw && typeof target.jobRow.raw.via === 'string'
                  ? target.jobRow.raw.via
                  : target.normalized?.via ?? ''
              ).label}
              <span className="jb-sr"> (opens in a new tab)</span>
            </a>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <button className={`btn btn-sm ${busy === 'match' ? 'btn-loading' : ''}`} disabled={!!busy} onClick={() => void runMatch()}>
            {busy === 'match' ? 'Matching…' : match ? 'Re-match' : 'Match my resume'}
          </button>
          <button className={`btn btn-ghost btn-sm ${busy === 'tailor' ? 'btn-loading' : ''}`} disabled={!!busy} onClick={() => void runTailor()}>
            {busy === 'tailor' ? 'Tailoring…' : 'Tailor resume'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!!busy || !version} onClick={() => setLetterOpen(true)}>
            Cover letter
          </button>
          <button className={`btn btn-ghost btn-sm ${busy === 'track' ? 'btn-loading' : ''}`} disabled={!!busy} onClick={() => void track()}>
            {busy === 'track' ? 'Adding…' : 'Track application'}
          </button>
        </div>
        {/* The mount-time AI analysis disables the buttons above — without this
            line, clicks during those seconds look like the buttons are broken. */}
        <p className="note" style={{ marginBottom: 12, minHeight: 16 }} aria-live="polite">
          {busy === 'intel' ? 'Analysing this job with AI — actions unlock in a few seconds…' : ''}
        </p>

        <Tabs
          variant="nav"
          label="Job workbench"
          style={{ padding: 0, marginBottom: 14 }}
          active={tab}
          onChange={setTab}
          items={[
            { key: 'intel', label: 'Intelligence' },
            { key: 'match', label: 'Match' },
            { key: 'tailor', label: 'Tailoring' },
          ]}
        />

        {tab === 'intel' && (
          busy === 'intel' ? (
            <div role="status" aria-label="Analysing this job with AI">
              <div className="skel" style={{ width: '55%', height: 14 }} />
              <div className="skel" style={{ width: '92%', height: 11, marginTop: 12 }} />
              <div className="skel" style={{ width: '84%', height: 11, marginTop: 8 }} />
              <div className="skel" style={{ width: '70%', height: 11, marginTop: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <div className="skel" style={{ width: 90, height: 24, borderRadius: 980 }} />
                <div className="skel" style={{ width: 74, height: 24, borderRadius: 980 }} />
                <div className="skel" style={{ width: 102, height: 24, borderRadius: 980 }} />
              </div>
            </div>
          ) : intel ? (
            <JobIntelView analysis={intel.analysis} keywords={intel.keywords} resumeText={version?.raw_text} />
          ) : (
            <EmptyState icon="invest" title="Analysis unavailable">
              The AI analysis didn't complete.{' '}
              <button className="btn btn-sm" style={{ width: 'auto', marginTop: 10 }} onClick={() => void ensureIntel()}>
                Retry analysis
              </button>
            </EmptyState>
          )
        )}

        {tab === 'match' && (
          match ? <MatchPanel report={match} /> : (
            <EmptyState icon="goal" title="No match yet">
              Run “Match my resume” to score this job across 14 categories.
            </EmptyState>
          )
        )}

        {tab === 'tailor' && (
          tailor ? (
            <div>
              <div className="tip tip-info" style={{ marginBottom: 12 }}>
                <b>Suggestions only — your stored resume is never modified.</b>
                Tailored summary: {tailor.summary}
              </div>
              {tailor.sections.map((s, i) => {
                // Several suggestions can share a section ("experience"), so each is accepted on its own.
                const key = `${s.section}#${i}`;
                const accepted = tailorRow?.accepted_sections.includes(key) ?? false;
                return (
                  <div className="card" key={i} style={{ padding: 16, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="badge badge-gold">{capitalise(s.section)}</span>
                      {s.addedKeywords.length > 0 && (
                        <span className="note">+ {s.addedKeywords.join(', ')}</span>
                      )}
                    </div>
                    <div className="grid2" style={{ gap: 12 }}>
                      <div>
                        <div className="note" style={{ marginBottom: 4 }}>Original</div>
                        <p style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.6 }}>{s.original || '(new)'}</p>
                      </div>
                      <div>
                        <div className="note" style={{ marginBottom: 4 }}>Tailored</div>
                        <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6 }}>{s.improved}</p>
                      </div>
                    </div>
                    {s.reason && <p className="note" style={{ marginTop: 6 }}>Why: {s.reason}</p>}
                    {tailorRow && (
                      <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={accepted} onChange={(e) => void toggleAccepted(key, e.target.checked)} />
                        Accept this change
                      </label>
                    )}
                  </div>
                );
              })}
              {tailor.formattingSuggestions.length > 0 && (
                <div className="tip tip-warn">
                  <b>Formatting</b>
                  {tailor.formattingSuggestions.map((f, i) => <div key={i}>· {f}</div>)}
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon="lifemap" title="No tailoring yet">
              Run “Tailor resume” for job-specific rewrite suggestions.
            </EmptyState>
          )
        )}

        {letterOpen && version && (
          <CoverLetterModal
            version={version}
            jobText={target.jobText}
            company={target.company || intel?.analysis.extraction.company || ''}
            jobTitle={target.title || intel?.analysis.extraction.title || ''}
            jobId={target.jobRow?.id}
            matchScore={match?.overall}
            onClose={() => setLetterOpen(false)}
          />
        )}
    </ModalShell>
  );
}

async function workbenchKey(target: WorkbenchTarget): Promise<string> {
  return jobContentSha({
    company: target.company,
    title: target.title,
    description: target.jobText,
  });
}

// ─────────────────────────── page ───────────────────────────

type View = 'search' | 'saved' | 'analyzer';

/**
 * `view` is set by the Jobs area, whose tabs choose the sub-view; the page
 * then hides its own switch. Without it (direct render) the page keeps its
 * own switch and the `?view=` deep link.
 */
export default function JobsPage({ view: areaView }: { view?: View } = {}) {
  const { user } = useAuth();
  const { loading, error, profile, resumes, refresh, settings } = useCareers();
  const { notify } = useToast();
  const location = useLocation();

  const versions = useMemo(() => completeVersions(resumes), [resumes]);
  const [versionId, setVersionId] = useState('');
  const version = versions.find((v) => v.version.id === versionId)?.version ?? versions[0]?.version ?? null;

  // Deep-linkable views (?view=analyzer|saved) so other pages can send users
  // straight to the JD analyzer workflow.
  const [ownView, setView] = useState<View>(() => {
    const wanted = new URLSearchParams(location.search).get('view');
    return wanted === 'analyzer' || wanted === 'saved' ? wanted : 'search';
  });
  const view = areaView ?? ownView;
  // `?q=` (e.g. "Find live jobs" on a company page) prefills the search and runs it once.
  const [initialQuery] = useState(() => new URLSearchParams(location.search).get('q')?.trim() ?? '');
  const [params, setParams] = useState<JobSearchParams>(() => ({ ...DEFAULT_SEARCH_PARAMS, query: initialQuery }));
  const [searching, setSearching] = useState(false);
  const [report, setReport] = useState<SearchReport | null>(null);
  const [searchError, setSearchError] = useState<CareersError | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_MATCH_THRESHOLD);
  const [saved, setSaved] = useState<JobRow[]>([]);
  const [matches, setMatches] = useState<Map<string, { report: MatchReport; intel: JobIntelResult }>>(new Map());
  const [resultKeys, setResultKeys] = useState<Map<ScoredJob, string>>(new Map());
  // Phase 4.1 — Company Intelligence enrichment (never mutates the job source).
  const [boostMap, setBoostMap] = useState<Map<ScoredJob, { boost: number; why: string[] }>>(new Map());
  const [companyFallback, setCompanyFallback] = useState<CompanyIntel[]>([]);
  const [savedCompanyIds, setSavedCompanyIds] = useState<string[]>([]);

  // Company Intelligence ranking preferences (Settings) — extend, not replace.
  const rankPrefs = useMemo<RankPreferences>(() => ({
    preferredIndustries: settings.preferredIndustries ?? [],
    preferredLocations: settings.preferredLocations ?? [],
    preferredDepartments: settings.preferredDepartments ?? [],
    preferredCompanyIds: savedCompanyIds,
  }), [settings.preferredIndustries, settings.preferredLocations, settings.preferredDepartments, savedCompanyIds]);
  const [workbench, setWorkbench] = useState<WorkbenchTarget | null>(null);
  // Monotonic search sequence — stale responses never clobber newer ones.
  const searchSeq = useRef(0);
  // Same guard for opening a job: a superseded open never wins the race.
  const openSeq = useRef(0);

  /** Deterministic quick-match input for the selected resume version. */
  const resumeInput = useMemo<QuickMatchInput | null>(() => {
    if (!version?.parsed || !version.raw_text) return null;
    return {
      parsed: version.parsed,
      rawText: version.raw_text,
      careerDna: version.career_dna,
      profile,
    };
  }, [version, profile]);

  // Refinements are collapsed by default and opened on demand. They open
  // automatically when a saved/deep-linked search arrives with some already
  // set, so an active filter is never invisible.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const queryRef = useRef<HTMLInputElement>(null);

  /**
   * How many refinements are actually narrowing the search. Compared against
   * DEFAULT_SEARCH_PARAMS rather than against emptiness, because `country`
   * defaults to India — counting it as "on" would make the badge read 1 on a
   * search nobody had filtered.
   */
  const activeFilters = useMemo(() => {
    const keys = ['country', 'workMode', 'employmentType', 'industry', 'salaryMin', 'salaryMax'] as const;
    return keys.filter((k) => params[k] !== DEFAULT_SEARCH_PARAMS[k]).length;
  }, [params]);

  const clearFilters = useCallback(() => {
    setParams((p) => ({
      ...p,
      country: DEFAULT_SEARCH_PARAMS.country,
      workMode: DEFAULT_SEARCH_PARAMS.workMode,
      employmentType: DEFAULT_SEARCH_PARAMS.employmentType,
      industry: DEFAULT_SEARCH_PARAMS.industry,
      salaryMin: DEFAULT_SEARCH_PARAMS.salaryMin,
      salaryMax: DEFAULT_SEARCH_PARAMS.salaryMax,
      // Refinements only — the query and location the user typed are theirs.
    }));
  }, []);

  // "/" focuses the search box, the convention every search-first product
  // shares. Ignored while the user is already typing somewhere, so it never
  // steals a literal slash from a job title or the JD analyzer's textarea.
  useEffect(() => {
    if (view !== 'search') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      e.preventDefault();
      queryRef.current?.focus();
      queryRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  // Analyzer state
  const [pasteText, setPasteText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  // Presentation-only ordering of already-ranked results.
  type SortMode = 'best' | 'newest' | 'salary';
  const [sortMode, setSortMode] = useState<SortMode>('best');

  const loadSaved = useCallback(async () => {
    if (!user) return;
    setSaved(await listSavedJobs(user.id).catch(() => []));
  }, [user]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  useEffect(() => {
    if (!user) return;
    void listSavedCompanies(user.id).then(
      (rows) => setSavedCompanyIds(rows.map((r) => r.company_id)),
      () => setSavedCompanyIds([]),
    );
  }, [user]);

  const runSearch = async (page = 0) => {
    if (!params.query.trim()) {
      notify('Enter a job title or keyword.', 'error');
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    setCompanyFallback([]);
    try {
      const out = await runSearchPipeline(
        { ...params, page },
        resumeInput,
        // Registry jobs (read off employers' own ATS boards, so their apply
        // URLs are real application forms) merge into the same fan-out as the
        // aggregators and flow through one pipeline — see services/registryJobs.
        withRegistryJobs((p, terms) => searchProviders(p, terms)),
        { resumeKey: version?.id ?? 'none' }
      );
      if (seq !== searchSeq.current) return; // a newer search superseded this one

      // Paging past the last page used to replace a screen of good results
      // with an empty one, and the only way back was to search again. An empty
      // page beyond the first is the end of the list, not a new result set:
      // keep what is on screen and say so.
      if (page > 0 && out.jobs.length === 0) {
        notify('You’ve reached the end of these results.', 'info');
        return;
      }

      setReport(out);
      setParams((p) => ({ ...p, page }));
      const keys = new Map<ScoredJob, string>();
      await Promise.all(out.jobs.map(async (s) => {
        keys.set(s, await jobContentSha(s.job));
      }));
      setResultKeys(keys);

      // Company Intelligence enrichment + no-jobs fallback. Degrades gracefully:
      // if the CI backend is unavailable, job results still render unchanged.
      let fallback: CompanyIntel[] = [];
      try {
        const enriched = await enrichScoredJobs(out.jobs);
        if (seq !== searchSeq.current) return;
        const bm = new Map<ScoredJob, { boost: number; why: string[] }>();
        out.jobs.forEach((s, i) => {
          if (enriched[i]) bm.set(s, intelBoost(enriched[i], rankPrefs));
        });
        setBoostMap(bm);
        if (!out.jobs.length) {
          const filters: CompanyFilters = {
            industry: params.industry || undefined,
            location: params.location || undefined,
          };
          fallback = await searchCompanies(params.query, filters, 12);
        }
        if (seq === searchSeq.current) setCompanyFallback(fallback);
      } catch {
        setCompanyFallback([]);
      }

      // A search that returned. `count` is bucketed rather than exact: the
      // number that matters is "did this search find anything usable", and a
      // precise result count on a query we do not record adds nothing but
      // cardinality. The query text itself is never sent — it is free text a
      // user typed, and the prop allowlist has no key that could carry it.
      trackEvent('job_search_completed', {
        count: out.jobs.length === 0 ? 0 : out.jobs.length < 10 ? 1 : 10,
        ok: out.jobs.length > 0,
        where: version?.id ? 'with-resume' : 'no-resume',
        step: page,
      });

      if (!out.jobs.length) {
        notify(
          fallback.length
            ? 'No live jobs found — showing matching companies from your intelligence base.'
            : 'No relevant jobs found — try broader keywords or another location.',
          'info'
        );
      }
    } catch (e) {
      if (seq !== searchSeq.current) return;
      const err = toCareersError(e);
      // A search that failed is still a completed search from the user's point
      // of view, and the failure code is what makes provider outages visible.
      trackEvent('job_search_completed', { ok: false, kind: err.code });
      setSearchError(err);
      // Backend/network down → still surface matching companies so the user
      // isn't left at a dead end while live listings are unavailable.
      if (['backend', 'network', 'rate-limit'].includes(err.code)) {
        try {
          const companies = await searchCompanies(params.query, {
            industry: params.industry || undefined,
            location: params.location || undefined,
          }, 12);
          if (seq === searchSeq.current) setCompanyFallback(companies);
        } catch { /* CI base also unavailable — leave the error card as-is */ }
      }
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  // The job currently being persisted/opened — drives the button's loading
  // state so "Analyse & match" never looks dead during the network write.
  const [openingKey, setOpeningKey] = useState('');

  const openNormalized = async (job: NormalizedJob) => {
    if (!user) {
      notify('Sign in to analyse jobs.', 'error');
      return;
    }
    const key = `${job.source}-${job.external_id}`;
    // Every card's button used to be disabled while ANY one of them was
    // opening, so a mis-click froze the whole list for the length of a network
    // write. Only the card in flight is busy now; the sequence guard is what
    // keeps a fast second click from opening the first job's workbench — the
    // same pattern runSearch already uses for superseded searches.
    const seq = ++openSeq.current;
    setOpeningKey(key);
    try {
      // Persist first (idempotent) so analysis/matching attach to a row.
      const row = await saveJob(user.id, job);
      if (seq !== openSeq.current) return;
      setWorkbench({
        jobText: `${job.title}\n${job.company}\n${job.location}\n\n${job.description}`,
        company: job.company,
        title: job.title,
        jobRow: row,
        normalized: job,
      });
      void loadSaved();
    } catch (e) {
      if (seq === openSeq.current) notify(toCareersError(e).message, 'error');
    } finally {
      if (seq === openSeq.current) setOpeningKey('');
    }
  };

  const openSaved = (row: JobRow) => {
    setWorkbench({
      jobText: `${row.title}\n${row.company}\n${row.location}\n\n${row.description}`,
      company: row.company,
      title: row.title,
      jobRow: row,
    });
  };

  const analyzePasted = async () => {
    if (!user) {
      notify('Sign in to analyse a job description.', 'error');
      return;
    }
    const text = pasteText.trim();
    if (text.length < 100) {
      notify('Paste a fuller job description (at least a few sentences).', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const desc = await saveJobDescription(user.id, { title: '', company: '', rawText: text });
      setWorkbench({ jobText: desc.raw_text, company: desc.company, title: desc.title, descriptionId: desc.id });
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeFile = async (file: File) => {
    if (!user) {
      notify('Sign in to analyse a job description.', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const { extractResumeText } = await import('../parser/extract');
      const { text } = await extractResumeText(file, { ocrEnabled: false });
      const desc = await saveJobDescription(user.id, { title: '', company: '', rawText: text });
      setWorkbench({ jobText: desc.raw_text, company: desc.company, title: desc.title, descriptionId: desc.id });
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const onMatched = (key: string, report: MatchReport, intel: JobIntelResult) => {
    setMatches((prev) => new Map(prev).set(key, { report, intel }));
    void refresh();
  };

  const results = report?.jobs ?? [];

  /** Best available Resume Match: full AI match when run, else quick match. */
  const effectiveMatch = (s: ScoredJob): number | null => {
    const key = resultKeys.get(s);
    const ai = key ? matches.get(key) : undefined;
    if (ai) return ai.report.overall;
    return s.match ? s.match.overall : null;
  };

  // Hard threshold — jobs scoring below it are never shown, no exceptions.
  // Ordering EXTENDS the pipeline's ranking with a Company-Intelligence boost
  // (preferred industries/locations/departments, saved companies) — it only
  // re-orders what the pipeline already returned; it never changes membership.
  const visibleResults = results
    .filter((s) => {
      const m = effectiveMatch(s);
      return m == null || m >= threshold;
    })
    .map((s) => {
      const m = effectiveMatch(s);
      const base = m != null ? s.relevance * 0.5 + m * 0.5 : s.relevance * 0.85;
      return { s, score: base + (boostMap.get(s)?.boost ?? 0) };
    })
    .sort((a, b) => {
      if (sortMode === 'newest') {
        return (b.s.job.posted_at ?? '').localeCompare(a.s.job.posted_at ?? '');
      }
      if (sortMode === 'salary') {
        const sal = (x: ScoredJob) => x.job.salary_max ?? x.job.salary_min ?? -1;
        return sal(b.s) - sal(a.s);
      }
      return b.score - a.score;
    })
    .map((x) => x.s);

  // Run the `?q=` search once, on arrival.
  const autoSearched = useRef(false);
  useEffect(() => {
    if (!initialQuery || autoSearched.current) return;
    autoSearched.current = true;
    void runSearch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [initialQuery]);

  if (loading) return <PageLoading />;

  return (
    <div className="cx-grid">
      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {/* Resume version selector — powers matching everywhere on this page */}
      <div className="jb-version">
        <label htmlFor="jobs-version">Match against</label>
        {versions.length ? (
          <select id="jobs-version" className="fs" value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}>
            {versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>)}
          </select>
        ) : (
          <Link to={CAREERS_ROUTES.upload} className="cx-btn cx-btn-sm">
            Upload a resume to enable matching
          </Link>
        )}
        {!areaView && <Tabs
          variant="nav"
          label="Jobs view"
          style={{ padding: 0, marginLeft: 'auto' }}
          active={view}
          onChange={setView}
          items={[
            { key: 'search', label: 'Search' },
            { key: 'saved', label: `Saved (${saved.length})` },
            { key: 'analyzer', label: 'JD analyser' },
          ]}
        />}
      </div>

      {view === 'search' && (
        <>
          {/* Three controls carry a real query; the refinements collapse behind
              one disclosure that says how many are on, so nothing is hidden
              without a signal. */}
          <section className="cx-panel" aria-label="Search jobs">
            <div className="jb-form">
              <input ref={queryRef} className="fi" placeholder="Job title or keyword" aria-label="Job title or keyword" value={params.query}
                onChange={(e) => setParams((p) => ({ ...p, query: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch(0)} />
              <input className="fi" placeholder="City or state" aria-label="Location" value={params.location}
                onChange={(e) => setParams((p) => ({ ...p, location: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch(0)} />
              <button className="cx-btn cx-btn-primary" disabled={searching} onClick={() => void runSearch(0)}>
                <CxIcon name="search" size={16} />
                {searching ? 'Searching…' : 'Search jobs'}
              </button>
            </div>

            <div className="jb-filter-row">
              <button
                type="button"
                className="cx-btn cx-btn-quiet cx-btn-sm"
                aria-expanded={filtersOpen}
                aria-controls="jobs-filters"
                onClick={() => setFiltersOpen((o) => !o)}
              >
                Filters
                {activeFilters > 0 && <span className="cx-chip cx-chip-accent">{activeFilters}</span>}
              </button>
              {activeFilters > 0 && (
                <button type="button" className="cx-btn cx-btn-quiet cx-btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
              <span className="cx-muted" style={{ fontSize: 13 }}>
                {activeFilters > 0
                  ? `${activeFilters} filter${activeFilters === 1 ? '' : 's'} narrowing this search`
                  : 'No filters on'}
              </span>
            </div>

            {filtersOpen && (
              <div id="jobs-filters">
                <div className="jb-filters">
                  <select className="fs" aria-label="Country" value={params.country}
                    onChange={(e) => setParams((p) => ({ ...p, country: e.target.value }))}>
                    <CountryOptions />
                  </select>
                  <select className="fs" aria-label="Work mode" value={params.workMode}
                    onChange={(e) => setParams((p) => ({ ...p, workMode: e.target.value as JobSearchParams['workMode'] }))}>
                    <option value="">Any work mode</option>
                    <option value="remote">Remote only</option>
                    <option value="hybrid">Hybrid only</option>
                    <option value="onsite">On-site</option>
                  </select>
                  <select className="fs" aria-label="Employment type" value={params.employmentType}
                    onChange={(e) => setParams((p) => ({ ...p, employmentType: e.target.value }))}>
                    <option value="">Any employment type</option>
                    <option value="fulltime">Full-time</option>
                    <option value="parttime">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Internship or graduate</option>
                  </select>
                  <select className="fs" aria-label="Industry" value={params.industry}
                    onChange={(e) => setParams((p) => ({ ...p, industry: e.target.value }))}>
                    <option value="">Any industry</option>
                    {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {/* Money is never `type="number"` here — see MoneyField: the
                      browser reports an empty value for anything not yet a valid
                      number, so the field blanked itself the moment someone typed
                      a decimal point. MoneyField keeps the user's draft string
                      while focused. Empty commits as 0, mapped back to null so
                      "no minimum" stays distinct from "at least ₹0". */}
                  <MoneyField
                    id="jobs-salary-min" className="fi" sym="₹"
                    placeholder="Min salary (₹/yr)" ariaLabel="Minimum salary"
                    value={params.salaryMin ?? 0}
                    onCommit={(v) => setParams((p) => ({ ...p, salaryMin: v > 0 ? v : null }))}
                  />
                  <MoneyField
                    id="jobs-salary-max" className="fi" sym="₹"
                    placeholder="Max salary (₹/yr)" ariaLabel="Maximum salary"
                    value={params.salaryMax ?? 0}
                    onCommit={(v) => setParams((p) => ({ ...p, salaryMax: v > 0 ? v : null }))}
                  />
                </div>
              </div>
            )}
          </section>

          {searchError && <ErrorCard error={searchError} onRetry={() => void runSearch(params.page)} />}

          {report && !searching && (() => {
            const q = report.quality;
            const cov = q.providerCoverage;
            // Source names are deliberately not shown to users — the experience is
            // native to FinatriX. Detailed per-source health lives in the internal
            // admin dashboard. Here we surface only an honest aggregate.
            const vals = Object.values(cov);
            const ran = vals.filter((s) => s === 'ok' || s === 'error' || s === 'timeout').length;
            const live = vals.filter((st) => st === 'ok').length;
            const degraded = vals.filter((st) => st === 'timeout' || st === 'error').length;
            const cb = q.confidenceBreakdown;
            const order = sortMode === 'newest' ? 'newest first' : sortMode === 'salary' ? 'highest salary first' : 'best match first';
            return (
              <div>
                <div className="jb-toolbar">
                  <p className="cx-sub jb-count" role="status">
                    {visibleResults.length} job{visibleResults.length === 1 ? '' : 's'}, {order}
                  </p>
                  <label htmlFor="jobs-threshold">Minimum match {threshold}%</label>
                  <input
                    id="jobs-threshold" type="range" min={0} max={100} step={5} value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                  />
                  <select
                    className="fs" aria-label="Sort results" value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                  >
                    <option value="best">Best match first</option>
                    <option value="newest">Newest first</option>
                    <option value="salary">Highest salary first</option>
                  </select>
                  <button
                    type="button" className="cx-btn cx-btn-quiet cx-btn-sm"
                    aria-expanded={detailsOpen} aria-controls="jobs-details"
                    onClick={() => setDetailsOpen((o) => !o)}
                  >
                    Details
                  </button>
                </div>
                {!resumeInput && (
                  <p className="cx-muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
                    Upload a resume to filter by match.
                  </p>
                )}
                {detailsOpen && (
                  <div id="jobs-details" className="jb-details">
                    <div className="jb-details-body">
                      <span>{q.rejected} filtered out
                        {q.rejected > 0 && ` (${Object.entries(q.rejectedByReason).map(([r, n]) => `${n} ${r.replace('-', ' ')}`).join(', ')})`}
                      </span>
                      {q.averageMatch != null && <span>Average match {q.averageMatch}%</span>}
                      <span>
                        Search confidence {q.searchConfidence}%
                        {cb && ` (providers ${cb.providerCoverage}%, resume ${cb.resume}%, query ${cb.query}%, classification ${cb.classification}%)`}
                      </span>
                      {vals.length > 0 && <span>{ran} source{ran === 1 ? '' : 's'} searched, {live} live</span>}
                      {degraded > 0 && <span>{degraded} temporarily unavailable</span>}
                      {q.duplicatesRemoved > 0 && <span>{q.duplicatesRemoved} duplicate{q.duplicatesRemoved === 1 ? '' : 's'} removed</span>}
                      {q.timings?.totalMs != null && <span>Ranked in {Math.round(q.timings.totalMs)} ms</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Skeletons while providers respond — content-shaped, no dead air. */}
          {searching && <SkeletonCards count={4} label="Searching for jobs" />}

          {!searching && visibleResults.map((s, i) => {
            const job = s.job;
            const key = resultKeys.get(s);
            const ai = key ? matches.get(key) : undefined;
            const pct = effectiveMatch(s);
            const opening = openingKey === `${job.source}-${job.external_id}`;
            return (
              <JobCard
                key={`${job.source}-${job.external_id}-${i}`}
                job={job}
                declaredRights={settings.declaredRights}
                score={pct}
                aiMatch={!!ai}
                // A percentage computed from two signals is not the same claim
                // as one computed from eight; say so.
                thinData={!!s.match && s.match.confidence < 50}
                why={[...s.why, ...(boostMap.get(s)?.why ?? []).map((w) => `Ranked higher: ${w}`)]}
                addable={s.match?.addableTerms}
                missing={s.match?.missingTerms}
                primary={
                  <button
                    className="cx-btn cx-btn-primary cx-btn-sm"
                    disabled={opening}
                    onClick={() => void openNormalized(job)}
                  >
                    {opening ? 'Opening…' : 'Analyse & match'}
                  </button>
                }
                secondary={
                  <button className="cx-btn cx-btn-quiet cx-btn-sm" aria-label={`Save ${job.title}`} onClick={() => {
                    if (user) void saveJob(user.id, job).then(() => { notify('Job saved.', 'ok'); void loadSaved(); })
                      .catch((e) => notify(toCareersError(e).message, 'error'));
                  }}>
                    Save
                  </button>
                }
              />
            );
          })}

          {/* Successful search, but the match threshold hid everything — a
              dead-looking page with no explanation. Say why, and offer the
              one-click way out. */}
          {!searching && results.length > 0 && visibleResults.length === 0 && (() => {
            const best = Math.max(...results.map((s) => effectiveMatch(s) ?? 0));
            return (
              <section className="cx-panel" aria-label="No jobs above your minimum match">
                <Empty
                  title={`${results.length} job${results.length === 1 ? '' : 's'} found, all below ${threshold}%`}
                  action={
                    <button className="cx-btn cx-btn-primary" onClick={() => setThreshold(0)}>
                      Show all {results.length} jobs
                    </button>
                  }
                >
                  The strongest match in this search is {best}%. Lower the minimum match, or show everything.
                </Empty>
              </section>
            );
          })()}

          {!searching && results.length > 0 && visibleResults.length > 0 && (
            <div className="jb-pager">
              {params.page > 0 && (
                <button className="cx-btn cx-btn-sm" disabled={searching} onClick={() => void runSearch(params.page - 1)}>Previous page</button>
              )}
              <button className="cx-btn cx-btn-sm" disabled={searching} onClick={() => void runSearch(params.page + 1)}>Next page</button>
            </div>
          )}

          {/* No live jobs (or backend down) → Company Intelligence fallback. */}
          {results.length === 0 && companyFallback.length > 0 && (
            <section className="cx-panel" aria-label="Matching companies">
              <div className="cx-panel-head">
                <h2>Matching companies</h2>
              </div>
              <p className="cx-sub" style={{ marginBottom: 8 }}>
                {searchError ? 'Live job search is unavailable right now, but ' : 'No live job listings matched, but '}
                {companyFallback.length} compan{companyFallback.length === 1 ? 'y' : 'ies'} in your intelligence base match this search.
              </p>
              <ul className="cx-list">
                {companyFallback.map((c) => (
                  <li key={c.id}>
                    <div className="cx-row">
                      <div className="cx-row-main">
                        <h3 className="cx-row-title">{c.name}</h3>
                        <div className="cx-row-meta">
                          {c.industry && <span>{c.industry}</span>}
                          {(c.hqCity || c.hqCountry) && <span>{[c.hqCity, c.hqCountry].filter(Boolean).join(', ')}</span>}
                          {(c.graduateFriendly || c.graduatePrograms.length > 0) && <span>Graduate program</span>}
                          {(c.internFriendly || c.internships.length > 0) && <span>Internships</span>}
                        </div>
                      </div>
                      <Link
                        className="cx-btn cx-btn-sm"
                        aria-label={`View company profile for ${c.name}`}
                        to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(c.id)}`}
                      >
                        View company
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {view === 'saved' && (
        !saved.length ? (
          <section className="cx-panel" aria-label="Saved jobs">
            <Empty title="No saved jobs yet">
              Save a search result or analyse a pasted job description, and it will appear here.
            </Empty>
          </section>
        ) : (
          saved.map((row) => (
            <JobCard
              key={row.id}
              job={row}
              declaredRights={settings.declaredRights}
              hideFit
              primary={
                <button className="cx-btn cx-btn-primary cx-btn-sm" aria-label={`Open ${row.title}`} onClick={() => openSaved(row)}>
                  Open
                </button>
              }
              secondary={
                <button
                  className="cx-btn cx-btn-quiet cx-btn-sm" aria-label={`Remove ${row.title}`}
                  onClick={() => { if (user) void deleteJob(user.id, row.id).then(loadSaved).catch((e) => notify(toCareersError(e).message, 'error')); }}
                >
                  Remove
                </button>
              }
            >
              <div className="cx-row-meta" style={{ marginTop: 8 }}>
                <span>{row.analysis ? 'Analysed' : 'Not analysed'}</span>
                <span>Saved {formatDate(row.created_at)}</span>
              </div>
            </JobCard>
          ))
        )
      )}

      {view === 'analyzer' && (
        <section className="cx-panel" aria-labelledby="jobs-analyzer-title">
          <div className="cx-panel-head">
            <h2 id="jobs-analyzer-title">Analyse a job description</h2>
          </div>
          <p className="cx-sub" style={{ marginBottom: 12 }}>
            Paste a job description, or upload it as a PDF or Word file. You get the
            job breakdown, a resume match and tailoring suggestions.
          </p>
          <textarea
            className="fi jb-text"
            placeholder="Paste the job description here"
            aria-label="Job description text"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="jb-actions">
            <button className="cx-btn cx-btn-primary" disabled={analyzing} onClick={() => void analyzePasted()}>
              {analyzing ? 'Analysing…' : 'Analyse pasted text'}
            </button>
            <label className="cx-btn jb-upload" style={{ cursor: 'pointer' }}>
              <CxIcon name="upload" size={16} />
              Upload PDF or Word file
              <input
                type="file" className="jb-sr" accept=".pdf,.docx,.doc"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void analyzeFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </section>
      )}

      {workbench && (
        <JobWorkbench
          target={workbench}
          version={version}
          initialIntel={workbench.jobRow?.analysis ? { analysis: workbench.jobRow.analysis, keywords: workbench.jobRow.keywords ?? { keywords: [] } } : null}
          initialMatch={null}
          onMatched={onMatched}
          onClose={() => { setWorkbench(null); void loadSaved(); }}
        />
      )}
    </div>
  );
}
