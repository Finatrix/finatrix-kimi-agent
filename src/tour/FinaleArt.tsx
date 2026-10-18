import { useRef, type CSSProperties } from 'react';
import { arc, d, polar } from '../walkthrough/artKit';
import { useFitSvgText } from '../walkthrough/fit';
import { ART_H, ART_W } from '../walkthrough/geometry';

/**
 * The full tour's last frame: a ring of tool nodes closing around the gold
 * orb, which becomes a medallion with a drawn check. Decorative — the scene's
 * heading and paragraph carry the meaning.
 */
const CX = 180;
const CY = 128;
const R = 92;
const NODES = ['Budget', 'Expenses', 'Goals', 'Invest', 'Net worth', 'LifeMap', 'Reports', 'Settings'];

export function FinaleArt() {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <circle cx={CX} cy={CY} r={R} className="tour-a-track wt-fade" style={d(60)} />
      <path d={arc(CX, CY, R, 0, 359.5)} pathLength={1} className="tour-a-ring tour-a-gold-s wt-draw" style={{ ...d(200), ['--dur' as string]: '1500ms' } as CSSProperties} />
      {NODES.map((label, i) => {
        const [x, y] = polar(CX, CY, R, i * 45);
        const right = x > CX + 4;
        const left = x < CX - 4;
        const tx = right ? x + 14 : left ? x - 14 : x;
        const ty = y < CY - R + 4 ? y - 12 : y > CY + R - 4 ? y + 20 : y + 4;
        return (
          <g key={label} className="wt-pop" style={d(260 + i * 150)}>
            <circle cx={x} cy={y} r={7} className="wt-ok" />
            <path d={`M${x - 3.2} ${y + 0.2}l2.2 2.2 4.2-4.4`} className="wt-ok-check" />
            <text data-fit={64} x={tx} y={ty} textAnchor={right ? 'start' : left ? 'end' : 'middle'} className="wt-t-sub">{label}</text>
          </g>
        );
      })}
      {[0, 1].map((i) => (
        <circle key={i} cx={CX} cy={CY} r={36} className="wt-ring" style={d(1700 + i * 700)} />
      ))}
      <path d={`M${CX - 13} ${CY + 1}l9 9 18-20`} pathLength={1} className="wt-glyph wt-glyph-lg wt-draw" style={{ ...d(1500), ['--dur' as string]: '600ms' } as CSSProperties} />
    </svg>
  );
}
