// Dose-response curve for one pair, drawn in SVG over a log concentration axis.

import { useMemo } from "react";
import { scaleLinear, scaleLog } from "d3-scale";
import { line } from "d3-shape";
import type { PairRecord } from "../data/types";
import { formatConc, hill, pairActivation } from "../model/activation";
import { CONC_MAX, CONC_MIN } from "../state/store";

const W = 320;
const H = 150;
const M = { top: 10, right: 12, bottom: 30, left: 36 };

export function DoseResponse({ pair, conc }: { pair: PairRecord; conc: number }) {
  const x = useMemo(
    () => scaleLog().domain([CONC_MIN, CONC_MAX]).range([M.left, W - M.right]),
    [],
  );
  const y = useMemo(() => scaleLinear().domain([0, 1]).range([H - M.bottom, M.top]), []);

  const hasEc50 = pair.log_ec50 !== undefined && pair.log_ec50 !== null;

  const path = useMemo(() => {
    if (!hasEc50) return null;
    const ec50 = Math.pow(10, pair.log_ec50 as number);
    const pts: [number, number][] = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const c = CONC_MIN * Math.pow(CONC_MAX / CONC_MIN, i / steps);
      pts.push([x(c), y(hill(c, ec50))]);
    }
    return line<[number, number]>()(pts);
  }, [hasEc50, pair.log_ec50, x, y]);

  const current = pairActivation(pair, conc);
  const ticks = [1e-8, 1e-6, 1e-4, 1e-2];

  return (
    <svg className="plot" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={hasEc50 ? "Dose–response curve" : "No dose–response curve for this pair"}>
      <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />
      <line x1={M.left} x2={M.left} y1={M.top} y2={y(0)} stroke="var(--border-strong)" />

      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray="2 3" />
          <text x={M.left - 6} y={y(v) + 3} textAnchor="end" className="tick">{v}</text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - 10} textAnchor="middle" className="tick">{formatConc(t)}</text>
      ))}

      {path && <path d={path} fill="none" stroke="var(--agonist)" strokeWidth={2} />}
      {!path && (
        <text x={W / 2} y={H / 2} textAnchor="middle" className="tick">
          qualitative only — no EC50
        </text>
      )}

      <line x1={x(conc)} x2={x(conc)} y1={M.top} y2={y(0)} stroke="var(--accent)" strokeWidth={1.5} />
      {current.a > 0 && <circle cx={x(conc)} cy={y(current.a)} r={4} fill="var(--accent)" />}
    </svg>
  );
}
