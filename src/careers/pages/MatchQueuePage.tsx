/**
 * Match Queue — review one matched job at a time and give it a verdict.
 *
 * Everything on the card is already computed elsewhere: the search pipeline
 * ranks and quick-matches, `matchEngine` scores, `enrich` badges. This page
 * adds no intelligence. What it adds is *attention* — the existing Job Search
 * page shows twenty results at once, which is a list people skim; this shows
 * one, which is a decision people make.
 *
 * The card argues both sides. Strengths and gaps get equal billing, because a
 * score nobody believes is a score nobody uses, and "these four things the job
 * asks for are not in your resume" is the single most useful sentence we can
 * put in front of someone before they spend an application on it.
 *
 * No application is ever submitted from here. "Apply" opens the employer's own
 * posting and records the application as `ready_to_apply` — the automated
 * submission path is a later phase and a separate decision.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { track as trackEvent } from '../../lib/analytics';
import { useToast } from '../../tools/ui/Toast';
import { CountryOptions } from '../components/CountryOptions';
import { ErrorCard, PageLoading, SkeletonCards } from '../components/states';
import { JobCard } from '../areas/jobs/JobCard';
import { CxIcon } from '../ui/icons';
import { Empty } from '../ui/primitives';
import { CAREERS_ROUTES } from '../constants';
import { useCareers } from '../context/CareersContext';
import { buildDeck, gapsOf, progressOf, strengthsOf, type QueueVerdict } from '../queue/deck';
import { clearDecisions, loadDecisions, recordDecision } from '../queue/decisions';
import { createApplication } from '../services/applications';
import { jobContentSha, saveJob, searchProviders } from '../services/jobsService';
import { runSearchPipeline, type ScoredJob } from '../search/pipeline';
import type { QuickMatchInput } from '../search/quickMatch';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import {
  DEFAULT_MATCH_THRESHOLD,
  DEFAULT_SEARCH_PARAMS,
  type JobSearchParams,
} from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { fitLabel } from '../utils/format';
import { safeHttpUrl } from '../../lib/sanitize';

/** Resume versions that can actually be matched against. Mirrors JobsPage. */
function completeVersions(resumes: ResumeWithVersions[]): { label: string; version: ResumeVersionRow }[] {
  return resumes.flatMap((r) =>
    r.versions
      .filter((v) => v.status === 'complete' && v.parsed)
      .map((v) => ({ label: `${r.name} · v${v.version_number}`, version: v })),
  );
}

const VERDICT_COPY: Record<QueueVerdict, string> = {
  declined: 'Declined',
  skipped: 'Skipped for now',
  applied: 'Moved to Applications',
};

