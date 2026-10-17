import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { easeInOutCubic, easeOutExpo, type SceneClock } from './motion';
import { ART_H, ART_W, DONUT, GOAL, SHIELD, type ArtProps } from './geometry';
import { useFitSvgText } from './fit';

/**
 * The four illustrations. Decorative and `aria-hidden`: each scene's heading
 * and paragraph (scenes.ts) carry the meaning as real text; these carry the
 * feeling.
 *
 * Every illustration shares one 360×270 coordinate space — the same box the
 * persistent gold orb travels across — so a point named here (the donut's
 * centre, the category icon, the goal's target) is exactly where the orb lands.
 * That shared space is what lets one shape read as the same object moving from
 * scene to scene.
 *
 * Choreography lives in walkthrough.css as keyframes keyed off `--d` (delay,
 * ms). Only numbers and typing are driven from here, on the scene's clock.
 */

const d = (ms: number): CSSProperties => ({ ['--d' as string]: ms } as CSSProperties);

/* ── Helpers ────────────────────────────────────────────────────────── */

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * A rounded rectangle with a circular socket cut through it (even-odd fill).
 * Surfaces the orb has to show through — the scene layer paints above it —
 * get one of these, so the orb reads as sitting IN the field or card.
 */
function socketed(x: number, y: number, w: number, h: number, r: number, cx: number, cy: number, cr: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    + `M${cx - cr} ${cy}a${cr} ${cr} 0 1 0 ${cr * 2} 0a${cr} ${cr} 0 1 0 ${-cr * 2} 0Z`;
}

/** Count a text node up from zero on the scene clock. */
function useCountUp(clock: SceneClock, at: number, dur: number, to: number, fmt: (n: number) => string) {
  const ref = useRef<SVGTextElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!clock.instant) el.textContent = fmt(0);
    clock.tween(at, dur, (p) => { el.textContent = fmt(to * p); }, easeOutExpo);
  }, [clock, at, dur, to, fmt]);
  return ref;
}

/* ── Scene 1 · the month ─────────────────────────────────────────────── */


