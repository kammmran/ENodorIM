import { useMemo, useRef, useState } from "react";
import type { Receptor } from "../data/types";
import { formatConc } from "../model/activation";
import { EVIDENCE_LABEL, STATE_LABEL, type DataState, type EvidenceTier } from "../model/evidence";
import type { ReceptorActivation } from "../model/stimulus";
import { usePalette, type Palette } from "./colors";

// The receptor "barcode": every human OR, grouped by family (class I families
// first), one cell each. Colour = activation (one hue); mark size = evidence;
// outline = tested without response; slash = results disagree; dot = not tested.

export interface GridGeometry {
  cells: { gene: string; x: number; y: number }[];
  rows: { y: number; label: string | null }[];
  classes: { y: number; label: string }[];
  width: number;
  height: number;
  cell: number;
}

const LABEL_W = 26;

export function gridLayout(receptors: Receptor[], columns: number, cell: number, gap = 2): GridGeometry {
  const step = cell + gap;
  const cells: GridGeometry["cells"] = [];
  const rows: GridGeometry["rows"] = [];
  const classes: GridGeometry["classes"] = [];
  const famLabel = (r: Receptor) => (r.family !== null ? String(r.family) : "·");
  let y = 0;
  let col = 0;
  let fam: number | null | undefined;
  let cls: string | undefined;
  for (const r of receptors) {
    const rcls = r.cls ?? "other";
    if (rcls !== cls) {
      // New class block: gap, class label, then the first family row.
      if (cls !== undefined) y += step + 8;
      y += 13;
      classes.push({ y: y - 4, label: rcls === "I" ? "Class I" : rcls === "II" ? "Class II" : "Other names in M2OR" });
      rows.push({ y, label: famLabel(r) });
      cls = rcls;
      fam = r.family;
      col = 0;
    } else if (r.family !== fam) {
      y += step;
      rows.push({ y, label: famLabel(r) });
      fam = r.family;
      col = 0;
    } else if (col >= columns) {
      y += step;
      rows.push({ y, label: null });
      col = 0;
    }
    cells.push({ gene: r.gene, x: LABEL_W + col * step, y });
    col++;
  }
  const height = (cells.length ? cells[cells.length - 1].y : 0) + cell + 2;
  return { cells, rows, classes, width: LABEL_W + columns * step, height, cell };
}

export type CellValue =
  | {
      mode: "activation";
      act: ReceptorActivation;
      /** Overrides the activation ramp, e.g. with a mixture component's own hue. */
      ramp?: (a: number) => string;
      /** Extra tooltip line, e.g. which component drives this receptor. */
      note?: string;
    }
  | { mode: "coverage"; nAgonists: number; nTested: number };

function evidenceScale(e: EvidenceTier | null): number {
  return e === "dose-response" ? 1 : e === "confirmed" ? 0.72 : 0.5;
}

function Cell({ x, y, size, v, pal, maxAgonists }: { x: number; y: number; size: number; v: CellValue; pal: Palette; maxAgonists: number }) {
  if (v.mode === "coverage") {
    if (v.nTested === 0) return <circle cx={x + size / 2} cy={y + size / 2} r={1.2} fill={pal.axis} />;
    if (v.nAgonists === 0)
      return <rect x={x + 0.5} y={y + 0.5} width={size - 1} height={size - 1} rx={1.5} fill="none" stroke={pal.muted} strokeWidth={1} />;
    const t = Math.sqrt(v.nAgonists / maxAgonists);
    return <rect x={x} y={y} width={size} height={size} rx={1.5} fill={pal.ramp(0.15 + 0.85 * t)} />;
  }
  const { act } = v;
  const state: DataState = act.state;
  if (state === "untested") return <circle cx={x + size / 2} cy={y + size / 2} r={1.2} fill={pal.axis} />;
  if (state === "non_agonist")
    return <rect x={x + 0.5} y={y + 0.5} width={size - 1} height={size - 1} rx={1.5} fill="none" stroke={pal.muted} strokeWidth={1} />;
  if (state === "inconclusive")
    return (
      <g>
        <rect x={x + 0.5} y={y + 0.5} width={size - 1} height={size - 1} rx={1.5} fill="none" stroke={pal.muted} strokeWidth={1} />
        <path d={`M${x + 2} ${y + size - 2} L${x + size - 2} ${y + 2}`} stroke={pal.muted} strokeWidth={1} />
      </g>
    );
  const s = size * evidenceScale(act.evidence);
  const o = (size - s) / 2;
  const ramp = v.ramp ?? pal.ramp;
  if (act.a <= 0)
    return (
      <rect x={x + o + 0.5} y={y + o + 0.5} width={s - 1} height={s - 1} rx={1.2} fill="none" stroke={ramp(0.55)} strokeWidth={1} />
    );
  return <rect x={x + o} y={y + o} width={s} height={s} rx={1.2} fill={ramp(act.a)} />;
}