export default function MatchQueuePage() {
  const { user } = useAuth();
  const { loading, error, profile, resumes, refresh, settings } = useCareers();
  const { notify } = useToast();

  const versions = useMemo(() => completeVersions(resumes), [resumes]);
  const [versionId, setVersionId] = useState('');
  const version = versions.find((v) => v.version.id === versionId)?.version ?? versions[0]?.version ?? null;

  // Prefilled from the career profile — the queue should be one click from
  // useful for anyone who has already told us what they are looking for.
  const [params, setParams] = useState<JobSearchParams>({ ...DEFAULT_SEARCH_PARAMS });
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !profile) return;
    setParams((p) => ({
      ...p,
      query: p.query || profile.preferred_role || profile.job_title || '',
      location: p.location || profile.location_preference || '',
    }));
    setPrefilled(true);
  }, [profile, prefilled]);

  const [threshold] = useState(DEFAULT_MATCH_THRESHOLD);
  const [building, setBuilding] = useState(false);
  const [jobs, setJobs] = useState<ScoredJob[]>([]);
  const [keys, setKeys] = useState<Map<ScoredJob, string>>(new Map());
  const [decisions, setDecisions] = useState<Map<string, QueueVerdict>>(new Map());
  const [searchError, setSearchError] = useState<CareersError | null>(null);
  const [acting, setActing] = useState(false);
  const [lastVerdict, setLastVerdict] = useState<QueueVerdict | null>(null);
  const [started, setStarted] = useState(false);
  const searchSeq = useRef(0);

  /**
   * Every effect and callback below keys off the id, never the `user` object.
   * An auth context that hands back a fresh object each render would otherwise
   * re-run the loader, set state, and re-render — forever.
   */
  const userId = user?.id ?? null;

  // Remembered declines load once per account, before any deck is built.
  useEffect(() => {
    if (userId) setDecisions(loadDecisions(userId));
  }, [userId]);

  const resumeInput = useMemo<QuickMatchInput | null>(() => {
    if (!version?.parsed || !version.raw_text) return null;
    return { parsed: version.parsed, rawText: version.raw_text, careerDna: version.career_dna, profile };
  }, [version, profile]);

  const deck = useMemo(
    () => buildDeck(jobs, keys, decisions, threshold),
    [jobs, keys, decisions, threshold],
  );
  const card = deck.cards[0] ?? null;
  const progress = progressOf(deck);

  const build = async () => {
    if (!params.query.trim()) {
      notify('Enter a role to queue up.', 'error');
      return;
    }
    const seq = ++searchSeq.current;
    setBuilding(true);
    setSearchError(null);
    setStarted(true);
    try {
      const out = await runSearchPipeline(
        { ...params, page: 0 },
        resumeInput,
        (p, terms) => searchProviders(p, terms),
        { resumeKey: version?.id ?? 'none' },
      );
      if (seq !== searchSeq.current) return; // superseded by a newer build
      const map = new Map<ScoredJob, string>();
      await Promise.all(out.jobs.map(async (s) => { map.set(s, await jobContentSha(s.job)); }));
      if (seq !== searchSeq.current) return;
      setJobs(out.jobs);
      setKeys(map);
      trackEvent('job_search_completed', {
        count: out.jobs.length === 0 ? 0 : out.jobs.length < 10 ? 1 : 10,
        ok: out.jobs.length > 0,
        where: version?.id ? 'with-resume' : 'no-resume',
      });
    } catch (e) {
      if (seq !== searchSeq.current) return;
      const err = toCareersError(e);
      trackEvent('job_search_completed', { ok: false, kind: err.code });
      setSearchError(err);
    } finally {
      if (seq === searchSeq.current) setBuilding(false);
    }
  };

  /**
   * Record a verdict and advance.
   *
   * For `applied` the employer's tab must be opened by the click itself —
   * opening it after the `createApplication` round-trip lands in a popup
   * blocker, and the user is left believing the application went nowhere.
   */
  const decide = useCallback(async (verdict: QueueVerdict) => {
    if (!card || !userId || acting) return;
    const key = keys.get(card);
    setActing(true);
    try {
      if (verdict === 'applied') {
        const url = safeHttpUrl(card.job.apply_url);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        // Persist the job first so the application attaches to a real row —
        // the same ordering JobsPage uses when opening the workbench.
        const row = await saveJob(userId, card.job).catch(() => null);
        await createApplication(userId, {
          company_name: card.job.company || 'Unknown company',
          job_title: card.job.title || 'Unknown role',
          job_id: row?.id ?? null,
          resume_version_id: version?.id ?? null,
          location: card.job.location ?? '',
          work_mode: card.job.work_mode ?? '',
          source: card.job.source ?? 'match-queue',
          job_url: url ?? '',
          match_score: card.match?.overall ?? null,
          ats_score: version?.ats_score ?? null,
          closes_at: card.job.closes_at ?? null,
          stage: 'ready_to_apply',
        });
        void refresh();
      }
      if (key) {
        recordDecision(userId, key, verdict);
        setDecisions((prev) => new Map(prev).set(key, verdict));
      }
      setLastVerdict(verdict);
      trackEvent('match_queue_decided', {
        action: verdict,
        value: card.match?.overall ?? 0,
        where: version?.id ? 'with-resume' : 'no-resume',
      });
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setActing(false);
    }
  }, [card, userId, acting, keys, version, refresh, notify]);

  // Keyboard review: ← decline · → apply · S skip. Ignored while the user is
  // typing, so the search inputs above keep working normally.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const verdict =
        e.key === 'ArrowLeft' ? 'declined' :
        e.key === 'ArrowRight' ? 'applied' :
        e.key === 's' || e.key === 'S' ? 'skipped' : null;
      if (!verdict) return;
      e.preventDefault();
      void decide(verdict);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, decide]);

  if (loading) return <PageLoading />;

  const score = card?.match?.overall ?? null;
  const strengths = card ? strengthsOf(card) : [];
  const gaps = card ? gapsOf(card) : [];

  return (
    <div className="cx-grid">
      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {/* Setup — resume + what to queue */}
      <section className="cx-panel" aria-label="Queue setup">
        <div className="jb-filters" style={{ marginTop: 0 }}>
          <input
            className="fi" placeholder="Role or keyword" aria-label="Role or keyword"
            value={params.query}
            onChange={(e) => setParams((p) => ({ ...p, query: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && void build()}
          />
          <input
            className="fi" placeholder="City or state" aria-label="Location"
            value={params.location}
            onChange={(e) => setParams((p) => ({ ...p, location: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && void build()}
          />
          <select
            className="fs" aria-label="Country" value={params.country}
            onChange={(e) => setParams((p) => ({ ...p, country: e.target.value }))}
          >
            <CountryOptions />
          </select>
        </div>
        <div className="jb-version" style={{ marginTop: 12, marginBottom: 0 }}>
          <label htmlFor="queue-version">Match against</label>
          {versions.length ? (
            <select
              id="queue-version" className="fs"
              value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}
            >
              {versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>)}
            </select>
          ) : (
            <Link to={CAREERS_ROUTES.upload} className="cx-btn cx-btn-sm">
              Upload a resume to enable scoring
            </Link>
          )}
          <button className="cx-btn cx-btn-primary cx-btn-sm" disabled={building} onClick={() => void build()}>
            {building ? 'Building…' : started ? 'Rebuild queue' : 'Build my queue'}
          </button>
        </div>
        {!versions.length && (
          <p className="cx-muted" style={{ marginTop: 10, fontSize: 13 }}>
            Without a resume every job still queues up, but unscored.
          </p>
        )}
      </section>

      {searchError && <ErrorCard error={searchError} onRetry={() => void build()} />}

      {building && <SkeletonCards count={1} label="Building your queue" />}

      {/* Progress — terminal verdicts only; skipping is not progress. */}
      {!building && started && progress.total > 0 && (
        <div className="jb-progress">
          <span className="cx-sub" aria-live="polite">
            <span className="cx-num">{progress.reviewed}</span> of {progress.total} reviewed
            {deck.deferred > 0 && `, ${deck.deferred} skipped and back at the end`}
            {deck.belowThreshold > 0 && `, ${deck.belowThreshold} below ${threshold}%`}
          </span>
          <div
            className="q-progress" role="progressbar" aria-label="Queue progress"
            aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}
          >
            <div className="q-progress-fill" style={{ transform: `scaleX(${progress.pct / 100})` }} />
          </div>
        </div>
      )}

      {/* The card */}
      {!building && card && (
        <JobCard
          // A new instance per job, so a "Why this match" left open on one card
          // does not carry over to the next.
          key={`${card.job.source}-${card.job.external_id}`}
          headingLevel="h2"
          // The primary Apply records the decision and opens the posting; a
          // second, untracked "Apply" link would skip the record.
          hideLink
          job={card.job}
          declaredRights={settings.declaredRights}
          score={score}
          why={card.why}
          primary={
            <button className="cx-btn cx-btn-primary" disabled={acting} onClick={() => void decide('applied')}>
              {acting ? 'Saving…' : 'Apply'}
              {!acting && <CxIcon name="external" size={14} />}
            </button>
          }
          secondary={
            <>
              <button className="cx-btn cx-btn-sm" disabled={acting} onClick={() => void decide('declined')}>
                Decline
              </button>
              <button className="cx-btn cx-btn-quiet cx-btn-sm" disabled={acting} onClick={() => void decide('skipped')}>
                Skip
              </button>
              {safeHttpUrl(card.job.apply_url) && (
                <a className="cx-btn cx-btn-quiet cx-btn-sm" href={safeHttpUrl(card.job.apply_url)!} target="_blank" rel="noopener noreferrer">
                  View posting
                  <CxIcon name="external" size={14} />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </>
          }
        >
          <p className="cx-sub" style={{ marginTop: 10, fontWeight: 600 }}>{fitLabel(score)}</p>

          {/* Both sides of the argument, side by side and equally weighted. */}
          <div className="jb-lists">
            <div>
              <h3>What lines up</h3>
              {strengths.length ? (
                <div className="jb-chip-row">
                  {strengths.map((s) => <span key={s} className="cx-chip cx-chip-good">{s}</span>)}
                </div>
              ) : (
                <p className="cx-muted" style={{ fontSize: 13, margin: 0 }}>
                  {score == null ? 'Select a resume to see this.' : 'Nothing specific matched. Treat the score with caution.'}
                </p>
              )}
            </div>
            <div>
              <h3>Not evidenced in your resume</h3>
              {gaps.length ? (
                <div className="jb-chip-row">
                  {gaps.map((g) => <span key={g} className="cx-chip">{g}</span>)}
                </div>
              ) : (
                <p className="cx-muted" style={{ fontSize: 13, margin: 0 }}>
                  {score == null ? 'Select a resume to see this.' : 'No significant gaps found.'}
                </p>
              )}
            </div>
          </div>
          <p className="jb-hint">
            <kbd>←</kbd> decline, <kbd>S</kbd> skip, <kbd>→</kbd> apply.
            Apply opens the employer's own posting and tracks it as ready to apply. Nothing is submitted for you.
          </p>
          <p className="jb-hint" aria-live="polite" style={{ minHeight: 16 }}>
            {lastVerdict ? VERDICT_COPY[lastVerdict] : ''}
          </p>
        </JobCard>
      )}

      {/* Deck exhausted */}
      {!building && started && !card && (
        <section className="cx-panel" aria-label="Queue status">
          {progress.total === 0 && !searchError ? (
            <Empty title={`Nothing cleared the ${threshold}% bar`}>
              {deck.belowThreshold > 0
                ? `${deck.belowThreshold} role${deck.belowThreshold === 1 ? '' : 's'} matched your search but scored below ${threshold}% against this resume. Try a broader role title, another location, or a different resume version.`
                : 'No live roles matched that search. Try a broader role title or another location.'}
            </Empty>
          ) : (
            <Empty
              title="Queue clear"
              action={
                <div className="jb-actions" style={{ marginTop: 0 }}>
                  <button className="cx-btn cx-btn-primary cx-btn-sm" onClick={() => void build()}>
                    Find more roles
                  </button>
                  <Link className="cx-btn cx-btn-sm" to={CAREERS_ROUTES.applications}>
                    Go to Applications
                  </Link>
                  {userId && (
                    <button
                      className="cx-btn cx-btn-quiet cx-btn-sm"
                      onClick={() => { clearDecisions(userId); setDecisions(new Map()); notify('Declined roles will show again.', 'ok'); }}
                    >
                      Reset declines
                    </button>
                  )}
                </div>
              }
            >
              You reviewed {progress.reviewed} role{progress.reviewed === 1 ? '' : 's'}. Anything you
              applied to is waiting in Applications.
            </Empty>
          )}
        </section>
      )}

      {/* First visit */}
      {!building && !started && (
        <section className="cx-panel" aria-label="Queue status">
          <Empty title="Build your first queue">
            Enter a role above. Each live opening is scored against your resume and shown one at a time.
          </Empty>
        </section>
      )}
    </div>
  );
}
