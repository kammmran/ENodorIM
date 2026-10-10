import { useId } from "react";
import { ComponentKey, Label, Leader, SchematicBadge, VB, type SceneProps } from "./common";
import { allocateMarks, clamp01, cubicD, lerp, pathAt, rand, smooth, type Cubic } from "./geometry";

// Sagittal section through the nose (face to the left), schematic.

const FLOW_OLF: Cubic[] = [
  [[118, 312], [150, 282], [176, 222], [236, 196]],
  [[236, 196], [282, 184], [324, 182], [362, 184]],
];
const FLOW_MID: Cubic[] = [
  [[118, 316], [180, 300], [232, 262], [302, 258]],
  [[302, 258], [402, 254], [500, 254], [560, 302]],
];
const FLOW_INF: Cubic[] = [
  [[118, 320], [200, 322], [302, 318], [402, 314]],
  [[402, 314], [482, 310], [540, 322], [568, 364]],
];
const FLOWS = [FLOW_OLF, FLOW_MID, FLOW_INF];
const N = 42;

export function SniffScene({ p, mixture, reduced, pal }: SceneProps) {
  const prog = reduced ? 1 : p;
  // In a mixture every molecule belongs to a component, so each gets that
  // component's hue and the inhaled stream shows the ratio directly. The
  // molecules are shared out in proportion to the mixture fractions.
  const owner = mixture ? allocateMarks(mixture.components.map((c) => c.fraction), N) : null;
  const fillOf = (k: number) => (owner && mixture ? mixture.components[owner[k]].color : pal.ink);
  const molecules = Array.from({ length: N }, (_, k) => {
    const lane = k % 3;
    const delay = rand(k) * 0.55;
    const u = clamp01((prog - delay) / 0.4);
    if (u <= 0) return null;
    if (lane === 0) {
      if (u < 1) {
        const [x, y] = pathAt(FLOW_OLF, u);
        return { x, y, dissolved: false, k };
      }
      // Arrived: dissolve into the mucus under the epithelium.
      const t = smooth((prog - delay - 0.4) / 0.15);
      const [x0, y0] = pathAt(FLOW_OLF, 1);
      return { x: lerp(x0, 262 + rand(k + 50) * 160, t), y: lerp(y0, 179 + rand(k + 7) * 3, t), dissolved: t > 0.9, k };
    }
    if (u >= 1) return null;
    const [x, y] = pathAt(FLOWS[lane], u);
    return { x, y, dissolved: false, k };
  });
  const inhale = Math.sin(Math.min(1, prog * 1.4) * Math.PI);
  const arrowId = `arrow${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg className="scene" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={`Sagittal section of the nose: inhaled air carries odorant molecules to the olfactory epithelium at the roof of the nasal cavity, where they dissolve in mucus.${mixture ? ` The mixture's components are drawn in different colours, in proportion to their shares: ${mixture.components.map((c) => `${c.label} ${Math.round(c.fraction * 100)}%`).join(", ")}.` : ""}`}>
      <SchematicBadge pal={pal} />
      {/* Frontal lobe and olfactory bulb */}
      <path d="M244 128 C240 70 334 32 452 36 C562 40 642 82 662 140 C602 150 522 147 470 141 C402 135 322 133 244 128 Z" fill={pal.tissue} stroke={pal.ink2} strokeWidth={1.2} />
      <Label x={452} y={92} text="Frontal lobe" pal={pal} muted />
      <ellipse cx={330} cy={146} rx={58} ry={8} fill={pal.surface2} stroke={pal.ink} strokeWidth={1.2} />
      <path d="M388 145 C420 143 450 141 486 139" fill="none" stroke={pal.ink} strokeWidth={1.2} />
      <Label x={505} y={124} text="Olfactory bulb" pal={pal} />
      <Leader x1={503} y1={128} x2={384} y2={144} pal={pal} />
      {/* Cribriform plate */}
      <line x1={252} y1={158} x2={442} y2={158} stroke={pal.ink2} strokeWidth={1.2} />
      {Array.from({ length: 15 }, (_, i) => (
        <line key={i} x1={262 + i * 12} y1={155} x2={262 + i * 12} y2={162} stroke={pal.surface} strokeWidth={2} />
      ))}
      <Label x={460} y={162} text="Cribriform plate" pal={pal} muted size={10} />
      {/* External nose and face */}
      <path d="M212 26 C202 80 182 122 166 162 C142 222 112 270 94 300 C87 313 93 325 107 327 L150 331 C157 343 158 353 154 363" fill="none" stroke={pal.ink} strokeWidth={1.4} />
      {/* Nasal cavity: roof, posterior wall, pharynx; floor/palate */}
      <path d="M160 318 C176 262 192 204 232 170 L452 168 C522 172 562 210 574 262 C580 300 584 340 586 456" fill="none" stroke={pal.ink2} strokeWidth={1.2} />
      <path d="M152 335 L470 347 C505 351 530 363 548 393" fill="none" stroke={pal.ink2} strokeWidth={1.2} />
      <Label x={600} y={438} text="Throat" pal={pal} muted size={10} />
      <Label x={330} y={372} text="Hard palate" pal={pal} muted size={10} />
      {/* Turbinates */}
      {[
        "M332 194 C382 188 442 190 472 198 C478 206 472 212 460 212 C422 208 372 208 332 206 Z",
        "M242 228 C322 216 432 218 494 230 C502 240 494 248 480 248 C412 244 322 246 252 248 C238 244 236 234 242 228 Z",
        "M202 278 C292 264 432 266 514 278 C522 290 512 300 496 300 C422 296 302 298 216 300 C198 296 194 284 202 278 Z",
      ].map((d, i) => (
        <path key={i} d={d} fill={pal.surface2} stroke={pal.axis} strokeWidth={1} />
      ))}
      <Label x={604} y={238} text="Turbinates" pal={pal} muted size={10} />
      <Leader x1={600} y1={234} x2={512} y2={238} pal={pal} />
      {/* Mucus and olfactory epithelium */}
      <rect x={252} y={175} width={190} height={8} fill={pal.mucus} />
      <path d="M252 172 L442 171" stroke={pal.accent} strokeWidth={4} strokeLinecap="round" />
      <Label x={604} y={182} text="Olfactory epithelium + mucus" pal={pal} weight={500} />
      <Leader x1={600} y1={178} x2={446} y2={174} pal={pal} />
      {/* Air flow */}
      {FLOWS.map((f, i) => (
        <path key={i} d={cubicD(f)} fill="none" stroke={pal.axis} strokeWidth={1} opacity={0.9} />
      ))}
      <path d="M44 326 L96 318" stroke={pal.ink2} strokeWidth={1.2} markerEnd={`url(#${arrowId})`} opacity={0.4 + 0.6 * inhale} />
      <Label x={20} y={346} text="Inhaled air" pal={pal} muted size={10} />
      <Label x={66} y={302} text="Nostril" pal={pal} muted size={10} />
      <defs>
        <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill={pal.ink2} />
        </marker>
      </defs>
      {/* Molecules. With one odorant, colour marks the change of state (air →
          dissolved); with a mixture, colour is identity instead and dissolving
          is shown by a halo, so the two never compete for the same channel. */}
      {molecules.map((m) =>
        m ? (
          <g key={m.k}>
            {m.dissolved && mixture && <circle cx={m.x} cy={m.y} r={6.5} fill="none" stroke={fillOf(m.k)} strokeWidth={1.2} opacity={0.5} />}
            <circle
              cx={m.x}
              cy={m.y}
              r={3.4}
              fill={mixture ? fillOf(m.k) : m.dissolved ? pal.accent : pal.ink}
              stroke={pal.surface}
              strokeWidth={1.5}
            />
          </g>
        ) : null,
      )}
      {mixture ? (
        <>
          <ComponentKey mixture={mixture} pal={pal} x={24} y={414} />
          <g transform="translate(24 434)">
            <circle cx={6} cy={-3} r={3.4} fill={pal.ink2} />
            <circle cx={6} cy={-3} r={6.5} fill="none" stroke={pal.ink2} strokeWidth={1.2} opacity={0.5} />
            <Label x={18} y={0} text="halo: dissolved in mucus" pal={pal} muted size={10} />
          </g>
        </>
      ) : (
        <g transform="translate(24 404)">
          <circle cx={6} cy={6} r={3.4} fill={pal.ink} />
          <Label x={16} y={10} text="odorant molecule in air" pal={pal} muted size={10} />
          <circle cx={176} cy={6} r={3.4} fill={pal.accent} />
          <Label x={186} y={10} text="dissolved in mucus" pal={pal} muted size={10} />
        </g>
      )}
    </svg>
  );
}
