import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useCurrency } from '../CurrencyContext';
import { readDashboard, type DashboardSnapshot, type Pillar } from '../lib/dashboard';
import { getUpcomingEvents } from '../lib/calendar';
import {
  DASH_SECTIONS, getDashPrefs, toggleSection, moveSection, resetDashPrefs,
  type DashPrefs, type DashSectionId,
} from '../lib/dashboardPrefs';

/* ─────────────────────────── motion helpers ─────────────────────────── */
const reduce = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Ease-out count-up used by the score + headline figures. Honors reduced motion. */
function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(() => (reduce() ? target : 0));
  useEffect(() => {
    // Reduced motion: jump straight to the value (and keep it in sync when the
    // target prop changes). Intentional sync set — there is nothing to animate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reduce()) { setV(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ─────────────────────────── health ring ─────────────────────────── */
function HealthRing({ score }: { score: number | null }) {
  const shown = useCountUp(score ?? 0);
  const pct = score == null ? 0 : Math.max(0, Math.min(100, shown)) / 100;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: 148, height: 148, flex: '0 0 auto' }}>
      <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
        <defs>
          <linearGradient id="fxHealthArc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#EAD27E" />
            <stop offset="100%" stopColor="#C9A23C" />
          </linearGradient>
        </defs>
        <circle cx="74" cy="74" r={R} fill="none" stroke="var(--hair)" strokeWidth="10" />
        <circle
          cx="74" cy="74" r={R} fill="none"
          stroke={score == null ? 'var(--hair)' : 'url(#fxHealthArc)'}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 74 74)"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, color: 'var(--ink)' }}>
            {score == null ? '—' : Math.round(shown)}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink3)', marginTop: 4 }}>
            / 100
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── journey stepper ─────────────────────────── */
function Journey({ pillars, nextId }: { pillars: Pillar[]; nextId: string | null }) {
  return (
    <ol className="fx-journey" role="list">
      {pillars.map((p, i) => {
        const state = p.done ? 'done' : p.id === nextId ? 'now' : 'todo';
        return (
          <li key={p.id} className={`fx-journey-step is-${state}`}>
            <Link to={p.href} className="fx-journey-link" aria-label={`${p.label} — ${p.done ? 'done' : p.id === nextId ? 'do next' : 'not started'}: ${p.detail}`}>
              <span className="fx-journey-node" aria-hidden="true">
                {p.done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <span className="fx-journey-num">{i + 1}</span>
                )}
              </span>
              <span className="fx-journey-label">{p.label}</span>
              <span className="fx-journey-detail">{p.detail}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────────── small building blocks ─────────────────────────── */
function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-cell" style={{ textAlign: 'left', padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--ink)', marginTop: 6, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** Restrained monochrome allocation bar (platinum → gold), no rainbow. */
function AllocBar({ alloc }: { alloc: Array<{ label: string; pct: number }> }) {
  const shades = ['#D4AF37', '#B9932F', 'var(--ink3)', 'var(--hair)', 'var(--hair2)'];
  const top = alloc.slice(0, 5);
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 980, overflow: 'hidden', background: 'var(--hair2)' }}>
        {top.map((a, i) => (
          <span key={a.label} style={{ width: `${a.pct}%`, background: shades[i] ?? 'var(--hair)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 10 }}>
        {top.slice(0, 3).map((a, i) => (
          <span key={a.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: shades[i] ?? 'var(--hair)' }} />
            {a.label} · {a.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── metric cards ─────────────────────────── */
function CardShell({ eyebrow, href, cta, children }: { eyebrow: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className="metric" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="ml">{eyebrow}</span>
        <Link to={href} className="fx-card-cta" aria-label={`${cta} — open tool`}>
          {cta}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
      <div style={{ marginTop: 12, flex: 1 }}>{children}</div>
    </div>
  );
}

function SetupCard({ eyebrow, title, desc, href, cta }: { eyebrow: string; title: string; desc: string; href: string; cta: string }) {
  return (
    <Link to={href} className="metric fx-setup-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none' }}>
      <span className="ml">{eyebrow}</span>
      <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--ink)', letterSpacing: '-.01em' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, flex: 1 }}>{desc}</div>
      <span className="fx-card-cta" style={{ marginTop: 2 }}>
        {cta}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </Link>
  );
}

/* ─────────────────────────── page ─────────────────────────── */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { cfmt, cfmtSh } = useCurrency();
  // Re-read whenever the tab regains focus so returning from a tool reflects new data.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  const snap: DashboardSnapshot = useMemo(() => readDashboard(), [tick]);
  const upcoming = useMemo(() => getUpcomingEvents(new Date(), 30).slice(0, 4), [tick]);

  useEffect(() => { document.title = 'Dashboard — FinatriX'; }, []);

  const [prefs, setPrefs] = useState<DashPrefs>(() => getDashPrefs());
  const [customise, setCustomise] = useState(false);

  const nextId = snap.nextAction ? snap.pillars.find((p) => p.href === snap.nextAction!.href)?.id ?? null : null;
  const updated = useMemo(
    () => new Date(snap.updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    [snap.updatedAt],
  );

  const applyPrefs = (next: DashPrefs) => setPrefs({ ...next });

  const modules: Record<DashSectionId, ReactNode> = {
    recommended: (snap.recommendations.length > 0 || snap.recentActivity.length > 0) ? (
      <div className="fx-dash-2col">
        {snap.recommendations.length > 0 && (
          <section className="card" style={{ padding: '20px 22px', marginBottom: 0 }} aria-labelledby="fx-rec-title">
            <div className="panel-eyebrow" id="fx-rec-title" style={{ marginBottom: 14 }}>Recommended next</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {snap.recommendations.map((r, i) => (
                <Link key={i} to={r.href} className="fx-rec">
                  <span className="fx-rec-body">
                    <span className="fx-rec-label">{r.label}</span>
                    <span className="fx-rec-reason">{r.reason}</span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </Link>
              ))}
            </div>
          </section>
        )}
        {snap.recentActivity.length > 0 && (
          <section className="card" style={{ padding: '20px 22px', marginBottom: 0 }} aria-labelledby="fx-act-title">
            <div className="panel-eyebrow" id="fx-act-title" style={{ marginBottom: 8 }}>Recent activity</div>
            <ul className="fx-act-list" role="list">
              {snap.recentActivity.map((a, i) => (
                <li key={i}>
                  <Link to={a.href} className="fx-act">
                    <span className="fx-act-dot" aria-hidden="true" />
                    <span className="fx-act-label">{a.label}</span>
                    <span className="fx-act-time">{timeAgo(a.ts)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    ) : null,
    milestones: snap.hasAnyData ? (
      <section className="card" style={{ padding: '20px 24px' }} aria-labelledby="fx-ach-title">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="panel-eyebrow" id="fx-ach-title">Milestones</div>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>
            {snap.achievements.filter((a) => a.earned).length} of {snap.achievements.length} earned
          </span>
        </div>
        <div className="fx-ach-grid">
          {snap.achievements.map((a) => (
            <div key={a.id} className={`fx-ach ${a.earned ? 'is-earned' : ''}`}>
              <span className="fx-ach-badge" aria-hidden="true">
                {a.earned ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                )}
              </span>
              <span className="fx-ach-label">{a.label}</span>
              <span className="fx-ach-desc">{a.desc}</span>
            </div>
          ))}
        </div>
      </section>
    ) : null,
    insights: snap.insights.length > 0 ? (
      <section className="card" style={{ padding: '20px 24px' }} aria-labelledby="fx-insights-title">
        <div className="panel-eyebrow" id="fx-insights-title" style={{ marginBottom: 12 }}>Personalised insights</div>
        {snap.insights.map((ins, i) => (
          <div key={i} className={`fx-dash-insight is-${ins.tone}`}>
            <span className="fx-dash-insight-dot" aria-hidden="true" />
            <span>{ins.text}</span>
          </div>
        ))}
      </section>
    ) : null,
    upcoming: upcoming.length > 0 ? (
      <section className="card" style={{ padding: '20px 24px' }} aria-labelledby="fx-upcoming-title">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="panel-eyebrow" id="fx-upcoming-title">Upcoming · next 30 days</div>
          <Link to="/tools/calendar" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>Open calendar →</Link>
        </div>
        {upcoming.map((e) => (
          <Link key={e.id} to="/tools/calendar" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid var(--hair2)', textDecoration: 'none', color: 'inherit' }}>
            <span aria-hidden="true" style={{ width: 34, textAlign: 'center', flexShrink: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{Number(e.date.slice(8, 10))}</span>
              <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' })}</span>
            </span>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: e.accent, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
            {e.amount != null && <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{cfmt(e.amount)}</span>}
          </Link>
        ))}
      </section>
    ) : null,
  };

  return (
    <div className="fx-dash" style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 0 8px' }}>
      <DashStyles />

      {/* ── Hero: score + greeting + KPIs ── */}
      <section className="fx-dash-hero card" aria-labelledby="fx-dash-title">
        <div className="fx-dash-hero-main">
          <HealthRing score={snap.healthScore} />
          <span className="sr-only">
            {snap.healthScore == null
              ? 'Financial health score not yet calculated. Complete a tool to begin.'
              : `Financial health score: ${snap.healthScore} out of 100 — ${snap.healthLabel}. ${snap.healthBasis}`}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Financial health</div>
            <h1 id="fx-dash-title" style={{ fontSize: 'clamp(24px,3.4vw,32px)', fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.05, marginTop: 8, color: 'var(--ink)' }}>
              {snap.healthScore == null ? `${greeting()}.` : `${snap.healthLabel}.`}
            </h1>
            <p style={{ fontSize: 14.5, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.55, maxWidth: 440 }}>
              {snap.healthScore == null
                ? 'Set up your first tool and FinatriX turns it into one clear picture of your money.'
                : snap.healthBasis}
            </p>
            <details className="fx-method">
              <summary>How this score is calculated</summary>
              <p>
                Your score is the average of the areas you've set up — savings rate (Budget),
                spending discipline (Expenses), goal progress, and your investing plan. It rises
                as you complete more tools. Everything is computed privately on your device.
              </p>
            </details>
          </div>
        </div>

        {snap.hasAnyData ? (
          <div className="fx-kpi-grid" role="group" aria-label="Key figures">
            <StatCell label="Monthly income" value={snap.income != null ? cfmt(snap.income) : '—'} />
            <StatCell label="Savings rate" value={snap.savingsRatePct != null ? `${snap.savingsRatePct}%` : '—'} sub={snap.savingsRatePct != null ? (snap.savingsRatePct >= 20 ? 'On target' : 'Below 20% target') : undefined} />
            <StatCell label="Spent this month" value={snap.monthlySpend != null ? cfmt(snap.monthlySpend) : '—'} />
            <StatCell
              label="Net cashflow"
              value={snap.netCashflow != null ? cfmt(snap.netCashflow) : '—'}
              sub={snap.netCashflow != null ? (snap.netCashflow >= 0 ? 'Positive' : 'Overspending') : undefined}
            />
          </div>
        ) : (
          <div className="fx-kpi-empty">
            <Link to="/welcome" className="btn" style={{ textDecoration: 'none' }}>
              Set up in a minute
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
            {snap.nextAction && (
              <Link to={snap.nextAction.href} className="fx-card-cta" style={{ textDecoration: 'none' }}>
                or start with {snap.nextAction.label}
              </Link>
            )}
            <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No sign-up needed · everything stays on your device</span>
          </div>
        )}
      </section>

      {/* ── Journey ── */}
      <section className="card" aria-labelledby="fx-journey-title" style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="panel-eyebrow" id="fx-journey-title">Your financial journey</div>
            <div className="panel-sub" style={{ marginTop: 4 }}>
              {snap.activeCount} of {snap.totalPillars} steps active{snap.nextAction ? ` · next: ${snap.nextAction.label}` : ' · you’re all set'}
            </div>
          </div>
          <div className="fx-journey-progress" aria-hidden="true">
            <span style={{ width: `${Math.round((snap.activeCount / snap.totalPillars) * 100)}%` }} />
          </div>
        </div>
        <Journey pillars={snap.pillars} nextId={nextId} />
      </section>

      {/* ── Connected metric cards ── */}
      <div className="fx-dash-grid">
        {/* Cashflow */}
        {snap.income != null ? (
          <CardShell eyebrow="Cashflow" href="/tools/budget" cta="Budget">
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--ink)' }}>
              {snap.netCashflow != null ? cfmt(snap.netCashflow) : cfmt(snap.income)}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 4 }}>
              {snap.monthlySpend != null ? `${cfmtSh(snap.income)} in · ${cfmtSh(snap.monthlySpend)} out` : 'Left after this month’s spending'}
            </div>
            {snap.monthlySpend != null && snap.income > 0 && (
              <div style={{ display: 'flex', height: 8, borderRadius: 980, overflow: 'hidden', background: 'var(--hair2)', marginTop: 14 }}>
                <span style={{ width: `${Math.min(100, Math.round((snap.monthlySpend / snap.income) * 100))}%`, background: snap.netCashflow != null && snap.netCashflow < 0 ? 'var(--red)' : '#D4AF37' }} />
              </div>
            )}
          </CardShell>
        ) : (
          <SetupCard eyebrow="Cashflow" title="Plan your budget" desc="Split income the 50/30/20 way and see exactly what’s left each month." href="/tools/budget" cta="Open Budget" />
        )}

        {/* Goal */}
        {snap.goal ? (
          <CardShell eyebrow="Top goal" href="/tools/goals" cta="Goals">
            <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--ink)', letterSpacing: '-.01em' }}>{snap.goal.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 3 }}>
              {cfmtSh(snap.goal.target)} in {snap.goal.years} yrs · {cfmt(snap.goal.monthlySip)}/mo
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1, height: 8, borderRadius: 980, overflow: 'hidden', background: 'var(--hair2)' }}>
                <span style={{ display: 'block', height: '100%', width: `${snap.goal.progressPct}%`, background: '#D4AF37' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{snap.goal.progressPct}%</span>
            </div>
          </CardShell>
        ) : (
          <SetupCard eyebrow="Goals" title="Set a target" desc="Name a goal and work back to the exact monthly SIP that reaches it." href="/tools/goals" cta="Open Goals" />
        )}

        {/* Investments */}
        {snap.invest ? (
          <CardShell eyebrow="Investor profile" href="/tools/investmatch" cta="InvestMatch">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 650, color: 'var(--ink)' }}>{snap.invest.profile}</span>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>· {cfmt(snap.invest.monthly)}/mo</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', margin: '4px 0 14px' }}>
              Projected {cfmtSh(snap.invest.projected)} in {snap.invest.years} yrs
            </div>
            <AllocBar alloc={snap.invest.alloc} />
          </CardShell>
        ) : (
          <SetupCard eyebrow="Investing" title="Match a portfolio" desc="Answer a few questions and get an allocation matched to your risk and horizon." href="/tools/investmatch" cta="Open InvestMatch" />
        )}

        {/* Spending breakdown */}
        {snap.topCategories.length > 0 ? (
          <CardShell eyebrow="Where it goes" href="/tools/expenses" cta="Expenses">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {snap.topCategories.map((c, i) => {
                const max = snap.topCategories[0].amount || 1;
                return (
                  <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '84px 1fr auto', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                    <span style={{ height: 7, borderRadius: 980, background: 'var(--hair2)', overflow: 'hidden', display: 'block' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.max(6, Math.round((c.amount / max) * 100))}%`, background: i === 0 ? '#D4AF37' : 'var(--ink3)' }} />
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{cfmtSh(c.amount)}</span>
                  </div>
                );
              })}
            </div>
          </CardShell>
        ) : (
          <SetupCard eyebrow="Spending" title="Track expenses" desc="Log spending in seconds and watch patterns surface across the month." href="/tools/expenses" cta="Open Expenses" />
        )}
      </div>

      {/* ── Customise dashboard ── */}
      {snap.hasAnyData && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '2px 0 -4px' }}>
          <button
            type="button"
            onClick={() => setCustomise((o) => !o)}
            aria-expanded={customise}
            className="fx-card-cta"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--ink2)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            {customise ? 'Done' : 'Customise'}
          </button>
        </div>
      )}

      {customise && snap.hasAnyData && (
        <section className="card" style={{ padding: '18px 20px' }} aria-label="Customise dashboard">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="panel-eyebrow">Customise your dashboard</div>
            <button type="button" onClick={() => applyPrefs(resetDashPrefs())} style={{ fontSize: 12, color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Reset</button>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {prefs.order.map((id, idx) => {
              const meta = DASH_SECTIONS.find((s) => s.id === id)!;
              const shown = !prefs.hidden.includes(id);
              return (
                <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--hair2)', background: 'var(--fill-03)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={shown} onChange={() => applyPrefs(toggleSection(id))} aria-label={`Show ${meta.label}`} />
                    {meta.label}
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => applyPrefs(moveSection(id, -1))} disabled={idx === 0} aria-label={`Move ${meta.label} up`} className="fx-dash-move">↑</button>
                    <button type="button" onClick={() => applyPrefs(moveSection(id, 1))} disabled={idx === prefs.order.length - 1} aria-label={`Move ${meta.label} down`} className="fx-dash-move">↓</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="note" style={{ marginTop: 10, fontSize: 11.5 }}>Your layout is saved on this device. Hidden sections still appear here so you can bring them back.</p>
        </section>
      )}

      {/* ── Personalisable modules (order + visibility from user prefs) ── */}
      {prefs.order.filter((id) => !prefs.hidden.includes(id)).map((id) => (
        <Fragment key={id}>{modules[id]}</Fragment>
      ))}

      {/* ── Reports cross-link (only when there's something to export) ── */}
      {snap.hasAnyData && (
        <Link to="/tools/reports" className="fx-dash-careers">
          <span className="fx-dash-careers-ic" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
          </span>
          <span className="fx-dash-careers-tx">Export your budget and expenses as branded <b>CSV, Excel or PDF reports</b></span>
          <svg className="fx-dash-careers-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      )}

      {/* ── Ecosystem cross-link ── */}
      <Link to="/careers" className="fx-dash-careers">
        <span className="fx-dash-careers-ic" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" /></svg>
        </span>
        <span className="fx-dash-careers-tx">Job hunting too? Track your resume, ATS score and applications in <b>FinatriX Careers</b></span>
        <svg className="fx-dash-careers-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>

      {/* ── Trust footer ── */}
      <div className="fx-dash-trust">
        <span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
          Computed privately on your device
        </span>
        <span aria-hidden="true">·</span>
        <span>Educational tools, not financial advice</span>
        <span aria-hidden="true">·</span>
        <span>Updated {updated}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── page-scoped styles ───────────────────────────
   Uses the same tokens as the rest of .fx-tools so it themes automatically.
   Kept local to the dashboard so it never leaks into other tool pages. */
function DashStyles() {
  return (
    <style>{`
      .fx-dash-hero { padding: 24px; display: grid; grid-template-columns: 1.15fr 1fr; gap: 26px; align-items: center; }
      .fx-dash-hero-main { display: flex; gap: 22px; align-items: center; min-width: 0; }
      .fx-kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .fx-kpi-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; justify-content: center; }
      .fx-method { margin-top: 12px; }
      .fx-method > summary { font-size: 12px; color: var(--ink3); cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 6px; user-select: none; transition: color .2s ease; }
      .fx-method > summary::-webkit-details-marker { display: none; }
      .fx-method > summary::before { content: "ⓘ"; font-size: 12px; opacity: .8; }
      .fx-method > summary:hover { color: var(--ink2); }
      .fx-method[open] > summary { color: var(--ink2); margin-bottom: 6px; }
      .fx-method > p { font-size: 12.5px; color: var(--ink2); line-height: 1.6; max-width: 460px; }

      .fx-journey-progress { position: relative; width: 132px; height: 6px; border-radius: 980px; background: var(--hair2); overflow: hidden; }
      .fx-journey-progress > span { position: absolute; inset: 0 auto 0 0; height: 100%; background: linear-gradient(90deg,#EAD27E,#C9A23C); border-radius: 980px; transition: width .6s var(--ease-out); }

      .fx-journey { list-style: none; margin: 18px 0 0; padding: 0; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
      .fx-journey-link { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 7px; padding: 12px 6px; border-radius: 14px; border: 1px solid transparent; text-decoration: none; transition: background .2s ease, border-color .2s ease, transform .2s var(--ease-out); position: relative; }
      .fx-journey-link:hover { background: var(--fill-03); border-color: var(--hair2); transform: translateY(-2px); }
      .fx-journey-node { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; border: 1.5px solid var(--hair); color: var(--ink3); background: var(--card-solid); transition: all .25s var(--ease-out); }
      .fx-journey-num { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .fx-journey-label { font-size: 12.5px; font-weight: 600; color: var(--ink); letter-spacing: -.01em; line-height: 1.15; }
      .fx-journey-detail { font-size: 10.5px; color: var(--ink3); line-height: 1.3; }
      .fx-journey-step.is-done .fx-journey-node { border-color: rgba(212,175,55,.5); background: var(--gold-bg); color: var(--accent-text); }
      .fx-journey-step.is-now .fx-journey-node { border-color: var(--gold); color: var(--accent-text); box-shadow: 0 0 0 4px var(--gold-bg); }
      .fx-journey-step.is-now .fx-journey-link { background: var(--gold-bg); border-color: rgba(212,175,55,.3); }
      .fx-journey-step.is-todo .fx-journey-label { color: var(--ink2); }

      .fx-card-cta { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--ink3); text-decoration: none; transition: color .2s ease, gap .2s ease; white-space: nowrap; }
      .fx-card-cta:hover { color: var(--accent-text); gap: 7px; }
      .fx-setup-card { border-style: dashed !important; }
      .fx-setup-card:hover { border-color: rgba(212,175,55,.5) !important; }
      .fx-dash-move { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--hair); background: var(--card); color: var(--ink2); cursor: pointer; font-size: 14px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; transition: background .15s ease, color .15s ease, border-color .15s ease; }
      .fx-dash-move:hover:not(:disabled) { background: var(--fill-06); color: var(--ink); border-color: rgba(212,175,55,.4); }
      .fx-dash-move:disabled { opacity: .4; cursor: not-allowed; }
      .fx-dash-move:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

      .fx-dash-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 14px 0; }

      .fx-dash-insight { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--ink2); line-height: 1.55; padding: 9px 0; border-top: 1px solid var(--hair2); }
      .fx-dash-insight:first-of-type { border-top: none; padding-top: 0; }
      .fx-dash-insight-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; margin-top: 6px; background: var(--gold); }
      .fx-dash-insight.is-ok .fx-dash-insight-dot { background: var(--green); }
      .fx-dash-insight.is-warn .fx-dash-insight-dot { background: var(--orange); }

      .fx-dash-trust { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin: 18px 0 6px; font-size: 11.5px; color: var(--ink3); }
      .fx-dash-trust > span:first-child { display: inline-flex; align-items: center; gap: 6px; }

      .fx-dash-careers { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 14px 18px; border-radius: 16px; border: 1px solid var(--hair2); background: var(--fill-02); text-decoration: none; transition: border-color .2s ease, background .2s ease; }
      .fx-dash-careers:hover { border-color: rgba(212,175,55,.4); background: var(--gold-bg); }
      .fx-dash-careers-ic { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--gold-bg); border: 1px solid rgba(212,175,55,.25); color: var(--accent-text); }
      .fx-dash-careers-tx { flex: 1; font-size: 13px; color: var(--ink2); line-height: 1.45; }
      .fx-dash-careers-tx b { color: var(--ink); font-weight: 600; }
      .fx-dash-careers-arrow { flex: 0 0 auto; color: var(--ink3); transition: color .2s ease, transform .2s ease; }
      .fx-dash-careers:hover .fx-dash-careers-arrow { color: var(--accent-text); transform: translateX(2px); }

      .fx-dash-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0; align-items: start; }

      .fx-rec { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-radius: 14px; border: 1px solid var(--hair2); background: var(--fill-02); text-decoration: none; transition: border-color .2s ease, background .2s ease, transform .2s var(--ease-out); color: var(--ink); }
      .fx-rec:hover { border-color: rgba(212,175,55,.4); background: var(--gold-bg); transform: translateX(2px); }
      .fx-rec-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .fx-rec-label { font-size: 14px; font-weight: 600; letter-spacing: -.01em; color: var(--ink); }
      .fx-rec-reason { font-size: 12.5px; color: var(--ink2); line-height: 1.4; }
      .fx-rec > svg { flex: 0 0 auto; color: var(--ink3); transition: color .2s ease, transform .2s ease; }
      .fx-rec:hover > svg { color: var(--accent-text); transform: translateX(2px); }

      .fx-act-list { list-style: none; margin: 0; padding: 0; }
      .fx-act { display: flex; align-items: center; gap: 11px; padding: 10px 6px; text-decoration: none; border-top: 1px solid var(--hair2); transition: padding-left .2s ease; }
      .fx-act-list li:first-child .fx-act { border-top: none; }
      .fx-act:hover { padding-left: 10px; }
      .fx-act-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--gold); }
      .fx-act-label { flex: 1; font-size: 13.5px; color: var(--ink); font-weight: 500; }
      .fx-act:hover .fx-act-label { color: var(--accent-text); }
      .fx-act-time { font-size: 11.5px; color: var(--ink3); font-variant-numeric: tabular-nums; white-space: nowrap; }

      .fx-ach-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
      .fx-ach { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 14px 6px; border-radius: 14px; border: 1px solid var(--hair2); background: var(--fill-02); transition: border-color .25s var(--ease-out), background .25s var(--ease-out); }
      .fx-ach-badge { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--hair); color: var(--ink3); background: var(--card-solid); }
      .fx-ach-label { font-size: 12px; font-weight: 600; color: var(--ink2); letter-spacing: -.01em; }
      .fx-ach-desc { font-size: 10px; color: var(--ink3); line-height: 1.3; }
      .fx-ach.is-earned { border-color: rgba(212,175,55,.4); background: var(--gold-bg); }
      .fx-ach.is-earned .fx-ach-badge { border-color: rgba(212,175,55,.5); background: linear-gradient(150deg,#F0D779,#C49B2E); color: #1a1400; }
      .fx-ach.is-earned .fx-ach-label { color: var(--ink); }

      @media (max-width: 860px) {
        .fx-dash-2col { grid-template-columns: 1fr; }
        .fx-ach-grid { grid-template-columns: repeat(3, 1fr); }
        .fx-dash-hero { grid-template-columns: 1fr; gap: 20px; }
        .fx-journey { grid-template-columns: repeat(4, 1fr); }
      }
      @media (max-width: 640px) {
        .fx-dash-grid { grid-template-columns: 1fr; }
        .fx-dash-hero-main { flex-direction: column; text-align: center; align-items: center; }
        .fx-dash-hero-main .eyebrow { text-align: center; }
        .fx-method > summary { justify-content: center; }
      }
      @media (max-width: 480px) {
        .fx-journey { grid-template-columns: repeat(2, 1fr); }
        .fx-kpi-grid { grid-template-columns: 1fr 1fr; }
        .fx-ach-grid { grid-template-columns: repeat(2, 1fr); }
      }
    `}</style>
  );
}
