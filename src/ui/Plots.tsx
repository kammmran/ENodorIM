import { line } from "d3-shape";
import { useMemo, useState } from "react";
import { formatConc, hill } from "../model/activation";
import { usePalette } from "./colors";

// Small, quiet charts: hairline axes, 2px lines, a cursor for the timeline,
// values readable next to the title (tooltips only add detail).

export interface Series {
  label: string;
  values: number[];
  color: string;
}

const W = 380;

export function LinePlot({
  t,
  series,
  cursor,
  tMax,
  stim,
  title,
  format = (v: number) => v.toFixed(2),
  height = 58,
  yMax,
}: {
  t: number[];
  series: Series[];
  cursor: number;
  tMax: number;
  stim: [number, number];
  title: string;
  format?: (v: number) => string;
  height?: number;
  yMax?: number;
}) {
  const pal = usePalette();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const m = { l: 2, r: series.length > 1 ? 34 : 4, t: 4, b: 14 };
  const iw = W - m.l - m.r, ih = height - m.t - m.b;
  const ymax = yMax ?? Math.max(1e-9, ...series.flatMap((s) => s.values)) * 1.08;
  const x = (v: number) => m.l + (v / tMax) * iw;
  const y = (v: number) => m.t + ih - (v / ymax) * ih;
  const step = t.length > 1 ? t[1] - t[0] : 1;
  const idx = (tt: number) => Math.max(0, Math.min(t.length - 1, Math.round(tt / step)));
  const ci = idx(cursor);
  const paths = useMemo(
    () =>
      series.map((s) =>
        line<number>()
          .x((_, i) => x(t[i]))
          .y((v) => y(v))(s.values.slice(0, ci + 1)) ?? "",
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, ci, ymax, tMax],
  );
  const readIdx = hoverT !== null ? idx(hoverT) : ci;
  return (
    <div>
      <div className="plot-title">
        <span>{title}</span>
        <span className="num">
          {series.map((s, k) => (
            <span key={s.label} style={{ marginLeft: k ? 10 : 0 }}>
              {series.length > 1 && (
                <svg width={12} height={8} aria-hidden style={{ marginRight: 3 }}>
                  <path d="M0 4h12" stroke={s.color} strokeWidth={2} />
                </svg>
              )}
              {series.length > 1 && `${s.label} `}
              <strong>{format(s.values[readIdx] ?? 0)}</strong>
            </span>
          ))}
          {hoverT !== null && <span className="muted"> @ {Math.round(t[readIdx])} ms</span>}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        role="img"
        aria-label={`${title}: ${series.map((s) => `${s.label} ${format(s.values[ci] ?? 0)}`).join(", ")} at ${Math.round(cursor)} ms`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHoverT(Math.max(0, Math.min(tMax, ((px - m.l) / iw) * tMax)));
        }}
        onPointerLeave={() => setHoverT(null)}
      >
        <rect x={x(stim[0])} y={m.t} width={x(stim[1]) - x(stim[0])} height={ih} fill={pal.surface2} />
        <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke={pal.axis} strokeWidth={1} />
        {[0, 500, 1000, 1500].filter((v) => v <= tMax).map((v) => (
          <text key={v} x={x(v)} y={height - 2} fontSize={9} fill={pal.ink2} textAnchor={v === 0 ? "start" : "middle"}>
            {v === 0 ? "0 ms" : v}
          </text>
        ))}
        {paths.map((d, k) => (
          <path key={k} d={d} fill="none" stroke={series[k].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.length > 1 &&
          series.map((s, k) => (
            <text key={s.label} x={W - m.r + 4} y={y(s.values[ci] ?? 0) + 3 + (k ? 0 : 0)} fontSize={9} fill={pal.ink2}>
              {s.label}
            </text>
          ))}
        <line x1={x(cursor)} x2={x(cursor)} y1={m.t} y2={m.t + ih} stroke={pal.ink2} strokeWidth={1} />
        {hoverT !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1={m.t} y2={m.t + ih} stroke={pal.axis} strokeWidth={1} />}
      </svg>
    </div>
  );
}

export function SpikeRaster({
  rows,
  cursor,
  tMax,
  stim,
  width = W,
}: {
  rows: { label: string; spikes: number[] }[];
  cursor: number;
  tMax: number;
  stim: [number, number];
  width?: number;
}) {
  const pal = usePalette();
  const lw = 58, rh = 13, h = rows.length * rh + 16;
  const x = (v: number) => lw + (v / tMax) * (width - lw - 4);
  return (
    <svg viewBox={`0 0 ${width} ${h}`} width="100%" role="img" aria-label={`Spike raster for ${rows.length} receptor types`}>
      <rect x={x(stim[0])} y={0} width={x(stim[1]) - x(stim[0])} height={rows.length * rh} fill={pal.surface2} />
      {rows.map((r, i) => (
        <g key={r.label} transform={`translate(0 ${i * rh})`}>
          <text x={lw - 6} y={rh - 3} fontSize={9.5} textAnchor="end" fill={pal.ink2} fontFamily="var(--font-mono)">
            {r.label}
          </text>
          {r.spikes
            .filter((s) => s <= cursor)
            .map((s, k) => (
              <line key={k} x1={x(s)} x2={x(s)} y1={2} y2={rh - 2} stroke={pal.ink} strokeWidth={1} />
            ))}
        </g>
      ))}
      <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={rows.length * rh} stroke={pal.accent} strokeWidth={1} />
      {[0, 500, 1000, 1500].filter((v) => v <= tMax).map((v) => (
        <text key={v} x={x(v)} y={h - 3} fontSize={9} fill={pal.ink2} textAnchor="middle">
          {v === 0 ? "0" : v} {v === 1500 ? "ms" : ""}
        </text>
      ))}
    </svg>
  );
}

export interface Curve {
  receptor: string;
  ec50: number;
}

/** Dose–response curves (Hill, n = 1) for every pair with a measured EC50. */
export function DoseResponse({
  curves,
  conc,
  selected,
  onSelect,
}: {
  curves: Curve[];
  conc: number;
  selected: string | null;
  onSelect?: (receptor: string) => void;
}) {
  const pal = usePalette();
  const Wd = 640, H = 280, m = { l: 36, r: 16, t: 12, b: 34 };
  const iw = Wd - m.l - m.r, ih = H - m.t - m.b;
  const lo = -8, hi = -2;
  const x = (logc: number) => m.l + ((logc - lo) / (hi - lo)) * iw;
  const y = (a: number) => m.t + ih - a * ih;
  const [hoverX, setHoverX] = useState<number | null>(null);
  const pts = Array.from({ length: 121 }, (_, i) => lo + ((hi - lo) * i) / 120);
  const path = (ec50: number) => line<number>().x((l) => x(l)).y((l) => y(hill(10 ** l, ec50)))(pts) ?? "";
  const ordered = [...curves].sort((a, b) => (a.receptor === selected ? 1 : b.receptor === selected ? -1 : 0));
  const hoverList =
    hoverX !== null
      ? curves
          .map((c) => ({ r: c.receptor, a: hill(10 ** hoverX, c.ec50) }))
          .sort((p, q) => q.a - p.a)
          .slice(0, 6)
      : [];
  const sel = curves.find((c) => c.receptor === selected);
  return (
    <div className="grid-wrap">
      <svg
        viewBox={`0 0 ${Wd} ${H}`}
        width="100%"
        role="img"
        aria-label={`Dose–response curves for ${curves.length} receptors with a measured EC50`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * Wd;
          const l = lo + ((px - m.l) / iw) * (hi - lo);
          setHoverX(l >= lo && l <= hi ? l : null);
        }}
        onPointerLeave={() => setHoverX(null)}
      >
        {[0, 0.5, 1].map((a) => (
          <g key={a}>
            <line x1={m.l} x2={m.l + iw} y1={y(a)} y2={y(a)} stroke={a === 0 ? pal.axis : pal.line} strokeWidth={1} />
            <text x={m.l - 6} y={y(a) + 3} fontSize={10} textAnchor="end" fill={pal.ink2}>
              {a}
            </text>
          </g>
        ))}
        {[-8, -7, -6, -5, -4, -3, -2].map((l) => (
          <text key={l} x={x(l)} y={H - 16} fontSize={10} textAnchor="middle" fill={pal.ink2}>
            {formatConc(10 ** l)}
          </text>
        ))}
        <text x={m.l + iw / 2} y={H - 2} fontSize={10} textAnchor="middle" fill={pal.ink2}>
          Assay concentration (log scale) — not a nasal concentration
        </text>
        <text x={4} y={m.t + 2} fontSize={10} fill={pal.ink2} dominantBaseline="hanging" transform={`rotate(-90 4 ${m.t + 2})`} textAnchor="end">
          Activation a
        </text>
        {ordered.map((c) => {
          const isSel = c.receptor === selected;
          return (
            <g key={c.receptor} onClick={() => onSelect?.(c.receptor)} style={{ cursor: onSelect ? "pointer" : "default" }}>
              <path d={path(c.ec50)} fill="none" stroke="transparent" strokeWidth={10} />
              <path d={path(c.ec50)} fill="none" stroke={isSel ? pal.accent : pal.axis} strokeWidth={isSel ? 2.5 : 1.5} />
            </g>
          );
        })}
        {sel && (
          <g>
            <circle cx={x(Math.log10(sel.ec50))} cy={y(0.5)} r={4.5} fill={pal.accent} stroke={pal.surface} strokeWidth={2} />
            <text x={x(Math.log10(sel.ec50)) + 8} y={y(0.5) - 8} fontSize={11} fill={pal.ink} fontFamily="var(--font-mono)">
              {sel.receptor} · EC50 {formatConc(sel.ec50)}
            </text>
          </g>
        )}
        <line x1={x(Math.log10(conc))} x2={x(Math.log10(conc))} y1={m.t} y2={m.t + ih} stroke={pal.ink} strokeWidth={1} />
        <text x={x(Math.log10(conc)) + 4} y={m.t + 10} fontSize={10} fill={pal.ink}>
          {formatConc(conc)}
        </text>
        {hoverX !== null && <line x1={x(hoverX)} x2={x(hoverX)} y1={m.t} y2={m.t + ih} stroke={pal.ink2} strokeWidth={1} />}
      </svg>
      {hoverX !== null && hoverList.length > 0 && (
        <div className="tooltip" style={{ left: `${Math.min(70, ((x(hoverX) + 12) / Wd) * 100)}%`, top: 10 }}>
          <div className="muted">at {formatConc(10 ** hoverX)}</div>
          {hoverList.map((h) => (
            <div key={h.r}>
              <span className="t-value">{h.a.toFixed(2)}</span> <span className="mono">{h.r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
