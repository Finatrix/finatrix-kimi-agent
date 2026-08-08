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
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard, PageLoading, SkeletonCards } from '../components/states';
import { ScoreRing } from '../components/ScoreRing';
import { CAREERS_ROUTES } from '../constants';
import { useCareers } from '../context/CareersContext';
import { buildDeck, gapsOf, progressOf, strengthsOf, type QueueVerdict } from '../queue/deck';
import { clearDecisions, loadDecisions, recordDecision } from '../queue/decisions';
import { createApplication } from '../services/applications';
import { jobContentSha, saveJob, searchProviders } from '../services/jobsService';
import { runSearchPipeline, type ScoredJob } from '../search/pipeline';
import { categoryLabel } from '../search/taxonomy';
import type { QuickMatchInput } from '../search/quickMatch';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import {
  DEFAULT_MATCH_THRESHOLD,
  DEFAULT_SEARCH_PARAMS,
  type JobSearchParams,
} from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { fitLabel, formatDate, scoreColor } from '../utils/format';

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
  const { loading, error, profile, resumes, refresh } = useCareers();
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
        const url = card.job.apply_url;
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
    <div className="fx-page">
      <PageHead
        chip="Match Queue"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="compass"
        title="One job at a time"
      >
        Every role scored against your resume, reviewed one card at a time — with
        the gaps shown as plainly as the matches, so you spend applications on
        the jobs that are actually worth one.
      </PageHead>

      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {/* Setup — resume + what to queue */}
      <div className="card" style={{ padding: 18 }}>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <input
            className="fi" placeholder="Role or keyword *" aria-label="Role or keyword"
            value={params.query}
            onChange={(e) => setParams((p) => ({ ...p, query: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && void build()}
          />
          <input
            className="fi" placeholder="City / state" aria-label="Location"
            value={params.location}
            onChange={(e) => setParams((p) => ({ ...p, location: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && void build()}
          />
          <select
            className="fs" aria-label="Country" value={params.country}
            onChange={(e) => setParams((p) => ({ ...p, country: e.target.value }))}
          >
            <option value="in">India</option>
            <option value="gb">United Kingdom</option>
            <option value="us">United States</option>
            <option value="au">Australia</option>
            <option value="sg">Singapore</option>
            <option value="ae">UAE</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="fl" style={{ marginBottom: 0 }} htmlFor="queue-version">Match against</label>
          {versions.length ? (
            <select
              id="queue-version" className="fs" style={{ width: 'auto' }}
              value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}
            >
              {versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>)}
            </select>
          ) : (
            <Link to={CAREERS_ROUTES.upload} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
              Upload a resume to enable scoring
            </Link>
          )}
          <button className={`btn btn-sm ${building ? 'btn-loading' : ''}`} disabled={building} onClick={() => void build()}>
            {building ? 'Building…' : started ? 'Rebuild queue' : 'Build my queue'}
          </button>
        </div>
        {!versions.length && (
          <p className="note" style={{ marginTop: 10 }}>
            Without a resume every job still queues up — it just arrives unscored,
            so there is nothing to weigh it against.
          </p>
        )}
      </div>

      {searchError && <ErrorCard error={searchError} onRetry={() => void build()} />}

      {building && <SkeletonCards count={1} label="Building your queue" />}

      {/* Progress — terminal verdicts only; skipping is not progress. */}
      {!building && started && progress.total > 0 && (
        <div className="lib-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <span className="note" aria-live="polite">
            <b style={{ color: 'var(--ink)' }}>{progress.reviewed}</b> of {progress.total} reviewed
            {deck.deferred > 0 && ` · ${deck.deferred} skipped, back at the end`}
            {deck.belowThreshold > 0 && ` · ${deck.belowThreshold} below ${threshold}%`}
          </span>
          <div
            className="q-progress" role="progressbar" aria-label="Queue progress"
            aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}
          >
            <div className="q-progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {/* The card */}
      {!building && card && (
        <article className="card result-card-anim" style={{ padding: 20 }} aria-label={`${card.job.title} at ${card.job.company}`}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 19, fontWeight: 680, marginBottom: 4 }}>{card.job.title}</h2>
              <div className="job-meta">
                <span><b style={{ color: 'var(--ink)' }}>{card.job.company || 'Unknown company'}</b></span>
                {card.job.location && <span>{card.job.location}</span>}
                {card.job.classification.category !== 'other' && (
                  <span className="badge badge-gold">{categoryLabel(card.job.classification.category)}</span>
                )}
                {(card.job.workMode || card.job.work_mode) && (
                  <span className="badge badge-blue">{card.job.workMode || card.job.work_mode}</span>
                )}
                {(card.job.salary_min || card.job.salary_max) && (
                  <span>
                    {[card.job.salary_min, card.job.salary_max].filter(Boolean).map((n) => n!.toLocaleString()).join(' – ')} {card.job.currency}
                  </span>
                )}
                {card.job.posted_at && <span>Posted {formatDate(card.job.posted_at)}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <ScoreRing score={score} caption="resume match" size={78} />
              <div style={{ fontSize: 12.5, fontWeight: 620, color: scoreColor(score), marginTop: 4 }}>
                {fitLabel(score)}
              </div>
            </div>
          </div>

          {card.why.length > 0 && (
            <p className="note" style={{ marginTop: 12 }}>
              Why this surfaced: {card.why.slice(0, 3).join(' · ')}
            </p>
          )}

          {/* Both sides of the argument, side by side and equally weighted. */}
          <div className="grid2" style={{ gap: 12, marginTop: 14 }}>
            <div>
              <div className="panel-eyebrow">What lines up</div>
              {strengths.length ? (
                <div className="job-meta" style={{ marginTop: 6 }}>
                  {strengths.map((s) => <span key={s} className="badge badge-green">{s}</span>)}
                </div>
              ) : (
                <p className="note" style={{ marginTop: 6 }}>
                  {score == null ? 'Select a resume to see this.' : 'Nothing specific matched — treat the score with caution.'}
                </p>
              )}
            </div>
            <div>
              <div className="panel-eyebrow">Not evidenced in your resume</div>
              {gaps.length ? (
                <div className="job-meta" style={{ marginTop: 6 }}>
                  {gaps.map((g) => <span key={g} className="badge badge-mute">{g}</span>)}
                </div>
              ) : (
                <p className="note" style={{ marginTop: 6 }}>
                  {score == null ? 'Select a resume to see this.' : 'No significant gaps found.'}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" disabled={acting} onClick={() => void decide('declined')}>
              Decline
            </button>
            <button className="btn btn-ghost btn-sm" disabled={acting} onClick={() => void decide('skipped')}>
              Skip
            </button>
            <button className={`btn btn-sm ${acting ? 'btn-loading' : ''}`} disabled={acting} onClick={() => void decide('applied')}>
              {acting ? 'Saving…' : 'Apply ↗'}
            </button>
            {card.job.apply_url && (
              <a
                className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }}
                href={card.job.apply_url} target="_blank" rel="noopener noreferrer"
              >
                View posting
              </a>
            )}
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            <kbd>←</kbd> decline · <kbd>S</kbd> skip · <kbd>→</kbd> apply.
            Apply opens the employer's own posting and tracks it as ready to apply —
            nothing is submitted for you.
          </p>
          <p className="note" aria-live="polite" style={{ minHeight: 16 }}>
            {lastVerdict ? VERDICT_COPY[lastVerdict] : ''}
          </p>
        </article>
      )}

      {/* Deck exhausted */}
      {!building && started && !card && (
        <div className="card">
          {progress.total === 0 && !searchError ? (
            <EmptyState icon="goal" title={`Nothing cleared the ${threshold}% bar`}>
              {deck.belowThreshold > 0
                ? `${deck.belowThreshold} role${deck.belowThreshold === 1 ? '' : 's'} matched your search but scored below ${threshold}% against this resume. Try a broader role title, another location, or a different resume version.`
                : 'No live roles matched that search. Try a broader role title or another location.'}
            </EmptyState>
          ) : (
            <EmptyState
              icon="park"
              title="Queue clear"
              action={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => void build()}>
                    Find more roles
                  </button>
                  <Link className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }} to={CAREERS_ROUTES.applications}>
                    Go to Applications
                  </Link>
                  {userId && (
                    <button
                      className="btn btn-ghost btn-sm" style={{ width: 'auto' }}
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
            </EmptyState>
          )}
        </div>
      )}

      {/* First visit */}
      {!building && !started && (
        <div className="card">
          <EmptyState icon="compass" title="Build your first queue">
            Tell us the role above and we will score every live opening against your
            resume, then hand them to you one at a time.
          </EmptyState>
        </div>
      )}

      <ToolFoot>
        <b>Match Queue</b> · scored against your resume before you spend an application
      </ToolFoot>
    </div>
  );
}
