import { useId } from "react";
import { PARAMS, peak, sampleIndex } from "../model/transduction";
import { Label, SchematicBadge, SevenTM, VB, type SceneProps } from "./common";
import { rand } from "./geometry";

// The transduction cascade in one cilium, driven by the model at time tau.

const MEM_TOP = 150, MEM_BOT = 174;

function Channel({ x, open, pal, label }: { x: number; open: number; pal: SceneProps["pal"]; label: string }) {
  const gap = 3 + 11 * open;
  return (
    <g>
      <rect x={x - gap / 2 - 16} y={MEM_TOP - 10} width={16} height={MEM_BOT - MEM_TOP + 20} rx={6} fill={pal.surface} stroke={pal.ink2} />
      <rect x={x + gap / 2} y={MEM_TOP - 10} width={16} height={MEM_BOT - MEM_TOP + 20} rx={6} fill={pal.surface} stroke={pal.ink2} />
      <text x={x} y={MEM_BOT + 30} textAnchor="middle" fontSize={11} fontWeight={500} fill={pal.ink}>
        {label}
      </text>
    </g>
  );
}

export function TransductionScene({ tau, sim, reduced, pal, odorant }: SceneProps) {
  const arrowId = `tr${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lead = sim.lead;
  const tr = lead?.trace;
  const i = tr ? sampleIndex(tr, reduced ? Math.min(tau, tr.stimOff - 50) || 600 : tau) : 0;
  const G = tr ? tr.g[i] : 0;
  const camp = tr ? tr.camp[i] / Math.max(1e-6, peak(tr.camp)) : 0;
  const cng = tr ? tr.icng[i] : 0;
  const ca = tr ? tr.ca[i] / Math.max(1e-6, peak(tr.ca)) : 0;
  const cl = tr ? tr.icl[i] / PARAMS.gCl : 0;
  const vm = tr ? Math.min(1, tr.vm[i]) : 0;
  const t = reduced ? 0 : tau;
  const flow = (n: number, k0: number, x: number, from: number, to: number, speed: number) =>
    Array.from({ length: n }, (_, k) => {
      const ph = (rand(k + k0) + t * speed) % 1;
      const y = from + (to - from) * ph;
      const near = Math.abs(y - (MEM_TOP + MEM_BOT) / 2) < 30;
      return { x: x + (rand(k + k0 + 9) - 0.5) * (near ? 6 : 26), y, k };
    });
  const nIn = Math.round(10 * cng), nOut = Math.round(12 * cl);

  return (
    <svg className="scene" viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={lead ? `Transduction cascade driven by ${lead.receptor}: cAMP ${(camp * 100).toFixed(0)}% of peak, CNG open ${(cng * 100).toFixed(0)}%, Cl⁻ channel open ${(cl * 100).toFixed(0)}%, depolarisation ${(vm * 100).toFixed(0)}%.` : "Transduction cascade: no receptor responds at this concentration."}>
      <defs>
        <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill={pal.ink2} />
        </marker>
      </defs>
      <rect x={0} y={0} width={VB.w} height={MEM_TOP} fill={pal.mucus} />
      <rect x={0} y={MEM_BOT} width={VB.w} height={VB.h - MEM_BOT} fill={pal.tissue} />
      <line x1={0} y1={MEM_TOP} x2={VB.w} y2={MEM_TOP} stroke={pal.ink2} />
      <line x1={0} y1={MEM_BOT} x2={VB.w} y2={MEM_BOT} stroke={pal.ink2} />
      <SchematicBadge pal={pal} text="schematic model" />
      <Label x={16} y={24} text="Mucus (outside)" pal={pal} muted />
      <Label x={16} y={VB.h - 16} text="Inside the cilium" pal={pal} muted />

      {/* Receptor */}
      <SevenTM x={80} y={MEM_TOP - 10} h={44} fill={lead ? pal.ramp(lead.a) : pal.surface2} stroke={pal.ink2} pal={pal} />
      <text x={80} y={MEM_BOT + 30} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fontWeight={500} fill={pal.ink}>
        {lead?.receptor ?? "OR"}
      </text>
      {lead && <circle cx={80} cy={MEM_TOP + 3} r={3.4} fill={pal.accent} stroke={pal.surface} strokeWidth={1.2} />}

      {/* G protein and adenylyl cyclase III */}
      <ellipse cx={150} cy={MEM_BOT + 24} rx={22} ry={12} fill={pal.ramp(G)} fillOpacity={0.15 + 0.85 * G} stroke={pal.ink2} />
      <Label x={150} y={MEM_BOT + 54} text="Gαolf" anchor="middle" pal={pal} size={11} weight={500} />
      {Array.from({ length: 12 }, (_, k) => (
        <rect key={k} x={212 + k * 5 + (k >= 6 ? 6 : 0)} y={MEM_TOP - 6} width={4} height={MEM_BOT - MEM_TOP + 12} rx={2} fill={pal.surface} stroke={pal.ink2} strokeWidth={0.8} />
      ))}
      <ellipse cx={245} cy={MEM_BOT + 30} rx={34} ry={15} fill={pal.ramp(G)} fillOpacity={0.15 + 0.85 * G} stroke={pal.ink2} />
      <Label x={245} y={MEM_BOT + 62} text="Adenylyl cyclase III" anchor="middle" pal={pal} size={11} weight={500} />
      <path d={`M100 ${MEM_BOT + 18} L126 ${MEM_BOT + 22}`} stroke={pal.ink2} markerEnd={`url(#${arrowId})`} />
      <path d={`M174 ${MEM_BOT + 26} L208 ${MEM_BOT + 28}`} stroke={pal.ink2} markerEnd={`url(#${arrowId})`} />

      {/* cAMP */}
      {Array.from({ length: Math.round(16 * camp) }, (_, k) => {
        const x = 290 + rand(k + 1) * 140 + Math.sin(t / 90 + k) * 4;
        const y = MEM_BOT + 26 + rand(k + 2) * 110 + Math.cos(t / 110 + k) * 4;
        const r = 5;
        const pts = Array.from({ length: 6 }, (_, j) => `${x + r * Math.cos((Math.PI / 3) * j)},${y + r * Math.sin((Math.PI / 3) * j)}`).join(" ");
        return <polygon key={k} points={pts} fill="none" stroke={pal.series1} strokeWidth={1.4} />;
      })}
      <Label x={360} y={MEM_BOT + 160} text="cAMP" anchor="middle" pal={pal} size={11} weight={500} />
      <path d={`M432 ${MEM_BOT + 60} L456 ${MEM_BOT + 40}`} stroke={pal.ink2} markerEnd={`url(#${arrowId})`} />

      {/* CNG: Na⁺ and Ca²⁺ in */}
      <Channel x={480} open={cng} pal={pal} label="CNG channel" />
      {flow(nIn, 11, 480, 40, MEM_BOT + 80, 0.0016).map((m) =>
        m.k % 2 === 0 ? (
          <circle key={m.k} cx={m.x} cy={m.y} r={3.2} fill="none" stroke={pal.ink} strokeWidth={1.2} />
        ) : (
          <circle key={m.k} cx={m.x} cy={m.y} r={3.4} fill={pal.series2} />
        ),
      )}
      <Label x={496} y={70} text="Na⁺, Ca²⁺ in" pal={pal} size={11} />

      {/* Ca²⁺ inside, gating ANO2 */}
      {Array.from({ length: Math.round(12 * ca) }, (_, k) => (
        <circle key={k} cx={525 + rand(k + 30) * 70 + Math.sin(t / 70 + k) * 3} cy={MEM_BOT + 40 + rand(k + 40) * 80} r={3.4} fill={pal.series2} />
      ))}
      <Label x={560} y={MEM_BOT + 150} text="Ca²⁺" anchor="middle" pal={pal} size={11} weight={500} />

      {/* ANO2: Cl⁻ out */}
      <Channel x={640} open={cl} pal={pal} label="ANO2 (TMEM16B)" />
      {flow(nOut, 51, 640, MEM_BOT + 80, 40, 0.0016).map((m) => (
        <rect key={m.k} x={m.x - 3} y={m.y - 3} width={6} height={6} transform={`rotate(45 ${m.x} ${m.y})`} fill={pal.series1} />
      ))}
      <Label x={656} y={70} text="Cl⁻ out" pal={pal} size={11} />

      {/* Membrane potential */}
      <rect x={732} y={60} width={24} height={240} rx={3} fill="none" stroke={pal.axis} />
      <rect x={734} y={60 + 238 * (1 - vm)} width={20} height={238 * vm} rx={2} fill={pal.accent} fillOpacity={0.85} />
      <text x={744} y={322} fontSize={11} textAnchor="middle" fill={pal.ink}>
        Vm
      </text>
      <text x={744} y={337} fontSize={10} textAnchor="middle" fill={pal.ink2}>
        depolarisation
      </text>

      {/* Key */}
      <g transform={`translate(16 ${VB.h - 64})`} fontSize={10.5} fill={pal.ink2}>
        <circle cx={5} cy={-3} r={3.2} fill="none" stroke={pal.ink} strokeWidth={1.2} />
        <text x={14} y={0}>Na⁺</text>
        <circle cx={50} cy={-3} r={3.4} fill={pal.series2} />
        <text x={59} y={0}>Ca²⁺</text>
        <rect x={98} y={-6} width={6} height={6} transform="rotate(45 101 -3)" fill={pal.series1} />
        <text x={110} y={0}>Cl⁻</text>
        <polygon points="150,-3 152.5,-7.3 157.5,-7.3 160,-3 157.5,1.3 152.5,1.3" fill="none" stroke={pal.series1} />
        <text x={166} y={0}>cAMP</text>
        <text x={0} y={18} fill={pal.ink2}>
          {lead ? `Driven by ${lead.receptor} (a = ${lead.a.toFixed(2)}) with ${odorant.name}; t = ${Math.round(tau)} ms.` : "No receptor responds at this concentration."}
        </text>
      </g>
    </svg>
  );
}
