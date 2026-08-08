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
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { Tabs } from '../../tools/ui/Tabs';
import { CoverLetterModal } from '../components/CoverLetterModal';
import { JobIntelView } from '../components/JobIntelView';
import { MatchPanel } from '../components/MatchPanel';
import { EmptyState, ErrorCard, ModalShell, SkeletonCards, PageLoading } from '../components/states';
import { ScoreRing } from '../components/ScoreRing';
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
import { saveTailoredVersion, setSectionAccepted } from '../services/resumeTailoring';
import type { ResumeTailoredVersionRow } from '../types/phase3';
import { runSearchPipeline, type ScoredJob, type SearchReport } from '../search/pipeline';
import { enrichScoredJobs, intelBadges } from '../search/enrich';
import { intelBoost, type RankPreferences } from '../search/rerank';
import { searchCompanies } from '../services/companyIntelligence';
import { listSavedCompanies } from '../services/companyIntelUser';
import type { CompanyIntel, CompanyFilters } from '../types/companyIntel';
import { categoryLabel } from '../search/taxonomy';
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
import { formatDate, scoreColor } from '../utils/format';

/**
 * Truthful trust/quality chips shown on each result. Every label maps to an
 * observable fact the backend computed (a real date, a real score, an
 * enrichment that actually ran) — see providers/badges.ts. We deliberately do
 * NOT show a generic "Verified" chip on unverified aggregated listings.
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

  return (
    <ModalShell label={`Job details — ${target.title}`} onClose={onClose} wide>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 style={{ flex: 1, marginBottom: 0 }}>{target.title || 'Job'} — {target.company || 'company'}</h3>
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
          {(target.jobRow?.apply_url ?? target.normalized?.apply_url) && (
            <a
              href={target.jobRow?.apply_url ?? target.normalized?.apply_url}
              target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold)' }}
            >
              Apply on {target.jobRow?.raw && typeof target.jobRow.raw.via === 'string' ? target.jobRow.raw.via : target.normalized?.via ?? 'source'} ↗
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
                const accepted = tailorRow?.accepted_sections.includes(s.section) ?? false;
                return (
                  <div className="card" key={i} style={{ padding: 16, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="badge badge-gold">{s.section}</span>
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
                        <input type="checkbox" checked={accepted} onChange={(e) => void toggleAccepted(s.section, e.target.checked)} />
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

export default function JobsPage() {
  const { user } = useAuth();
  const { loading, error, profile, resumes, refresh, settings } = useCareers();
  const { notify } = useToast();
  const location = useLocation();

  const versions = useMemo(() => completeVersions(resumes), [resumes]);
  const [versionId, setVersionId] = useState('');
  const version = versions.find((v) => v.version.id === versionId)?.version ?? versions[0]?.version ?? null;

  // Deep-linkable views (?view=analyzer|saved) so other pages can send users
  // straight to the JD analyzer workflow.
  const [view, setView] = useState<View>(() => {
    const wanted = new URLSearchParams(location.search).get('view');
    return wanted === 'analyzer' || wanted === 'saved' ? wanted : 'search';
  });
  const [params, setParams] = useState<JobSearchParams>({ ...DEFAULT_SEARCH_PARAMS });
  const [searching, setSearching] = useState(false);
  const [report, setReport] = useState<SearchReport | null>(null);
  const [searchError, setSearchError] = useState<CareersError | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_MATCH_THRESHOLD);
  const [saved, setSaved] = useState<JobRow[]>([]);
  const [matches, setMatches] = useState<Map<string, { report: MatchReport; intel: JobIntelResult }>>(new Map());
  const [resultKeys, setResultKeys] = useState<Map<ScoredJob, string>>(new Map());
  // Phase 4.1 — Company Intelligence enrichment (never mutates the job source).
  const [intelMap, setIntelMap] = useState<Map<ScoredJob, CompanyIntel | null>>(new Map());
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
        (p, terms) => searchProviders(p, terms),
        { resumeKey: version?.id ?? 'none' }
      );
      if (seq !== searchSeq.current) return; // a newer search superseded this one
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
        const im = new Map<ScoredJob, CompanyIntel | null>();
        const bm = new Map<ScoredJob, { boost: number; why: string[] }>();
        out.jobs.forEach((s, i) => {
          im.set(s, enriched[i]?.intel ?? null);
          if (enriched[i]) bm.set(s, intelBoost(enriched[i], rankPrefs));
        });
        setIntelMap(im);
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
        setIntelMap(new Map());
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
    setOpeningKey(key);
    try {
      // Persist first (idempotent) so analysis/matching attach to a row.
      const row = await saveJob(user.id, job);
      setWorkbench({
        jobText: `${job.title}\n${job.company}\n${job.location}\n\n${job.description}`,
        company: job.company,
        title: job.title,
        jobRow: row,
        normalized: job,
      });
      void loadSaved();
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setOpeningKey('');
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

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead
        chip="Job Intelligence"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="compass"
        title="Find jobs that fit you"
      >
        Search across providers, let AI explain every posting, and score each one
        against your resume in 14 dimensions before you spend a minute applying.
      </PageHead>

      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {/* Resume version selector — powers matching everywhere on this page */}
      <div className="lib-toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="fl" style={{ marginBottom: 0 }} htmlFor="jobs-version">Match against</label>
          {versions.length ? (
            <select id="jobs-version" className="fs" style={{ width: 'auto' }} value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}>
              {versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>)}
            </select>
          ) : (
            <Link to={CAREERS_ROUTES.upload} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
              Upload a resume to enable matching
            </Link>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Kept out of the 7-item tab bar (see CAREERS_NAV) — Job Search is
              where the intent to review roles already lives, so this is the
              door to the queue. */}
          <Link
            to={CAREERS_ROUTES.queue}
            className="btn btn-ghost btn-sm"
            style={{ width: 'auto', textDecoration: 'none' }}
          >
            Review one at a time →
          </Link>
          <Tabs
            variant="nav"
            label="Jobs view"
            style={{ padding: 0 }}
            active={view}
            onChange={setView}
            items={[
              { key: 'search', label: 'Search' },
              { key: 'saved', label: `Saved (${saved.length})` },
              { key: 'analyzer', label: 'JD Analyzer' },
            ]}
          />
        </div>
      </div>

      {view === 'search' && (
        <>
          <div className="card" style={{ padding: 18 }}>
            <div className="grid3" style={{ marginBottom: 10 }}>
              <input className="fi" placeholder="Job title or keyword *" aria-label="Job title or keyword" value={params.query}
                onChange={(e) => setParams((p) => ({ ...p, query: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch(0)} />
              <input className="fi" placeholder="City / state" aria-label="Location" value={params.location}
                onChange={(e) => setParams((p) => ({ ...p, location: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch(0)} />
              <select className="fs" aria-label="Country" value={params.country}
                onChange={(e) => setParams((p) => ({ ...p, country: e.target.value }))}>
                <option value="in">India</option>
                <option value="gb">United Kingdom</option>
                <option value="us">United States</option>
                <option value="au">Australia</option>
                <option value="sg">Singapore</option>
                <option value="ae">UAE</option>
              </select>
            </div>
            <div className="grid3" style={{ marginBottom: 10 }}>
              <select className="fs" aria-label="Work mode" value={params.workMode}
                onChange={(e) => setParams((p) => ({ ...p, workMode: e.target.value as JobSearchParams['workMode'] }))}>
                <option value="">Any work mode</option>
                <option value="remote">Remote / WFH only</option>
                <option value="hybrid">Hybrid only</option>
                <option value="onsite">On-site</option>
              </select>
              <select className="fs" aria-label="Employment type" value={params.employmentType}
                onChange={(e) => setParams((p) => ({ ...p, employmentType: e.target.value }))}>
                <option value="">Any employment type</option>
                <option value="fulltime">Full-time</option>
                <option value="parttime">Part-time</option>
                <option value="contract">Contract</option>
                <option value="intern">Internship / graduate</option>
              </select>
              <select className="fs" aria-label="Industry" value={params.industry}
                onChange={(e) => setParams((p) => ({ ...p, industry: e.target.value }))}>
                <option value="">Any industry</option>
                {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="grid3" style={{ marginBottom: 14 }}>
              <input className="fi" type="number" min={0} placeholder="Min salary (₹/yr)" aria-label="Minimum salary" value={params.salaryMin ?? ''}
                onChange={(e) => setParams((p) => ({ ...p, salaryMin: e.target.value ? Number(e.target.value) : null }))} />
              <input className="fi" type="number" min={0} placeholder="Max salary (₹/yr)" aria-label="Maximum salary" value={params.salaryMax ?? ''}
                onChange={(e) => setParams((p) => ({ ...p, salaryMax: e.target.value ? Number(e.target.value) : null }))} />
              <button className={`btn ${searching ? 'btn-loading' : ''}`} disabled={searching} onClick={() => void runSearch(0)}>
                {searching ? 'Searching…' : 'Search jobs'}
              </button>
            </div>
            <div className="note">
              Listings are aggregated from a broad set of trusted job sources across the web and refreshed
              continuously. Each posting shows its original source, and duplicate listings are merged automatically.
            </div>
          </div>

          {searchError && <ErrorCard error={searchError} onRetry={() => void runSearch(params.page)} />}

          {report && !searching && (
            <div className="lib-toolbar" style={{ flexWrap: 'wrap' }}>
              <label className="fl" style={{ marginBottom: 0 }} htmlFor="jobs-threshold">
                Match threshold: <b style={{ color: 'var(--gold)' }}>{threshold}%</b>
              </label>
              <input
                id="jobs-threshold" type="range" min={0} max={100} step={5} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                style={{ flex: '0 1 200px', accentColor: '#D4AF37' }}
              />
              <select
                className="fs" aria-label="Sort results" value={sortMode}
                style={{ width: 'auto', padding: '8px 34px 8px 12px', fontSize: 13 }}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="best">Best match first</option>
                <option value="newest">Newest first</option>
                <option value="salary">Highest salary first</option>
              </select>
              <span className="note">
                {resumeInput
                  ? `Jobs below ${threshold}% Resume Match are never shown.`
                  : 'Upload a resume to enable Resume Match filtering.'}
              </span>
            </div>
          )}

          {/* One search-quality strip: result counts + provider health. Partial
              provider failures never fail the whole search. */}
          {report && !searching && (() => {
            const q = report.quality;
            const cov = q.providerCoverage;
            // Source names are deliberately not shown to users — the experience is
            // native to FinatriX. Detailed per-source health lives in the internal
            // admin dashboard. Here we surface only an honest aggregate.
            const ran = Object.values(cov).filter((s) => s === 'ok' || s === 'error' || s === 'timeout').length;
            const cb = q.confidenceBreakdown;
            return (
              <div className="card" role="status" style={{ padding: '12px 18px', marginBottom: 10 }}>
                <div className="job-meta" style={{ gap: 16 }}>
                  <span><b style={{ color: 'var(--ink)' }}>{visibleResults.length}</b> relevant jobs shown</span>
                  <span>{q.rejected} filtered out
                    {q.rejected > 0 && (
                      <span className="note">
                        {' '}({Object.entries(q.rejectedByReason).map(([r, n]) => `${n} ${r.replace('-', ' ')}`).join(', ')})
                      </span>
                    )}
                  </span>
                  {q.averageMatch != null && (
                    <span>Avg match <b style={{ color: scoreColor(q.averageMatch) }}>{q.averageMatch}%</b></span>
                  )}
                  <span
                    title={cb ? `Providers ${cb.providerCoverage}% · Resume ${cb.resume}% · Query ${cb.query}% · Classification ${cb.classification}%` : undefined}
                    style={{ cursor: cb ? 'help' : undefined }}
                  >
                    Search confidence <b style={{ color: scoreColor(q.searchConfidence) }}>{q.searchConfidence}%</b>
                  </span>
                </div>
                {Object.keys(cov).length > 0 && (
                  <div className="job-meta" style={{ gap: 14, marginTop: 6 }}>
                    <span><b style={{ color: 'var(--ink)' }}>{ran}</b> source{ran === 1 ? '' : 's'} searched</span>
                    {(() => {
                      const vals = Object.values(cov);
                      const live = vals.filter((st) => st === 'ok').length;
                      const degraded = vals.filter((st) => st === 'timeout' || st === 'error').length;
                      return (
                        <>
                          <span style={{ color: 'var(--green)' }}>✓ {live} live</span>
                          {degraded > 0 && (
                            <span style={{ color: 'var(--orange)' }}>· {degraded} temporarily unavailable</span>
                          )}
                        </>
                      );
                    })()}
                    {q.duplicatesRemoved > 0 && <span className="note">· {q.duplicatesRemoved} duplicate{q.duplicatesRemoved === 1 ? '' : 's'} removed</span>}
                    {q.timings?.totalMs != null && <span className="note">· ranked in {Math.round(q.timings.totalMs)}ms</span>}
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
            return (
              <div className="card result-card-anim" key={`${job.source}-${job.external_id}-${i}`} style={{ padding: 18, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 650 }}>{job.title}</div>
                    <div className="job-meta">
                      <span><b style={{ color: 'var(--ink)' }}>{job.company || 'Unknown company'}</b></span>
                      {job.location && <span>{job.location}</span>}
                      {job.classification.category !== 'other' && (
                        <span className="badge badge-gold">{categoryLabel(job.classification.category)}</span>
                      )}
                      {(job.workMode || job.work_mode) && <span className="badge badge-blue">{job.workMode || job.work_mode}</span>}
                      {job.employment && <span>{job.employment}</span>}
                      {(job.salary_min || job.salary_max) && (
                        <span>{[job.salary_min, job.salary_max].filter(Boolean).map((n) => n!.toLocaleString()).join(' – ')} {job.currency}</span>
                      )}
                      {job.posted_at && <span>Posted {formatDate(job.posted_at)}</span>}
                      <span className="badge badge-mute">via {job.via}</span>
                    </div>
                    {/* Truthful, earned trust/quality chips (freshness, salary,
                        remote, confidence, skill match) — each reflects a real
                        fact the search backend computed, never a vendor name. */}
                    {job.badges && job.badges.length > 0 && (
                      <div className="job-meta" style={{ marginTop: 4 }}>
                        {job.badges
                          .filter((b) => TRUST_BADGES[b])
                          .slice(0, 4)
                          .map((b) => (
                            <span key={b} className="badge badge-green">{TRUST_BADGES[b]}</span>
                          ))}
                      </div>
                    )}
                    {intelMap.get(s) && (
                      <div className="job-meta" style={{ marginTop: 4 }}>
                        {intelBadges(intelMap.get(s)!).map((b) => (
                          <span key={b} className="badge badge-blue">{b}</span>
                        ))}
                        <Link
                          className="badge badge-gold"
                          style={{ textDecoration: 'none' }}
                          to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(intelMap.get(s)!.id)}`}
                        >
                          Company intelligence ↗
                        </Link>
                        {(boostMap.get(s)?.why ?? []).map((w) => (
                          <span key={w} className="badge" style={{ background: 'rgba(18,183,106,.12)', color: 'var(--green, #12b76a)' }}>★ {w}</span>
                        ))}
                      </div>
                    )}
                    {s.why.length > 0 && (
                      <div className="note" style={{ marginTop: 6 }}>
                        Why this job: {s.why.slice(0, 2).join(' · ')}
                      </div>
                    )}
                    {s.match && s.match.missingTerms.length > 0 && (
                      <div className="note" style={{ marginTop: 2 }}>
                        Missing from your resume: {s.match.missingTerms.slice(0, 4).join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    {pct != null ? (
                      <ScoreRing score={pct} caption={ai ? 'AI match' : 'match'} size={62} />
                    ) : (
                      <span className="note">no resume</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    className={`btn btn-sm ${openingKey === `${job.source}-${job.external_id}` ? 'btn-loading' : ''}`}
                    disabled={!!openingKey}
                    onClick={() => void openNormalized(job)}
                  >
                    {openingKey === `${job.source}-${job.external_id}` ? 'Opening…' : 'Analyse & match'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    if (user) void saveJob(user.id, job).then(() => { notify('Job saved.', 'ok'); void loadSaved(); })
                      .catch((e) => notify(toCareersError(e).message, 'error'));
                  }}>
                    Save
                  </button>
                  <a className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }} href={job.apply_url} target="_blank" rel="noopener noreferrer">
                    Apply ↗
                  </a>
                </div>
              </div>
            );
          })}

          {/* Successful search, but the match threshold hid everything — a
              dead-looking page with no explanation. Say why, and offer the
              one-click way out. */}
          {!searching && results.length > 0 && visibleResults.length === 0 && (() => {
            const best = Math.max(...results.map((s) => effectiveMatch(s) ?? 0));
            return (
              <div className="card">
                <EmptyState
                  icon="goal"
                  title={`${results.length} job${results.length === 1 ? '' : 's'} matched — all below your ${threshold}% threshold`}
                  action={
                    <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => setThreshold(0)}>
                      Show all {results.length} jobs
                    </button>
                  }
                >
                  The strongest Resume Match in this search scored {best}%. Lower the
                  threshold above, or show everything and judge for yourself.
                </EmptyState>
              </div>
            );
          })()}

          {!searching && results.length > 0 && visibleResults.length > 0 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 6 }}>
              {params.page > 0 && (
                <button className="btn btn-ghost btn-sm" disabled={searching} onClick={() => void runSearch(params.page - 1)}>← Previous</button>
              )}
              <button className="btn btn-ghost btn-sm" disabled={searching} onClick={() => void runSearch(params.page + 1)}>Next page →</button>
            </div>
          )}

          {/* No live jobs (or backend down) → Company Intelligence fallback. */}
          {results.length === 0 && companyFallback.length > 0 && (
            <section aria-label="Matching companies from your intelligence base" style={{ marginTop: 4 }}>
              <div className="note" style={{ marginBottom: 8 }}>
                {searchError ? 'Live job search is unavailable right now, but ' : 'No live job listings matched, but '}
                {companyFallback.length} compan{companyFallback.length === 1 ? 'y' : 'ies'} in your intelligence base match this search:
              </div>
              {companyFallback.map((c) => (
                <div className="card" key={c.id} style={{ padding: 16, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 650 }}>{c.name}</div>
                      <div className="job-meta">
                        {c.industry && <span className="badge badge-gold">{c.industry}</span>}
                        {(c.hqCity || c.hqCountry) && <span>{[c.hqCity, c.hqCountry].filter(Boolean).join(', ')}</span>}
                        {(c.graduateFriendly || c.graduatePrograms.length > 0) && <span className="badge badge-blue">Graduate program</span>}
                        {(c.internFriendly || c.internships.length > 0) && <span className="badge badge-blue">Internships</span>}
                        {c.confidenceScore != null && <span className="badge badge-mute">Intel {c.confidenceScore}%</span>}
                      </div>
                    </div>
                    <Link
                      className="btn btn-ghost btn-sm"
                      style={{ width: 'auto', textDecoration: 'none', flexShrink: 0 }}
                      to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(c.id)}`}
                    >
                      View intelligence ↗
                    </Link>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {view === 'saved' && (
        !saved.length ? (
          <div className="card">
            <EmptyState icon="park" title="No saved jobs yet">
              Analyse a search result or paste a job description — everything you keep lands here.
            </EmptyState>
          </div>
        ) : (
          saved.map((row) => (
            <div className="card" key={row.id} style={{ padding: 18, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 650 }}>{row.title}</div>
                  <div className="job-meta">
                    <span><b style={{ color: 'var(--ink)' }}>{row.company}</b></span>
                    {row.location && <span>{row.location}</span>}
                    <span className="badge badge-mute">{row.source}</span>
                    {row.analysis ? <span className="badge badge-green">analysed</span> : <span className="badge badge-mute">not analysed</span>}
                    <span>Saved {formatDate(row.created_at)}</span>
                  </div>
                </div>
                <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => openSaved(row)}>Open</button>
                <button
                  className="icon-btn danger" aria-label={`Remove ${row.title}`}
                  onClick={() => { if (user) void deleteJob(user.id, row.id).then(loadSaved).catch((e) => notify(toCareersError(e).message, 'error')); }}
                >✕</button>
              </div>
            </div>
          ))
        )
      )}

      {view === 'analyzer' && (
        <div className="card">
          <div className="panel-eyebrow">Job description analyzer</div>
          <p className="panel-sub" style={{ margin: '8px 0 14px' }}>
            Paste any job description — or upload it as PDF/DOCX — and get the full
            intelligence + match + tailoring workflow, even for jobs found elsewhere.
          </p>
          <textarea
            className="fi"
            style={{ minHeight: 200, resize: 'vertical', lineHeight: 1.55 }}
            placeholder="Paste the job description here…"
            aria-label="Job description text"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${analyzing ? 'btn-loading' : ''}`} disabled={analyzing} onClick={() => void analyzePasted()}>
              Analyse pasted text
            </button>
            <label className="btn btn-ghost btn-sm" style={{ width: 'auto', cursor: 'pointer' }}>
              Upload PDF / DOCX
              <input
                type="file" hidden accept=".pdf,.docx,.doc"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void analyzeFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
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

      <ToolFoot>
        <b>Job Intelligence</b> · identical postings are analysed once and cached — AI spend stays minimal
      </ToolFoot>
    </div>
  );
}
