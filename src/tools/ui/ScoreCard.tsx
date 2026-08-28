import { useId, useState } from 'react';
import { Icon } from './Icon';
import { AskAiButton } from './AskAiButton';
import { GRADE_COLOR, type ScoreResult } from '../lib/score';
import type { AiFocus } from '../ai/focus';

/**
 * A score, and — always — the working behind it.
 *
 * A bare number out of 100 attached to somebody's finances is worse than no
 * number: it invites them to optimise something they cannot see the shape of,
 * and it is indistinguishable from a horoscope. So the card leads with the
 * grade, states the one sentence that explains it, and puts every weighted
 * component one click away with its own figure, its own weight and its own
 * plain-language reason.
 *
 * The components a score could NOT measure are listed too. "Savings rate — no
 * income is recorded for this month" is the most useful line on the card for a
 * user whose score looks low for a reason that is not about their money.
 *
 * The dial is decorative. The figure, the grade and the whole breakdown are all
 * real text, so nothing here depends on seeing a ring of colour.
 */
export interface ScoreCardProps {
  title: string;
  /** One line saying what this score is of, under the title. */
  caption: string;
  result: ScoreResult;
  /** What the assistant should be pointed at when asked about this score. */
  focus?: AiFocus;
  /**
   * Drop the card chrome, the title and the grade pill.
   *
   * For a caller that is already a `PanelCard` — it supplies the card, the
   * heading and the switch, and shows the grade as its badge, so repeating any
   * of them here would put the same words on screen twice.
   */
  bare?: boolean;
}

/** The grade pill, so a `PanelCard` can show it as its badge. */
export function ScoreBadge({ result }: { result: ScoreResult }) {
  const color = GRADE_COLOR[result.grade];
  return (
    <span
      className="fx-score-grade"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      <style>{SCORE_STYLES}</style>
      {result.gradeLabel}
    </span>
  );
}

