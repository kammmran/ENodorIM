import type { KellerDescriptors } from "../data/types";
import { BrainOutline, DOWNSTREAM, MOTOR, POC, RegionShape } from "./Brain";
import { Label, SchematicBadge, VB, type SceneProps } from "./common";
import { smooth } from "./geometry";

// Downstream regions light up (schematic); the percept itself is shown from data
// in the panel next to this scene.

export function PerceptionScene({ p, sim, odorant, reduced, pal }: SceneProps) {
  const prog = reduced ? 1 : p;
  const keller = odorant.descriptors.find((d): d is KellerDescriptors => d.source === "keller_2016");
  const unpleasant = keller?.pleasantness != null && keller.pleasantness < 40;
  const lit = DOWNSTREAM.map((_, k) => smooth((prog - 0.1 - k * 0.12) / 0.2));
  const motor = unpleasant ? smooth((prog - 0.3) / 0.2) : 0;
  return (
    <svg className="scene" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label="Regions functionally connected with primary olfactory cortex: orbitofrontal cortex, insula, hippocampus and amygdala (schematic brightness).">
      <SchematicBadge pal={pal} />
      <BrainOutline pal={pal} />
      {POC.filter((r) => r.id !== "amygdala").map((r) => (
        <ellipse key={r.id} {...r.shape} fill={pal.ramp(sim.cortex[r.id] * 0.6)} stroke={pal.axis} strokeWidth={0.8} />
      ))}
      {DOWNSTREAM.map((r, k) => (
        <RegionShape key={r.id} r={r} level={sim.cortex[r.id] * lit[k]} pal={pal} />
      ))}
      <path d={MOTOR.d} fill={motor > 0.02 ? pal.accent : "none"} fillOpacity={0.8 * motor} stroke={motor > 0.02 ? pal.accent : pal.axis} strokeWidth={1} />
      <Label x={MOTOR.label[0]} y={MOTOR.label[1]} text={unpleasant ? "Motor cortex (300–400 ms, unpleasant odors)" : "Motor cortex"} pal={pal} size={10.5} muted={!unpleasant} />
      <g transform="translate(16 30)">
        <Label x={0} y={0} text="Beyond primary olfactory cortex" pal={pal} weight={600} size={12} />
        <Label x={0} y={17} text="Networks include orbitofrontal cortex, insula, hippocampus and amygdala" pal={pal} muted size={10.5} />
      </g>
      <Label x={16} y={VB.h - 14} text="Brightness is schematic. The percept (right) comes from human perception data, not from this diagram." pal={pal} muted size={10} />
    </svg>
  );
}
