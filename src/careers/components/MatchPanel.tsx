/**
 * MatchPanel — renders a MatchReport: overall ring, per-category traffic
 * bars, prioritized gap lists and AI recommendations with reasons. Shared by
 * the Jobs page, saved-job details and application details.
 */

import { useState } from 'react';
import { ScoreRing } from './ScoreRing';
import { MATCH_CATEGORIES, matchBand, type MatchReport, type PrioritizedItem } from '../types/jobs';

const BAND_COLOR = { green: 'var(--green)', yellow: 'var(--gold)', red: 'var(--red)' } as const;

function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const cls = priority === 'high' ? 'badge-red' : priority === 'medium' ? 'badge-gold' : 'badge-mute';
  return <span className={`badge ${cls}`}>{priority}</span>;
}

function GapList({ title, items }: { title: string; items: PrioritizedItem[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="panel-eyebrow" style={{ marginBottom: 6 }}>{title}</div>
      {items.map((item, i) => (
        <div key={i} className="row-line" style={{ fontSize: 13, padding: '7px 0' }}>
          <span style={{ flex: 1 }}>{item.text}</span>
          <PriorityBadge priority={item.priority} />
        </div>
      ))}
    </div>
  );
}

export function MatchPanel({ report }: { report: MatchReport }) {
  const [showAll, setShowAll] = useState(false);
  const band = matchBand(report.overall);
  const ins = report.insights;
  return (
    <div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <ScoreRing score={report.overall} caption="Overall match" />
        <div style={{ flex: 1, minWidth: 220 }}>
          {MATCH_CATEGORIES.map(({ id, label }) => {
            const score = report.scores[id];
            const b = matchBand(score);
            return (
              <div className="cat-row" key={id}>
                <span className="cat-label">
                  <span className={`tl-dot tl-${b}`} aria-hidden="true" />
                  {label}
                </span>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${score}%`, background: BAND_COLOR[b] }} />
                </div>
                <span className="cat-val">{score}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid2">
        <GapList title="Top strengths" items={ins.strengths} />
        <GapList title="Top weaknesses" items={ins.weaknesses} />
      </div>
      <GapList title="Missing skills" items={ins.missingSkills} />
      <GapList title="Missing keywords" items={ins.missingKeywords} />
      {showAll && (
        <>
          <GapList title="Missing certifications" items={ins.missingCertifications} />
          <GapList title="Missing projects" items={ins.missingProjects} />
          <GapList title="Missing leadership evidence" items={ins.missingLeadership} />
          <GapList title="Missing quantified results" items={ins.missingQuantifiedResults} />
          <GapList title="Missing ATS sections" items={ins.missingAtsSections} />
        </>
      )}
      {!showAll &&
        (ins.missingCertifications.length || ins.missingProjects.length || ins.missingLeadership.length ||
          ins.missingQuantifiedResults.length || ins.missingAtsSections.length) > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)} style={{ marginBottom: 14 }}>
            Show all gap categories
          </button>
        )}

      {ins.recommendations.length > 0 && (
        <>
          <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Recommendations</div>
          {ins.recommendations.map((rec, i) => (
            <div key={i} className="tip tip-info" style={{ marginBottom: 8 }}>
              <b>
                <span className="badge badge-gold" style={{ marginRight: 8 }}>{rec.action}</span>
                {rec.target}
                <span style={{ float: 'right' }}><PriorityBadge priority={rec.priority} /></span>
              </b>
              {rec.detail}
              {rec.reason && <div style={{ marginTop: 4, color: 'var(--ink)' }}>Why: {rec.reason}</div>}
            </div>
          ))}
        </>
      )}
      {ins.bestResumeVersion && (
        <p className="note">Suggested resume version: <b style={{ color: 'var(--gold)' }}>{ins.bestResumeVersion}</b></p>
      )}
      <p className="note" aria-hidden="true">
        <span className="tl-dot tl-green" /> 70+ strong ·{' '}
        <span className="tl-dot tl-yellow" /> 40–69 workable ·{' '}
        <span className="tl-dot tl-red" /> below 40 weak — overall band: {band}
      </p>
    </div>
  );
}
