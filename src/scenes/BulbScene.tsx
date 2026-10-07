import { useId } from "react";
import { Label, SchematicBadge, VB, type SceneProps } from "./common";
import { lerp, smooth } from "./geometry";

// Schematic olfactory bulb: one glomerulus per receptor type, coloured by its
// input; lateral inhibition then sharpens the pattern.

export function BulbScene({ p, sim, reduced, pal }: SceneProps) {
  const arrowId = `bulb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const prog = reduced ? 1 : p;
  const s = smooth((prog - 0.45) / 0.35);
  const maxIn = Math.max(1e-6, ...sim.bulbIn);
  const X = (x: number) => 110 + x * 560;
  const Y = (y: number) => 40 + y * 340;
  const values = sim.bulbIn.map((x, i) => lerp(x, sim.bulbOut[i], s) / maxIn);
  const order = sim.bulbIn.map((x, i) => [x, i] as const).filter(([x]) => x > 0).sort((a, b) => b[0] - a[0]);
  const top = order.slice(0, 6).map(([, i]) => i);
  const axonsIn = 1 - smooth((prog - 0.3) / 0.2);
  const mitral = smooth((prog - 0.35) / 0.25);
  const cx = X(0.5), cy = Y(0.5);
  const share = (k: number) => `${Math.round(k * 100)}%`;
  return (
    <svg className="scene" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={`Olfactory bulb: ${order.length} glomeruli receive input. The three strongest carry ${share(sim.sharpening.before)} of the activity before and ${share(sim.sharpening.after)} after lateral inhibition (schematic).`}>
      <defs>
        <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill={pal.ink2} />
        </marker>
      </defs>
      <ellipse cx={cx} cy={cy} rx={300} ry={180} fill={pal.tissue} stroke={pal.ink2} strokeWidth={1.2} />
      <SchematicBadge pal={pal} text="schematic layout" />
      {/* OSN axons converging on the strongest glomeruli */}
      {axonsIn > 0.02 &&
        top.map((i, k) =>
          [0, 1, 2].map((j) => {
            const g = sim.bulbPos[i];
            return (
              <path
                key={`${i}-${j}`}
                d={`M0 ${60 + k * 60 + j * 10} C${X(g.x) * 0.4} ${60 + k * 60 + j * 10} ${X(g.x) * 0.6} ${Y(g.y)} ${X(g.x)} ${Y(g.y)}`}
                fill="none"
                stroke={pal.ramp(sim.bulbIn[i] / maxIn)}
                strokeWidth={1}
                opacity={axonsIn * 0.9}
              />
            );
          }),
        )}
      {/* Glomeruli */}
      {sim.bulbPos.map((g, i) => {
        const v = values[i];
        return v > 0.001 ? (
          <circle key={g.receptor} cx={X(g.x)} cy={Y(g.y)} r={5.2} fill={pal.ramp(v)} stroke={pal.surface} strokeWidth={1} />
        ) : (
          <circle key={g.receptor} cx={X(g.x)} cy={Y(g.y)} r={4.2} fill="none" stroke={pal.axis} strokeWidth={0.8} />
        );
      })}
      {/* Mitral/tufted cells and output */}
      {mitral > 0.02 &&
        top.map((i) => {
          const g = sim.bulbPos[i];
          const gx = X(g.x), gy = Y(g.y);
          const mx = lerp(gx, cx, 0.22), my = lerp(gy, cy, 0.22);
          const out = sim.bulbOut[i] / maxIn;
          return (
            <g key={`m-${i}`} opacity={mitral}>
              <line x1={gx} y1={gy} x2={mx} y2={my} stroke={pal.ink2} strokeWidth={1} />
              <path d={`M${mx} ${my - 6} L${mx - 5.5} ${my + 4} L${mx + 5.5} ${my + 4} Z`} fill={out > 0 ? pal.ink : "none"} stroke={pal.ink} strokeWidth={1} />
              <path d={`M${mx} ${my} C${lerp(mx, cx, 0.5)} ${lerp(my, cy, 0.5)} ${cx + 120} ${cy} ${cx + 250} ${cy + 6}`} fill="none" stroke={pal.ink2} strokeWidth={out > 0 ? 1.2 : 0.6} opacity={out > 0 ? 1 : 0.4} />
            </g>
          );
        })}
      <path d={`M${cx + 250} ${cy + 6} L${VB.w - 8} ${cy + 6}`} stroke={pal.ink2} strokeWidth={1.4} markerEnd={`url(#${arrowId})`} opacity={mitral} />
      <Label x={VB.w - 10} y={cy - 6} anchor="end" text="to cortex" pal={pal} muted size={10.5} />
      {top[0] !== undefined && (
        <Label x={X(sim.bulbPos[top[0]].x)} y={Y(sim.bulbPos[top[0]].y) - 10} anchor="middle" text={sim.bulbPos[top[0]].receptor} pal={pal} size={10.5} weight={500} />
      )}
      <g transform="translate(16 30)">
        <Label x={0} y={0} text="Glomeruli (one per receptor type)" pal={pal} weight={500} size={11} />
        <Label x={0} y={16} text={s < 0.5 ? "Input from sensory neurons" : "After lateral inhibition"} pal={pal} muted size={10.5} />
      </g>
      <g transform={`translate(16 ${VB.h - 34})`}>
        <Label
          x={0}
          y={0}
          text={`Three strongest glomeruli carry ${share(sim.sharpening.before)} of the activity → ${share(sim.sharpening.after)} after lateral inhibition.`}
          pal={pal}
          size={11}
        />
        <Label x={0} y={16} text="Humans have >5,500 glomeruli per bulb (~16 per receptor type); the human receptor-to-glomerulus map is unknown." pal={pal} muted size={10} />
      </g>
    </svg>
  );
}
