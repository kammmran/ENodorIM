import type { Odorant } from "../data/types";
import type { SimulationResult } from "../model/simulation";
import type { Palette } from "../ui/colors";

/** One component of the mixture being simulated, with its own hue. */
export interface SceneComponent {
  id: string;
  label: string;
  fraction: number;
  color: string;
}

/**
 * The mixture behind the stimulus, for the scenes that draw individual odorant
 * molecules. Downstream of the receptor a mixture is one stimulus, so only the
 * sniff, binding and transduction scenes have components to tell apart.
 */
export interface SceneMixture {
  components: SceneComponent[];
  /** Per receptor, each component's share of the drive there (largest first). */
  shares: Map<string, { id: string; share: number }[]>;
  byId: Map<string, SceneComponent>;
}

export interface SceneProps {
  /** Progress through this stage, 0–1. */
  p: number;
  /** Physiological clock for the OSN traces (ms). */
  tau: number;
  sim: SimulationResult;
  odorant: Odorant;
  /** Set only when the stimulus is a mixture of two or more components. */
  mixture?: SceneMixture;
  reduced: boolean;
  pal: Palette;
}

export const VB = { w: 800, h: 460 };

/** Seven transmembrane helices, top at y, centred on x. */
export function SevenTM({
  x,
  y,
  fill,
  stroke,
  h = 52,
  label,
  pal,
  pocket = true,
}: {
  x: number;
  y: number;
  fill: string;
  stroke: string;
  h?: number;
  label?: string;
  pal: Palette;
  pocket?: boolean;
}) {
  const w = 8, gap = 2.5, n = 7;
  const total = n * w + (n - 1) * gap;
  const x0 = x - total / 2;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x0 + i * (w + gap)} y={y + (i % 2 ? 3 : 0)} width={w} height={h - 3} rx={3.5} fill={fill} stroke={stroke} strokeWidth={1} />
      ))}
      {Array.from({ length: n - 1 }, (_, i) => {
        const xa = x0 + i * (w + gap) + w / 2, xb = xa + w + gap;
        const top = i % 2 === 0;
        const yy = top ? y + (i % 2 ? 3 : 0) : y + h - 3 + (i % 2 ? 3 : 0);
        return (
          <path
            key={`l${i}`}
            d={top ? `M${xa} ${yy + 1} Q${(xa + xb) / 2} ${yy - 7} ${xb} ${yy + 3}` : `M${xa} ${yy - 1} Q${(xa + xb) / 2} ${yy + 8} ${xb} ${yy}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
          />
        );
      })}
      {pocket && <ellipse cx={x} cy={y + 13} rx={9} ry={7} fill="none" stroke={pal.ink2} strokeWidth={0.8} strokeDasharray="2 2" />}
      {label && (
        <text x={x} y={y + h + 18} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill={pal.ink}>
          {label}
        </text>
      )}
    </g>
  );
}

export function Label({ x, y, text, anchor = "start", pal, size = 11, weight = 400, muted = false }: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end"; pal: Palette; size?: number; weight?: number; muted?: boolean }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} textAnchor={anchor} fill={muted ? pal.ink2 : pal.ink}>
      {text}
    </text>
  );
}

export function Leader({ x1, y1, x2, y2, pal }: { x1: number; y1: number; x2: number; y2: number; pal: Palette }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={pal.axis} strokeWidth={1} />;
}

export function SchematicBadge({ pal, x = VB.w - 12, y = 20, text = "schematic" }: { pal: Palette; x?: number; y?: number; text?: string }) {
  const w = text.length * 6.2 + 12;
  return (
    <g>
      <rect x={x - w} y={y - 12} width={w} height={17} rx={3} fill="none" stroke={pal.axis} strokeDasharray="3 2" />
      <text x={x - w / 2} y={y} fontSize={10} textAnchor="middle" fill={pal.ink2} style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {text}
      </text>
    </g>
  );
}

/**
 * Component colours as a key along the bottom of a scene. Every swatch carries
 * its component's name, so identity never rests on colour alone.
 */
export function ComponentKey({ mixture, pal, x = 16, y = VB.h - 20 }: { mixture: SceneMixture; pal: Palette; x?: number; y?: number }) {
  let cx = 0;
  return (
    <g transform={`translate(${x} ${y})`}>
      {mixture.components.map((c) => {
        const at = cx;
        cx += c.label.length * 6 + 34;
        return (
          <g key={c.id}>
            <circle cx={at + 5} cy={-3} r={3.6} fill={c.color} stroke={pal.surface} strokeWidth={1.2} />
            <text x={at + 14} y={0} fontSize={10.5} fill={pal.ink2}>
              {c.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
