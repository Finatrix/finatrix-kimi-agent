/**
 * JobIntelView — renders a validated JobAnalysis + keyword report: candid
 * intelligence, structured extraction, categorised skills and weighted ATS
 * keywords (with hit/miss highlighting against the selected resume text).
 */

import type { JobAnalysis, JobKeywordReport } from '../types/jobs';

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="row-line" style={{ fontSize: 13, padding: '7px 0' }}>
      <span style={{ flex: '0 0 170px', color: 'var(--ink2)' }}>{label}</span>
      <span style={{ flex: 1 }}>{value}</span>
    </div>
  );
}

export function JobIntelView({
  analysis,
  keywords,
  resumeText,
}: {
  analysis: JobAnalysis;
  keywords: JobKeywordReport | null;
  /** When provided, keywords render as hit (in resume) / miss (missing). */
  resumeText?: string;
}) {
  const e = analysis.extraction;
  const intel = analysis.intelligence;
  const byCategory = new Map<string, string[]>();
  for (const s of analysis.skills) {
    byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s.name]);
  }
  const haystack = (resumeText ?? '').toLowerCase();

  return (
    <div>
      {intel.summary && (
        <div className="tip tip-info" style={{ marginBottom: 14 }}>
          <b>What this job is really like</b>
          {intel.summary}
        </div>
      )}

      <div className="grid2" style={{ marginBottom: 6 }}>
        <div>
          <div className="panel-eyebrow" style={{ marginBottom: 4 }}>Role facts</div>
          <Fact label="Company" value={e.company} />
          <Fact label="Industry" value={e.industry} />
          <Fact label="Department" value={e.department} />
          <Fact label="Employment type" value={e.employmentType} />
          <Fact label="Experience required" value={e.experienceRequired} />
          <Fact label="Education" value={e.education} />
          <Fact label="Location" value={e.location} />
          <Fact label="Work mode" value={e.workMode} />
          <Fact label="Salary" value={e.salaryInfo} />
          <Fact label="Visa sponsorship" value={e.visaSponsorship} />
          <Fact label="Travel" value={e.travel} />
          <Fact label="Reports to" value={e.reportingTo} />
        </div>
        <div>
          <div className="panel-eyebrow" style={{ marginBottom: 4 }}>Intelligence</div>
          <Fact label="Difficulty" value={intel.difficulty ? `${intel.difficulty}/100` : ''} />
          <Fact label="Suits graduates" value={intel.suitsGraduates ? 'Yes' : 'No'} />
          <Fact label="Suits experienced" value={intel.suitsExperienced ? 'Yes' : 'No'} />
          <Fact label="Workload" value={intel.workload} />
          <Fact label="Work-life balance" value={intel.workLifeBalance} />
          <Fact label="Learning" value={intel.learningOpportunities} />
          <Fact label="Promotion outlook" value={intel.promotionOpportunities} />
          <Fact label="Stability" value={intel.careerStability} />
          <Fact label="Interview difficulty" value={intel.interviewDifficulty} />
          <Fact label="Competition" value={intel.competition} />
          <Fact label="ATS competitiveness" value={intel.atsCompetitiveness} />
        </div>
      </div>

      {e.responsibilities.length > 0 && (
        <>
          <div className="panel-eyebrow" style={{ margin: '12px 0 6px' }}>Responsibilities</div>
          <ul style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.7, paddingLeft: 18 }}>
            {e.responsibilities.slice(0, 10).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </>
      )}

      {byCategory.size > 0 && (
        <>
          <div className="panel-eyebrow" style={{ margin: '14px 0 8px' }}>Skills by category</div>
          {[...byCategory.entries()].map(([category, names]) => (
            <div key={category} style={{ marginBottom: 8 }}>
              <span className="badge badge-mute" style={{ marginRight: 8 }}>{category}</span>
              {names.map((n) => <span className="tag" key={n}>{n}</span>)}
            </div>
          ))}
        </>
      )}

      {keywords && keywords.keywords.length > 0 && (
        <>
          <div className="panel-eyebrow" style={{ margin: '14px 0 8px' }}>
            ATS keywords {resumeText ? '(green = in your resume)' : '(by importance)'}
          </div>
          <div>
            {keywords.keywords.map((k) => {
              const cls = resumeText
                ? haystack.includes(k.keyword.toLowerCase()) ? 'kw hit' : 'kw miss'
                : 'kw';
              return (
                <span
                  className={cls}
                  key={`${k.tier}:${k.keyword}`}
                  title={`${k.tier} · importance ${k.weight}/100 · seen ${k.frequency}×`}
                >
                  {k.keyword} <span style={{ opacity: 0.6 }}>·{k.weight}</span>
                </span>
              );
            })}
          </div>
        </>
      )}

      {e.benefits.length > 0 && (
        <>
          <div className="panel-eyebrow" style={{ margin: '14px 0 8px' }}>Benefits</div>
          <div>{e.benefits.map((b) => <span className="tag green" key={b}>{b}</span>)}</div>
        </>
      )}
    </div>
  );
}
