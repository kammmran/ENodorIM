import { osnResponse } from "../model/transduction";
import { Label, SchematicBadge, VB, type SceneProps } from "./common";
import { polylineAt, type Pt } from "./geometry";

// Action potentials travel to the bulb; the raster shows one model neuron per
// responding receptor type. Termination mechanisms light up after the stimulus.

const AXON: Pt[] = [[96, 228], [96, 296], [124, 328], [786, 328]];
const SPEED = 0.55; // px per ms (display only)

export function FiringScene({ tau, sim, reduced, pal }: SceneProps) {
  const t = reduced ? 1600 : tau;
  const lead = sim.lead;
  const rows = sim.active.slice(0, 8).map((x) => ({ r: x.receptor, spikes: osnResponse(x.a).trace.spikes }));
  const stimOn = 100, stimOff = 1100, tMax = 1600;
  const rx0 = 470, rx1 = 780, ry0 = 72, rh = 24;
  const X = (ms: number) => rx0 + (ms / tMax) * (rx1 - rx0);
  const leadSpikes = lead ? osnResponse(lead.a).trace.spikes : [];
  // Every 4th spike, so the axon reads as a travelling train rather than a solid band.
  const pulses = leadSpikes
    .filter((s, i) => i % 4 === 0 && s <= t)
    .map((s) => polylineAt(AXON, (t - s) * SPEED))
    .filter((pt): pt is Pt => pt !== null && !reduced);
  const after = t >= stimOff;
  const adapting = t > 400 && t < stimOff;
  const box = (x: number, title: string, body: string, on: boolean) => (
    <g transform={`translate(${x} 368)`}>
      <rect width={244} height={70} rx={5} fill={on ? pal.surface2 : "none"} stroke={on ? pal.accent : pal.axis} strokeWidth={on ? 1.5 : 1} />
      <text x={12} y={22} fontSize={12} fontWeight={600} fill={pal.ink}>
        {title}
      </text>
      <text x={12} y={42} fontSize={10.5} fill={pal.ink2}>
        {body.split("|")[0]}
      </text>
      <text x={12} y={57} fontSize={10.5} fill={pal.ink2}>
        {body.split("|")[1] ?? ""}
      </text>
    </g>
  );
  return (
    <svg className="scene" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={`Firing and reset: ${rows.length} receptor types fire; ${lead ? `${lead.receptor} neuron fires ${leadSpikes.length} action potentials in the model` : "no responding receptor"}.`}>
      <SchematicBadge pal={pal} text="schematic model" />
      {/* Neuron */}
      {Array.from({ length: 6 }, (_, k) => (
        <path key={k} d={`M96 84 C${80 + k * 6} 70 ${60 + k * 14} 60 ${40 + k * 18} 40`} fill="none" stroke={pal.ink2} strokeWidth={1} />
      ))}
      <circle cx={96} cy={86} r={6} fill={pal.surface} stroke={pal.ink} />
      <line x1={96} y1={92} x2={96} y2={172} stroke={pal.ink} strokeWidth={2} />
      <ellipse cx={96} cy={200} rx={22} ry={28} fill={pal.surface} stroke={pal.ink} strokeWidth={1.4} />
      <circle cx={96} cy={200} r={7} fill={lead ? pal.ramp(lead.a) : pal.surface2} />
      <polyline points={AXON.map((p) => p.join(",")).join(" ")} fill="none" stroke={pal.ink} strokeWidth={2} />
      <Label x={24} y={30} text="Cilia" pal={pal} muted size={10.5} />
      <Label x={126} y={204} text="Sensory neuron" pal={pal} size={11} weight={500} />
      <Label x={126} y={218} text={lead ? `expresses ${lead.receptor}` : "no responding receptor"} pal={pal} muted size={10.5} />
      <Label x={786} y={316} anchor="end" text="axon → olfactory bulb" pal={pal} muted size={10.5} />
      {pulses.map(([x, y], k) => (
        <path key={k} d={`M${x} ${y - 9} L${x} ${y + 9}`} stroke={pal.accent} strokeWidth={2.5} strokeLinecap="round" />
      ))}
      <text x={128} y={352} fontSize={10.5} fill={pal.ink2}>
        Propagation speed is not to scale; one mark per 4 spikes.
      </text>

      {/* Raster */}
      <text x={rx0 - 92} y={ry0 - 34} fontSize={11.5} fontWeight={600} fill={pal.ink}>
        Action potentials per receptor type
      </text>
      <rect x={X(stimOn)} y={ry0 - 10} width={X(stimOff) - X(stimOn)} height={Math.max(1, rows.length) * rh} fill={pal.surface2} />
      <text x={X(stimOn) + 4} y={ry0 - 13} fontSize={9.5} fill={pal.ink2}>
        odorant present
      </text>
      {rows.map((row, k) => (
        <g key={row.r} transform={`translate(0 ${ry0 + k * rh})`}>
          <text x={rx0 - 8} y={4} fontSize={10.5} textAnchor="end" fontFamily="var(--font-mono)" fill={pal.ink}>
            {row.r}
          </text>
          {row.spikes
            .filter((s) => s <= t)
            .map((s, j) => (
              <line key={j} x1={X(s)} x2={X(s)} y1={-7} y2={7} stroke={pal.ink} strokeWidth={1} />
            ))}
        </g>
      ))}
      {rows.length === 0 && <Label x={(rx0 + rx1) / 2} y={ry0 + 20} anchor="middle" text="No receptor responds at this concentration." pal={pal} muted />}
      <line x1={X(Math.min(t, tMax))} x2={X(Math.min(t, tMax))} y1={ry0 - 10} y2={ry0 + Math.max(1, rows.length) * rh - 10} stroke={pal.accent} />
      {[0, 500, 1000, 1500].map((v) => (
        <text key={v} x={X(v)} y={ry0 + Math.max(1, rows.length) * rh + 4} fontSize={9.5} textAnchor="middle" fill={pal.ink2}>
          {v} {v === 1500 ? "ms" : ""}
        </text>
      ))}

      {/* Termination and adaptation */}
      {box(16, "PDE1C", "hydrolyses cAMP in the cilium|after the odorant is gone", after)}
      {box(278, "NCKX4", "extrudes Ca²⁺; without it, termination|is prolonged by seconds (mouse)", after)}
      {box(540, "Ca²⁺–calmodulin", "lowers CNG sensitivity to cAMP:|adaptation during the stimulus", adapting || after)}
    </svg>
  );
}