export function ScoreCard({ title, caption, result, focus, bare = false }: ScoreCardProps) {
  const [open, setOpen] = useState(false);
  const detailId = `${useId()}-score-detail`;
  const color = GRADE_COLOR[result.grade];

  return (
    <div className={bare ? 'fx-score' : 'card fx-score'}>
      <style>{SCORE_STYLES}</style>
      <div className="fx-score-top">
        <Dial score={result.score} color={color} insufficient={result.insufficient} />
        <div className="fx-score-copy">
          {!bare && (
            <>
              <div className="fx-score-hd">
                <span className="fx-score-title">{title}</span>
                <ScoreBadge result={result} />
              </div>
              <p className="fx-score-caption">{caption}</p>
            </>
          )}
          <p className="fx-score-headline" style={bare ? { marginTop: 0 } : undefined}>{result.headline}</p>
          {result.nextStep && (
            <p className="fx-score-next">
              <Icon name="zap" size={13} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
              <span>{result.nextStep}</span>
            </p>
          )}
        </div>
      </div>

      {(result.components.length > 0 || result.unmeasured.length > 0) && (
        <div className="fx-score-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide the working' : 'Show the working'}
          </button>
          {focus && <AskAiButton focus={focus} size="sm" />}
        </div>
      )}

      {open && (
        <div id={detailId} className="fx-score-detail">
          {result.components.length > 0 && (
            <table className="fx-score-table">
              <caption className="fx-sr-only">
                How each component scored, and how much of the total it carried
              </caption>
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Score</th>
                  <th scope="col">Weight</th>
                </tr>
              </thead>
              <tbody>
                {result.components.map((c) => (
                  <tr key={c.key}>
                    <th scope="row">
                      <span className="fx-score-cl">{c.label}</span>
                      <span className="fx-score-cd">{c.detail}</span>
                    </th>
                    <td>
                      <span className="fx-score-cv">{Math.round(c.score)}</span>
                      <span
                        className="fx-score-bar"
                        aria-hidden="true"
                        style={{ '--fill': `${Math.round(c.score)}%`, '--tone': GRADE_COLOR[gradeOf(c.score)] } as React.CSSProperties}
                      />
                    </td>
                    <td className="fx-score-cw">{Math.round(c.weight * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.unmeasured.length > 0 && (
            <div className="fx-score-gaps">
              <div className="fx-score-gapt">Not counted, and why</div>
              <ul>
                {result.unmeasured.map((u) => (
                  <li key={u.label}><b>{u.label}</b> — {u.reason}</li>
                ))}
              </ul>
              <p className="fx-score-gapn">
                An unmeasurable component is left out and the rest re-weighted — never scored as zero.
                Nothing here is counted against you for being missing.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Band a component's own score falls in, so its bar is coloured like the dial. */
function gradeOf(score: number): ScoreResult['grade'] {
  if (score >= 92) return 'exceptional';
  if (score >= 82) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 55) return 'fair';
  if (score >= 35) return 'building';
  return 'attention';
}

/**
 * The ring. `aria-hidden` throughout: the figure inside it is repeated as real
 * text in the heading beside it, and an SVG that restates a number already on
 * screen is noise in a screen reader.
 */
function Dial({ score, color, insufficient }: { score: number; color: string; insufficient: boolean }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const filled = insufficient ? 0 : (Math.max(0, Math.min(100, score)) / 100) * C;
  return (
    <div className="fx-score-dial" aria-hidden="true">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={R} fill="none" stroke="var(--hair2)" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${filled} ${C - filled}`}
          transform="rotate(-90 44 44)"
        />
      </svg>
      <span className="fx-score-num" style={{ color: insufficient ? 'var(--ink3)' : color }}>
        {insufficient ? '—' : score}
      </span>
    </div>
  );
}

const SCORE_STYLES = `
.fx-tools .fx-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
.fx-tools .fx-score-top{display:flex;align-items:flex-start;gap:16px;}
.fx-tools .fx-score-dial{position:relative;flex-shrink:0;width:88px;height:88px;display:grid;place-items:center;}
.fx-tools .fx-score-dial svg{position:absolute;inset:0;}
.fx-tools .fx-score-num{font-size:26px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;}
.fx-tools .fx-score-copy{min-width:0;flex:1;}
.fx-tools .fx-score-hd{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.fx-tools .fx-score-title{font-size:14px;font-weight:700;letter-spacing:-.01em;color:var(--ink);}
.fx-tools .fx-score-grade{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  padding:3px 9px;border-radius:var(--ctl-pill);border:1px solid;}
.fx-tools .fx-score-caption{font-size:11.5px;color:var(--ink3);margin:3px 0 0;}
.fx-tools .fx-score-headline{font-size:13px;color:var(--ink2);line-height:1.55;margin:8px 0 0;}
.fx-tools .fx-score-next{display:flex;gap:7px;font-size:12.5px;color:var(--ink2);line-height:1.5;
  margin:10px 0 0;padding:9px 11px;border-radius:var(--ctl-r-md);background:var(--gold-bg);}
.fx-tools .fx-score-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;}
.fx-tools .fx-score-detail{margin-top:14px;padding-top:14px;border-top:1px solid var(--hair2);}
.fx-tools .fx-score-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.fx-tools .fx-score-table thead th{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--ink3);text-align:right;padding:0 8px 7px;}
.fx-tools .fx-score-table thead th:first-child{text-align:left;}
.fx-tools .fx-score-table tbody th{text-align:left;font-weight:500;padding:9px 8px;vertical-align:top;
  border-top:1px solid var(--hair2);}
.fx-tools .fx-score-table td{text-align:right;padding:9px 8px;vertical-align:top;border-top:1px solid var(--hair2);
  font-variant-numeric:tabular-nums;}
.fx-tools .fx-score-cl{display:block;font-weight:700;color:var(--ink);}
.fx-tools .fx-score-cd{display:block;font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:2px;max-width:44ch;}
.fx-tools .fx-score-cv{display:block;font-size:14px;font-weight:700;color:var(--ink);}
.fx-tools .fx-score-bar{display:block;width:56px;height:4px;border-radius:2px;background:var(--hair2);
  margin-top:5px;margin-left:auto;position:relative;overflow:hidden;}
.fx-tools .fx-score-bar::after{content:"";position:absolute;inset:0 auto 0 0;width:var(--fill);background:var(--tone);border-radius:2px;}
.fx-tools .fx-score-cw{color:var(--ink3);}
.fx-tools .fx-score-gaps{margin-top:14px;padding:11px 13px;border-radius:var(--ctl-r-md);background:var(--well);
  border:1px solid var(--well-border);}
.fx-tools .fx-score-gapt{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);}
.fx-tools .fx-score-gaps ul{margin:8px 0 0;padding-left:18px;}
.fx-tools .fx-score-gaps li{font-size:12px;color:var(--ink2);line-height:1.6;}
.fx-tools .fx-score-gapn{font-size:11.5px;color:var(--ink3);line-height:1.55;margin:8px 0 0;}
@media(max-width:520px){
  .fx-tools .fx-score-top{gap:12px;}
  .fx-tools .fx-score-dial{width:70px;height:70px;}
  .fx-tools .fx-score-dial svg{width:70px;height:70px;}
  .fx-tools .fx-score-num{font-size:21px;}
  .fx-tools .fx-score-cd{max-width:none;}
}
`;

export default ScoreCard;
