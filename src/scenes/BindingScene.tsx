import { formatConc } from "../model/activation";
import { EVIDENCE_LABEL } from "../model/evidence";
import type { ReceptorActivation } from "../model/stimulus";
import { Label, SchematicBadge, SevenTM, VB, type SceneProps } from "./common";
import { clamp01, lerp, rand, smooth } from "./geometry";

// Zoom onto the cilium membrane: the strongest responders, plus one receptor
// that was tested without response, for contrast.

function pickReceptors(sim: SceneProps["sim"]): ReceptorActivation[] {
  const active = sim.active.slice(0, 4);
  const pool = sim.acts;
  const latent = pool.filter((x) => x.state === "agonist" && x.a === 0).slice(0, 4 - active.length);
  const none = pool.find((x) => x.state === "non_agonist");
  const out = [...active, ...latent];
  if (none) out.push(none);
  return out.slice(0, 5);
}

export function BindingScene({ p, sim, odorant, reduced, pal }: SceneProps) {
  const prog = reduced ? 1 : p;
  const shown = pickReceptors(sim);
  const xs = shown.map((_, i) => 110 + (i * 580) / Math.max(1, shown.length - 1 || 1));
  const memTop = 176, memBot = 198;
  const drift = reduced ? 0 : prog;
  const free = Array.from({ length: 24 }, (_, k) => ({
    x: 30 + rand(k) * 740 + Math.sin(drift * 6 + k) * 6,
    y: 34 + rand(k + 3) * 118 + Math.cos(drift * 5 + k * 1.7) * 4,
    k,
  }));
  return (
    <svg className="scene" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={`Receptor binding: ${sim.active.length} receptor types respond to ${odorant.name} at ${formatConc(sim.conc)}${shown[0] && shown[0].a > 0 ? `; strongest ${shown[0].receptor} (a = ${shown[0].a.toFixed(2)})` : ""}.`}>
      <rect x={0} y={0} width={VB.w} height={memTop} fill={pal.mucus} />
      <rect x={0} y={memBot} width={VB.w} height={VB.h - memBot} fill={pal.tissue} />
      <line x1={0} y1={memTop} x2={VB.w} y2={memTop} stroke={pal.ink2} strokeWidth={1.2} />
      <line x1={0} y1={memBot} x2={VB.w} y2={memBot} stroke={pal.ink2} strokeWidth={1.2} />
      <SchematicBadge pal={pal} />
      <Label x={16} y={24} text="Mucus" pal={pal} muted />
      <Label x={16} y={memTop + 15} text="Cilium membrane" pal={pal} muted size={10} />
      <Label x={16} y={VB.h - 16} text="Inside the cilium" pal={pal} muted />
      {free.map((m) => (
        <circle key={m.k} cx={m.x} cy={m.y} r={3.2} fill={pal.ink} stroke={pal.mucus} strokeWidth={1.2} opacity={0.75} />
      ))}
      {shown.map((r, i) => {
        const x = xs[i];
        const active = r.a > 0;
        const fill = active ? pal.ramp(r.a) : pal.surface2;
        const nb = active ? Math.max(1, Math.round(r.a * 3)) : 0;
        const gOn = active ? smooth((prog - 0.55) / 0.2) : 0;
        return (
          <g key={r.receptor}>
            {Array.from({ length: nb }, (_, m) => {
              const t = smooth((prog - 0.15 - m * 0.12 - i * 0.04) / 0.25);
              if (t <= 0) return null;
              const sx = x - 40 + rand(i * 10 + m) * 80, sy = 40 + rand(i * 7 + m) * 80;
              const tx = x + (m - (nb - 1) / 2) * 6, ty = memTop + 7;
              return <circle key={m} cx={lerp(sx, tx, t)} cy={lerp(sy, ty, t)} r={3.4} fill={pal.accent} stroke={pal.surface} strokeWidth={1.3} />;
            })}
            <SevenTM x={x} y={memTop - 8} h={46} fill={fill} stroke={active ? pal.ink2 : pal.axis} pal={pal} />
            {gOn > 0 && (
              <g opacity={gOn}>
                <ellipse cx={x - 6} cy={memBot + 30} rx={20} ry={11} fill={pal.surface} stroke={pal.ink2} />
                <ellipse cx={x + 20} cy={memBot + 36} rx={11} ry={8} fill={pal.surface} stroke={pal.axis} />
                {i === 0 && <Label x={x - 6} y={memBot + 34} text="Gαolf" anchor="middle" pal={pal} size={10} />}
              </g>
            )}
            <text x={x} y={memBot + 74} textAnchor="middle" fontSize={12.5} fontFamily="var(--font-mono)" fontWeight={500} fill={pal.ink}>
              {r.receptor}
            </text>
            <text x={x} y={memBot + 90} textAnchor="middle" fontSize={11} fill={pal.ink2}>
              {r.state === "non_agonist"
                ? "tested, no response"
                : active
                  ? `a = ${r.a.toFixed(2)}${r.kind === "qualitative" ? " (qual.)" : ""}`
                  : r.threshold
                    ? `responds from ${formatConc(r.threshold)}`
                    : "responds at higher conc."}
            </text>
            {r.evidence && (
              <text x={x} y={memBot + 104} textAnchor="middle" fontSize={10} fill={pal.ink2}>
                {r.ec50 ? `EC50 ${formatConc(r.ec50)} · ` : ""}
                {EVIDENCE_LABEL[r.evidence]}
              </text>
            )}
            {r.genotype && (
              <text x={x} y={memBot + 118} textAnchor="middle" fontSize={10} fill={pal.accent}>
                genotype {r.genotype.genotype}
              </text>
            )}
          </g>
        );
      })}
      {shown.length === 0 && <Label x={VB.w / 2} y={260} anchor="middle" text="No receptor data for this odorant." pal={pal} muted />}
      <g transform={`translate(16 ${VB.h - 62})`} opacity={clamp01(prog * 3)}>
        <Label x={0} y={0} text={`${sim.active.length} receptor type${sim.active.length === 1 ? "" : "s"} respond at ${formatConc(sim.conc)} — the pattern is the code.`} pal={pal} weight={500} />
        <Label x={0} y={16} text="Each glyph stands for all neurons that express that receptor (one receptor type per neuron, rodent data)." pal={pal} muted size={10.5} />
      </g>
    </svg>
  );
}
