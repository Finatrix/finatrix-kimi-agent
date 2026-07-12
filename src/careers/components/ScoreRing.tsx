/** Animated circular score indicator (0–100), colored by score band. */

import { scoreColor } from '../utils/format';

export function ScoreRing({
  score,
  caption,
  size = 110,
}: {
  score: number | null;
  caption: string;
  size?: number;
}) {
  const stroke = Math.max(6, Math.round(size / 14));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  const offset = c - (c * value) / 100;
  const color = scoreColor(score);
  return (
    <div
      className={size < 80 ? 'score-ring sm' : 'score-ring'}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${caption}: ${score == null ? 'not available' : `${score} out of 100`}`}
    >
      <svg width={size} height={size}>
        <circle className="sr-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="sr-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={score == null ? c : offset}
        />
      </svg>
      <div className="sr-val">
        <span className="sr-num" style={{ color }}>{score == null ? '—' : score}</span>
        <span className="sr-cap">{caption}</span>
      </div>
    </div>
  );
}