export function MonthArt({ clock, ex, fmt }: ArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const income = useCountUp(clock, 350, 1500, ex.income, fmt);
  const { cx, cy, r } = DONUT;
  const bands = [
    { key: 'needs', label: 'Needs', pct: '50%', amount: ex.needs, a: [2, 178], color: 'var(--blue-fill)', delay: 300, dur: 700 },
    { key: 'wants', label: 'Wants', pct: '30%', amount: ex.wants, a: [182, 286], color: 'var(--wants-fill)', delay: 950, dur: 480 },
    { key: 'save', label: 'Savings', pct: '20%', amount: ex.save, a: [290, 358], color: 'var(--green-fill)', delay: 1380, dur: 380 },
  ] as const;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <circle cx={cx} cy={cy} r={r} className="wt-track wt-fade" style={d(100)} />
      {bands.map((b) => (
        <path
          key={b.key}
          d={arc(cx, cy, r, b.a[0], b.a[1])}
          pathLength={1}
          className="wt-arc"
          stroke={b.color}
          style={{ ...d(b.delay), ['--dur' as string]: `${b.dur}ms` } as CSSProperties}
        />
      ))}
      {/* Centre figure sits on the gold orb (the orb is the medallion). */}
      <text ref={income} data-fit={92} data-sample={fmt(ex.income)} x={cx} y={cy + 4} className="wt-medal-num wt-pop" style={d(300)} textAnchor="middle">{fmt(ex.income)}</text>
      <text x={cx} y={cy + 22} className="wt-medal-label wt-fade" style={d(700)} textAnchor="middle">take-home</text>

      {bands.map((b, i) => {
        const y = 78 + i * 52;
        return (
          <g key={b.key} className="wt-slide-in" style={d(b.delay + b.dur - 200)}>
            <rect x={214} y={y - 20} width={134} height={42} rx={13} className="wt-pill" />
            <circle cx={232} cy={y} r={6} fill={b.color} />
            <text data-fit={56} x={246} y={y - 3} className="wt-t-label">{b.label}</text>
            <text data-fit={58} x={246} y={y + 12} className="wt-t-sub">{fmt(b.amount)}</text>
            <text x={336} y={y + 4} className="wt-t-pct" textAnchor="end">{b.pct}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Scene 2 · log a spend ───────────────────────────────────────────── */

export function LogArt({ clock, ex, fmt, haptic }: ArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const textRef = useRef<SVGTextElement>(null);
  const spans = useRef<Array<SVGTSpanElement | null>>([]);
  const caretRef = useRef<SVGRectElement>(null);
  const parts = useMemo(() => ex.typed.split(' ').map((t, i) => (i === 0 ? t : ` ${t}`)), [ex.typed]);

  useEffect(() => {
    const text = textRef.current;
    const caret = caretRef.current;
    const nodes = spans.current;
    if (!text || !caret) return;
    const placeCaret = () => {
      let w = 0;
      try { w = text.getComputedTextLength(); } catch { w = 0; }
      caret.setAttribute('x', String(70 + w + 2));
    };
    const full = parts.join('');
    const render = (count: number) => {
      let left = count;
      parts.forEach((p, i) => {
        const node = nodes[i];
        if (!node) return;
        const take = Math.max(0, Math.min(p.length, left));
        node.textContent = p.slice(0, take);
        left -= take;
      });
      placeCaret();
    };
    if (!clock.instant) render(0);
    // A human rhythm: quick, slightly uneven keystrokes, a beat before parsing.
    let t = 450;
    for (let i = 1; i <= full.length; i++) {
      const at = t;
      clock.at(at, () => render(i));
      t += 70 + ((i * 37) % 5) * 12;
    }
    clock.at(t + 200, () => text.classList.add('is-parsed'));
    clock.at(t + 900, () => haptic('success'));
    if (clock.instant) { render(full.length); text.classList.add('is-parsed'); }
  }, [clock, haptic, parts]);

  // Glyph centre for the category icon — the orb becomes its disc.
  const icon = { x: 50, y: 151 };
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <g className="wt-rise" style={d(80)}>
        <path d={socketed(20, 38, 320, 50, 25, 46, 63, 15)} fillRule="evenodd" className="wt-field" />
        <path d="M46 56v14M39 63h14" className="wt-plus wt-fade-out" style={d(2100)} />
        <text ref={textRef} x={70} y={69} className="wt-typed">
          {parts.map((p, i) => (
            <tspan key={i} ref={(el) => { spans.current[i] = el; }} className={`wt-tok wt-tok-${i}`}>{p}</tspan>
          ))}
        </text>
        <rect ref={caretRef} x={72} y={52} width={2} height={22} rx={1} className="wt-caret" />
      </g>
      <text data-fit={312} x={24} y={108} className="wt-t-sub wt-fade" style={d(400)}>Amount · what it was · how you paid</text>

      <g className="wt-card-in" style={d(2050)}>
        <path d={socketed(20, 122, 320, 58, 16, icon.x, icon.y, 18.5)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
        <path d={`M${icon.x - 5} ${icon.y - 8}v6a3 3 0 0 0 6 0v-6M${icon.x - 2} ${icon.y - 2}v10M${icon.x + 6} ${icon.y - 8}c-2.6 2.2-2.6 6.4 0 8.4v7.6`} className="wt-glyph" />
        <text data-fit={150} x={80} y={147} className="wt-t-label">Eating Out</text>
        <text data-fit={200} x={80} y={165} className="wt-t-sub">Wants · {ex.method} · Today</text>
        <text data-fit={90} x={322} y={157} className="wt-t-amt" textAnchor="end">{fmt(ex.spend)}</text>
      </g>
      <g className="wt-pop" style={d(2550)}>
        <circle cx={334} cy={124} r={10} className="wt-ok" />
        <path d="M329 124.5l3.4 3.4 6-6.4" className="wt-ok-check wt-draw" pathLength={1} style={d(2650)} />
      </g>

      {ex.earlier.map((row, i) => (
        <g key={row.label} className="wt-push" style={d(2050 + i * 60)}>
          <rect x={20} y={190 + i * 36} width={320} height={30} rx={11} className="wt-row" />
          <text data-fit={170} x={38} y={209 + i * 36} className="wt-t-row">{row.label}</text>
          <text data-fit={90} x={322} y={209 + i * 36} className="wt-t-row" textAnchor="end">{fmt(row.amount)}</text>
        </g>
      ))}
    </svg>
  );
}

/* ── Scene 3 · work back from a goal ─────────────────────────────────── */


const CURVE = `M${GOAL.x0} ${GOAL.base - 2} C ${GOAL.x0 + 110} ${GOAL.base - 6}, ${GOAL.x0 + 205} ${GOAL.base - 52}, ${GOAL.x1} ${GOAL.top}`;
const CURVE_AT = 1150;
const CURVE_DUR = 1100;

export function GoalArt({ clock, orb, ex, fmt }: ArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const monthly = useCountUp(clock, 2350, 1100, ex.monthly, fmt);
  const curveRef = useRef<SVGPathElement>(null);
  const { x0, x1, base, top } = GOAL;
  const curve = CURVE;

  // The orb rides the tip of the line as it draws: same start, same duration,
  // same easing as the CSS stroke animation, sampled at the same arc length.
  useEffect(() => {
    const path = curveRef.current;
    let len = 0;
    try { len = path?.getTotalLength() ?? 0; } catch { len = 0; }
    if (!path || !len) {
      clock.at(CURVE_AT, () => orb.move({ at: 0, x: x1, y: top, s: 0.42 }));
      return;
    }
    clock.tween(CURVE_AT, CURVE_DUR, (p) => {
      const pt = path.getPointAtLength(p * len);
      orb.ride(pt.x, pt.y, 0.34 + 0.08 * p);
    }, easeInOutCubic);
    clock.at(CURVE_AT + CURVE_DUR + 20, () => orb.move({ at: 0, x: x1, y: top, s: 0.5 }));
  }, [clock, orb, x1, top]);
  const bars = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="wt-goal-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[112, 160, 208].map((y, i) => (
        <line key={y} x1={x0} x2={x1 + 16} y1={y} y2={y} className="wt-grid wt-fade" style={d(60 + i * 60)} />
      ))}
      <line x1={x0} x2={x1 + 16} y1={base} y2={base} className="wt-axis wt-grow-x" style={d(80)} />

      {/* Anticipation: the target and the deadline arrive before the answer. */}
      <line x1={x0} x2={x1} y1={top} y2={top} className="wt-target wt-grow-x" style={d(250)} />
      <text data-fit={x1 - x0 - 24} x={x0} y={top - 12} className="wt-t-gold wt-fade" style={d(400)}>{ex.goalName} · {fmt(ex.goalTarget)}</text>
      <line x1={x1} x2={x1} y1={base} y2={top} className="wt-target wt-grow-y" style={d(700)} />
      <text data-fit={90} x={x0} y={base + 20} className="wt-t-sub wt-fade" style={d(700)}>Today</text>
      <text data-fit={110} x={x1} y={base + 20} className="wt-t-sub wt-fade" style={d(900)} textAnchor="end">In {ex.goalYears} years</text>

      {bars.map((i) => (
        <rect key={i} x={x0 + 10 + i * 23} y={base - 16} width={11} height={16} rx={3} className="wt-bar" style={d(1100 + i * 45)} />
      ))}

      <path d={`${curve} L ${x1} ${base} L ${x0} ${base} Z`} fill="url(#wt-goal-fill)" className="wt-fade" style={d(2000)} />
      <path ref={curveRef} d={curve} pathLength={1} className="wt-curve wt-draw" style={{ ...d(CURVE_AT), ['--dur' as string]: `${CURVE_DUR}ms` } as CSSProperties} />
      <circle cx={x1} cy={top} r={12} className="wt-ripple" style={d(2250)} />

      <g className="wt-card-in" style={d(2150)}>
        <rect x={40} y={88} width={176} height={62} rx={14} className="wt-pill" />
        <text data-fit={144} x={56} y={110} className="wt-t-sub">Set aside monthly, about</text>
        <text ref={monthly} data-fit={144} data-sample={fmt(ex.monthly)} x={56} y={136} className="wt-t-big">{fmt(ex.monthly)}</text>
      </g>
    </svg>
  );
}

/* ── Scene 4 · privacy ───────────────────────────────────────────────── */


export function PrivacyArt() {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const { x, y } = SHIELD;
  const pills = [
    { label: 'No account', px: 8, py: 56, side: -1 },
    { label: 'No ads', px: 8, py: 176, side: -1 },
    { label: 'On your device', px: 234, py: 56, side: 1 },
    { label: 'AI asks first', px: 234, py: 176, side: 1 },
  ];
  const phone = 'M152 22h56a20 20 0 0 1 20 20v176a20 20 0 0 1-20 20h-56a20 20 0 0 1-20-20V42a20 20 0 0 1 20-20z';
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <path d={phone} pathLength={1} className="wt-phone wt-draw" style={{ ...d(100), ['--dur' as string]: '1100ms' } as CSSProperties} />
      <line x1={170} x2={190} y1={34} y2={34} className="wt-phone wt-fade" style={d(700)} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x} cy={y} r={44} className="wt-ring" style={d(900 + i * 700)} />
      ))}
      <g className="wt-pop-big" style={d(450)}>
        <path d={`M${x} ${y - 21}l17 7v13c0 11-7.5 18.5-17 22-9.5-3.5-17-11-17-22v-13z`} className="wt-glyph wt-glyph-lg" />
      </g>
      <path d={`M${x - 7} ${y + 1}l5 5 10-11`} pathLength={1} className="wt-glyph wt-glyph-lg wt-draw" style={d(950)} />

      {pills.map((p, i) => (
        <g key={p.label} className="wt-pill-in" style={{ ...d(1150 + i * 140), ['--from-x' as string]: `${p.side * -18}px` } as CSSProperties}>
          <g className="wt-float" style={{ ['--phase' as string]: `${i * -1.3}s` } as CSSProperties}>
            <rect x={p.px} y={p.py} width={118} height={34} rx={17} className="wt-pill" />
            <circle cx={p.px + 17} cy={p.py + 17} r={7} className="wt-ok" />
            <path d={`M${p.px + 13.5} ${p.py + 17.3}l2.4 2.4 4.4-4.6`} className="wt-ok-check" />
            <text data-fit={78} x={p.px + 30} y={p.py + 21} className="wt-t-chip">{p.label}</text>
          </g>
        </g>
      ))}
    </svg>
  );
}

