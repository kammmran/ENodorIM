import { BrainOutline, DOWNSTREAM, OB, POC, RegionShape } from "./Brain";
import { Label, SchematicBadge, VB, type SceneProps } from "./common";
import { smooth } from "./geometry";

// Direct projections from the bulb to primary olfactory cortex (no thalamic relay first).

export function CortexScene({ p, sim, reduced, pal }: SceneProps) {
  const prog = reduced ? 1 : p;
  const lit = POC.map((_, k) => smooth((prog - 0.1 - k * 0.1) / 0.15));
  return (
    <svg className="scene" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={`Primary olfactory cortex: the bulb projects directly to the anterior olfactory nucleus, olfactory tubercle, frontal and temporal piriform cortex, amygdala and entorhinal cortex. Model output level ${(sim.cortex["piriform-frontal"] * 100).toFixed(0)}% (schematic).`}>
      <SchematicBadge pal={pal} />
      <BrainOutline pal={pal} />
      {DOWNSTREAM.filter((r) => r.id !== "amygdala-2").map((r) => (
        <ellipse key={r.id} {...r.shape} fill="none" stroke={pal.axis} strokeWidth={0.8} />
      ))}
      {POC.map((r, k) => (
        <path
          key={`proj-${r.id}`}
          d={`M${OB.cx + OB.rx - 4} ${OB.cy + 2} Q${(OB.cx + r.shape.cx) / 2} ${r.shape.cy + 34} ${r.shape.cx} ${r.shape.cy}`}
          fill="none"
          stroke={pal.accent}
          strokeWidth={1.4}
          opacity={lit[k]}
        />
      ))}
      {POC.map((r, k) => (
        <RegionShape key={r.id} r={r} level={sim.cortex[r.id] * lit[k]} pal={pal} />
      ))}
      <g transform="translate(16 30)">
        <Label x={0} y={0} text="Primary olfactory cortex" pal={pal} weight={600} size={12} />
        <Label x={0} y={17} text="Direct input from the olfactory bulb — no thalamic relay first" pal={pal} muted size={10.5} />
      </g>
      <Label x={16} y={VB.h - 14} text="Lateral view, front to the left; deep structures projected. Brightness follows the model's bulb output (schematic)." pal={pal} muted size={10} />
    </svg>
  );
}
