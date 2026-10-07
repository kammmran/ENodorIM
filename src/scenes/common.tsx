import type { Odorant } from "../data/types";
import type { SimulationResult } from "../model/simulation";
import type { Palette } from "../ui/colors";

export interface SceneProps {
  /** Progress through this stage, 0–1. */
  p: number;
  /** Physiological clock for the OSN traces (ms). */
  tau: number;
  sim: SimulationResult;
  odorant: Odorant;
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
