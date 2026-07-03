/**
 * Careers dashboard — the landing view: latest scores, experience and
 * education at a glance, primary skills, industries, Career DNA summary and
 * recent activity, with a strong upload path when the library is empty.
 */

import { useMemo } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { Icon } from '../../tools/ui/Icon';
import { ScoreRing } from '../components/ScoreRing';
import { EmptyState, ErrorCard } from '../components/states';
import { CAREERS_ROUTES } from '../constants';
import { useCareers } from '../context/CareersContext';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import { formatDate, timeAgo } from '../utils/format';

interface ActivityItem {
  id: string;
  label: string;
  when: string;
  ok: boolean;
}

function latestCompleteVersion(resumes: ResumeWithVersions[]): { resume: ResumeWithVersions; version: ResumeVersionRow } | null {
  let best: { resume: ResumeWithVersions; version: ResumeVersionRow } | null = null;
  for (const resume of resumes) {
    if (resume.is_archived) continue;
    for (const version of resume.versions) {
      if (version.status !== 'complete') continue;
      if (!best || version.updated_at > best.version.updated_at) best = { resume, version };
    }
  }
  return best;
}

export default function CareersDashboard() {
  const { loading, error, resumes, profile, refresh } = useCareers();

  const latest = useMemo(() => latestCompleteVersion(resumes), [resumes]);
  const dna = latest?.version.career_dna ?? profile?.career_dna ?? null;
  const parsed = latest?.version.parsed ?? null;

  const topSkills = useMemo(() => {
    if (!parsed) return [];
    return [...parsed.skills.technical, ...parsed.skills.tools, ...parsed.skills.frameworks].slice(0, 12);
  }, [parsed]);

  const industries = useMemo(() => {
    const set = new Set<string>();
    if (parsed?.currentIndustry) set.add(parsed.currentIndustry);
    for (const r of resumes) if (r.industry) set.add(r.industry);
    for (const i of dna?.recommendedIndustries ?? []) set.add(i);
    return [...set].slice(0, 6);
  }, [parsed, resumes, dna]);

  const activity: ActivityItem[] = useMemo(() => {
    const items = resumes.flatMap((r) =>
      r.versions.map((v) => ({
        id: v.id,
        label:
          v.status === 'failed'
            ? `Processing failed for “${r.name}” v${v.version_number}`
            : v.status === 'processing'
              ? `Processing “${r.name}” v${v.version_number}…`
              : `Analysed “${r.name}” v${v.version_number}`,
        when: v.updated_at,
        ok: v.status !== 'failed',
      }))
    );
    return items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 6);
  }, [resumes]);

  if (loading) {
    return <div style={{ minHeight: '50vh' }} aria-busy="true" />;
  }

  return (
    <div className="fx-page">
      <PageHead
        chip="FinatriX Careers"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="briefcase"
        title="Your career, decoded"
      >
        Resume intelligence, ATS readiness and your Career DNA — refreshed with every
        version you upload.
      </PageHead>

      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {!error && !latest && (
        <div className="card">
          <EmptyState
            icon="compass"
            title="Upload your first resume"
            action={
              <Link to={CAREERS_ROUTES.upload} className="btn btn-sm" style={{ textDecoration: 'none', width: 'auto', display: 'inline-block', padding: '12px 28px' }}>
                Upload resume
              </Link>
            }
          >
            In under a minute you’ll get a recruiter-grade Resume Score, an ATS
            compatibility audit and an AI Career DNA profile.
          </EmptyState>
        </div>
      )}

      {!error && latest && (
        <>
          {/* Scores + latest resume */}
          <div className="grid2" style={{ alignItems: 'stretch' }}>
            <div className="card result-card-anim" style={{ marginBottom: 12 }}>
              <div className="panel-eyebrow">Latest analysis</div>
              <div className="panel-title">{latest.resume.name}</div>
              <div className="panel-sub">
                v{latest.version.version_number} · {formatDate(latest.version.created_at)}
                {latest.resume.industry ? ` · ${latest.resume.industry}` : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-around', gap: 12, marginTop: 20 }}>
                <ScoreRing score={latest.version.resume_score} caption="Resume score" />
                <ScoreRing score={latest.version.ats_score} caption="ATS score" />
              </div>
              <Link
                to={CAREERS_ROUTES.resumes}
                className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 18 }}
              >
                View full analysis
              </Link>
            </div>

            <div className="card result-card-anim" style={{ marginBottom: 12 }}>
              <div className="panel-eyebrow">Career DNA</div>
              {dna ? (
                <>
                  <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, margin: '10px 0 16px' }}>
                    {dna.personalitySummary}
                  </p>
                  {dna.traits.slice(0, 4).map((t) => (
                    <div className="dna-trait" key={t.name}>
                      <div className="dt-row">
                        <span className="dt-name">{t.name}</span>
                        <span className="dt-val">{t.confidence}%</span>
                      </div>
                      <div className="bar">
                        <div className="bar-fill" style={{ width: `${t.confidence}%`, background: 'var(--gold)' }} />
                      </div>
                    </div>
                  ))}
                  <Link to={CAREERS_ROUTES.profile} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: 14 }}>
                    Full Career DNA
                  </Link>
                </>
              ) : (
                <EmptyState icon="layers" title="No Career DNA yet">
                  Your DNA profile appears after your first successful analysis.
                </EmptyState>
              )}
            </div>
          </div>

          {/* Key facts */}
          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <div className="metric result-card-anim">
              <div className="ml">Experience</div>
              <div className="mv">
                {parsed?.yearsOfExperience != null ? `${parsed.yearsOfExperience} yrs` : '—'}
              </div>
              <div className="md">{parsed?.currentDesignation || 'Role not detected'}</div>
            </div>
            <div className="metric result-card-anim" style={{ ['--metric-accent' as string]: 'var(--blue)' }}>
              <div className="ml">Education</div>
              <div className="mv" style={{ fontSize: 18, lineHeight: 1.3 }}>
                {parsed?.education[0]?.degree || '—'}
              </div>
              <div className="md">{parsed?.education[0]?.institution || 'Not detected'}</div>
            </div>
            <div className="metric result-card-anim" style={{ ['--metric-accent' as string]: 'var(--green)' }}>
              <div className="ml">Resumes</div>
              <div className="mv">{resumes.filter((r) => !r.is_archived).length}</div>
              <div className="md">{resumes.reduce((n, r) => n + r.versions.length, 0)} versions total</div>
            </div>
            <div className="metric result-card-anim" style={{ ['--metric-accent' as string]: 'var(--purple)' }}>
              <div className="ml">Top industries</div>
              <div className="md" style={{ marginTop: 10 }}>
                {industries.length ? industries.join(' · ') : 'Not detected yet'}
              </div>
            </div>
          </div>

          {/* Skills + activity */}
          <div className="grid2">
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="panel-eyebrow">Primary skills</div>
              <div style={{ marginTop: 14 }}>
                {topSkills.length ? (
                  topSkills.map((s) => <span className="tag gold" key={s}>{s}</span>)
                ) : (
                  <p className="note">No skills detected yet.</p>
                )}
              </div>
            </div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="panel-eyebrow">Recent activity</div>
              <div style={{ marginTop: 8 }}>
                {activity.map((a) => (
                  <div className="act-row" key={a.id}>
                    <div className="act-ic" style={a.ok ? {} : { color: 'var(--red)', background: 'rgba(255,90,82,.1)' }}>
                      <Icon name={a.ok ? 'check' : 'warn'} size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{timeAgo(a.when)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Link to={CAREERS_ROUTES.upload} className="btn" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
            Upload a new resume
          </Link>
        </>
      )}

      <ToolFoot>
        <b>FinatriX Careers</b> · your resumes never leave your private account storage
      </ToolFoot>
    </div>
  );
}