export interface ReceptorGridProps {
  receptors: Receptor[];
  values: CellValue[];
  columns: number;
  cell: number;
  selected?: string | null;
  highlight?: Set<string>;
  onSelect?: (gene: string) => void;
  label: string;
  showClassLabels?: boolean;
}

export function ReceptorGrid({ receptors, values, columns, cell, selected, highlight, onSelect, label, showClassLabels = true }: ReceptorGridProps) {
  const pal = usePalette();
  const geo = useMemo(() => gridLayout(receptors, columns, cell), [receptors, columns, cell]);
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; left: number; top: number } | null>(null);
  const maxAgonists = useMemo(
    () => Math.max(1, ...values.map((v) => (v.mode === "coverage" ? v.nAgonists : 0))),
    [values],
  );

  const hit = (ev: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const sx = geo.width / rect.width;
    const px = (ev.clientX - rect.left) * sx;
    const py = (ev.clientY - rect.top) * sx;
    const pad = 1;
    const i = geo.cells.findIndex((c) => px >= c.x - pad && px <= c.x + cell + pad && py >= c.y - pad && py <= c.y + cell + pad);
    return i >= 0 ? { i, rect, sx } : null;
  };

  return (
    <div className="grid-wrap" ref={wrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        width={geo.width}
        role="img"
        aria-label={label}
        onPointerMove={(ev) => {
          const h = hit(ev);
          const w = wrap.current?.getBoundingClientRect();
          if (!h || !w) return setHover(null);
          const c = geo.cells[h.i];
          setHover({ i: h.i, left: h.rect.left - w.left + (c.x + cell) / h.sx + 8, top: h.rect.top - w.top + c.y / h.sx });
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(ev) => {
          const h = hit(ev as unknown as React.PointerEvent);
          if (h && onSelect) onSelect(geo.cells[h.i].gene);
        }}
        style={{ cursor: onSelect ? "pointer" : "default" }}
      >
        {showClassLabels &&
          geo.classes.map((c) => (
            <text key={c.label} x={0} y={c.y} fontSize={9} fill={pal.ink2} style={{ letterSpacing: "0.06em" }}>
              {c.label.toUpperCase()}
            </text>
          ))}
        {geo.rows.map((r, k) =>
          r.label ? (
            <text key={k} x={LABEL_W - 6} y={r.y + cell - 1} fontSize={Math.min(10, cell)} textAnchor="end" fill={pal.ink2} fontFamily="var(--font-mono)">
              {r.label}
            </text>
          ) : null,
        )}
        {geo.cells.map((c, i) => (
          <Cell key={c.gene} x={c.x} y={c.y} size={cell} v={values[i]} pal={pal} maxAgonists={maxAgonists} />
        ))}
        {geo.cells.map((c) =>
          c.gene === selected || highlight?.has(c.gene) ? (
            <rect
              key={`sel-${c.gene}`}
              x={c.x - 1.5}
              y={c.y - 1.5}
              width={cell + 3}
              height={cell + 3}
              rx={2}
              fill="none"
              stroke={c.gene === selected ? pal.accent : pal.ink}
              strokeWidth={c.gene === selected ? 2 : 1}
            />
          ) : null,
        )}
      </svg>
      {hover && <GridTooltip receptor={receptors[hover.i]} v={values[hover.i]} left={hover.left} top={hover.top} />}
    </div>
  );
}

function GridTooltip({ receptor, v, left, top }: { receptor: Receptor; v: CellValue; left: number; top: number }) {
  return (
    <div className="tooltip" style={{ left, top }}>
      <div className="t-gene">{receptor.gene}</div>
      {v.mode === "coverage" ? (
        <div>
          <span className="t-value">{v.nAgonists}</span> agonists among {v.nTested} molecules tested
        </div>
      ) : (
        <>
          <div>
            {v.act.state === "agonist" ? (
              <>
                <span className="t-value">a = {v.act.a.toFixed(2)}</span> {v.act.kind === "qualitative" && "(qualitative)"}
              </>
            ) : (
              <span className="t-value">{STATE_LABEL[v.act.state]}</span>
            )}
          </div>
          {v.act.state === "agonist" && (
            <div>
              {v.act.ec50 ? `EC50 ${formatConc(v.act.ec50)}` : v.act.threshold ? `responds from ${formatConc(v.act.threshold)}` : "responds"}
              {v.act.evidence && ` · ${EVIDENCE_LABEL[v.act.evidence]}`}
            </div>
          )}
          {v.act.genotype && <div>Genotype {v.act.genotype.genotype}</div>}
          {v.note && <div>{v.note}</div>}
        </>
      )}
      <div>
        Class {receptor.cls ?? "–"} · family {receptor.family ?? "–"}
        {receptor.locus_type === "pseudogene" && " · pseudogene in the reference genome"}
      </div>
    </div>
  );
}

/** Legend for the barcode: states, evidence sizes and the activation ramp. */
export function GridLegend({ compact = false }: { compact?: boolean }) {
  const pal = usePalette();
  const sw = 10;
  const box = (child: React.ReactNode) => (
    <svg width={sw + 2} height={sw + 2} aria-hidden>
      <g transform="translate(1,1)">{child}</g>
    </svg>
  );
  const sized = (k: number) => {
    const s = sw * k, o = (sw - s) / 2;
    return box(<rect x={o} y={o} width={s} height={s} rx={1.2} fill={pal.ramp(0.8)} />);
  };
  return (
    <div className="legend-row" role="list" aria-label="Legend">
      <span role="listitem">
        {box(<rect width={sw} height={sw} rx={1.5} fill={pal.ramp(0.8)} />)} Responds
      </span>
      <span role="listitem">
        {box(<rect x={0.5} y={0.5} width={sw - 1} height={sw - 1} rx={1.5} fill="none" stroke={pal.muted} />)} Tested, no response
      </span>
      <span role="listitem">
        {box(
          <>
            <rect x={0.5} y={0.5} width={sw - 1} height={sw - 1} rx={1.5} fill="none" stroke={pal.muted} />
            <path d={`M2 ${sw - 2} L${sw - 2} 2`} stroke={pal.muted} />
          </>,
        )}{" "}
        Results disagree
      </span>
      <span role="listitem">{box(<circle cx={sw / 2} cy={sw / 2} r={1.2} fill={pal.axis} />)} Not tested</span>
      {!compact && (
        <>
          <span role="listitem">
            {sized(1)} {sized(0.72)} {sized(0.5)} Evidence: dose–response · confirmed screen · single hit
          </span>
          <span role="listitem">
            {box(<rect x={0.5} y={0.5} width={sw - 1} height={sw - 1} rx={1.2} fill="none" stroke={pal.ramp(0.55)} />)} Responds at another
            concentration
          </span>
        </>
      )}
      <span role="listitem" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        Activation 0
        <svg width={72} height={10} aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={i * 6} y={0} width={6} height={10} fill={pal.ramp((i + 0.5) / 12)} />
          ))}
        </svg>
        1
      </span>
    </div>
  );
}
