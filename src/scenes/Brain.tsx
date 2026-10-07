import type { Palette } from "../ui/colors";

// Lateral view of the brain (front to the left), schematic. Deep structures
// are projected onto the lateral view and drawn as small shapes.

export interface Region {
  id: string;
  label: string;
  shape: { cx: number; cy: number; rx: number; ry: number };
  labelAt: [number, number];
  anchor?: "start" | "middle" | "end";
}

export const OB = { cx: 190, cy: 318, rx: 36, ry: 8 };

export const POC: Region[] = [
  { id: "aon", label: "Anterior olfactory nucleus", shape: { cx: 300, cy: 330, rx: 11, ry: 9 }, labelAt: [250, 392], anchor: "end" },
  { id: "tubercle", label: "Olfactory tubercle", shape: { cx: 332, cy: 344, rx: 11, ry: 9 }, labelAt: [268, 410], anchor: "end" },
  { id: "piriform-frontal", label: "Piriform (frontal)", shape: { cx: 364, cy: 326, rx: 22, ry: 9 }, labelAt: [356, 240], anchor: "middle" },
  { id: "piriform-temporal", label: "Piriform (temporal)", shape: { cx: 402, cy: 352, rx: 22, ry: 9 }, labelAt: [404, 430], anchor: "middle" },
  { id: "amygdala", label: "Amygdala", shape: { cx: 440, cy: 366, rx: 12, ry: 10 }, labelAt: [520, 446], anchor: "middle" },
  { id: "entorhinal", label: "Entorhinal cortex", shape: { cx: 484, cy: 378, rx: 24, ry: 8 }, labelAt: [640, 430], anchor: "middle" },
];

export const DOWNSTREAM: Region[] = [
  { id: "ofc", label: "Orbitofrontal cortex", shape: { cx: 236, cy: 284, rx: 52, ry: 15 }, labelAt: [130, 220], anchor: "middle" },
  { id: "insula", label: "Insula", shape: { cx: 440, cy: 290, rx: 44, ry: 17 }, labelAt: [440, 230], anchor: "middle" },
  { id: "hippocampus", label: "Hippocampus", shape: { cx: 538, cy: 354, rx: 40, ry: 11 }, labelAt: [640, 300], anchor: "middle" },
  { id: "amygdala-2", label: "Amygdala", shape: { cx: 440, cy: 366, rx: 12, ry: 10 }, labelAt: [440, 446], anchor: "middle" },
];

export const MOTOR = { d: "M452 64 C462 90 470 120 476 150 L492 146 C486 116 478 86 470 60 Z", label: [520, 70] as [number, number] };

export function BrainOutline({ pal }: { pal: Palette }) {
  return (
    <g>
      <path
        d="M150 250 C130 160 230 70 380 58 C540 46 680 110 706 214 C718 268 694 310 650 326 C620 336 600 334 572 336 C540 372 488 394 432 388 C392 384 370 366 350 354 C300 344 250 330 214 312 C176 294 156 276 150 250 Z"
        fill={pal.tissue}
        stroke={pal.ink2}
        strokeWidth={1.2}
      />
      <path d="M296 302 C356 272 430 262 524 270" fill="none" stroke={pal.axis} strokeWidth={1} />
      <path d="M590 352 C620 330 700 330 724 360 C740 384 712 410 670 410 C630 410 600 392 590 352 Z" fill={pal.surface2} stroke={pal.ink2} strokeWidth={1} />
      <path d="M562 350 C568 380 574 410 580 452 L612 452 C604 412 600 380 596 352" fill={pal.surface2} stroke={pal.ink2} strokeWidth={1} />
      <ellipse {...OB} fill={pal.surface} stroke={pal.ink} strokeWidth={1.2} />
      <path d="M226 318 C258 322 286 326 300 330" fill="none" stroke={pal.ink} strokeWidth={1.2} />
      <text x={150} y={344} fontSize={10.5} fill={pal.ink} textAnchor="middle">
        Olfactory bulb
      </text>
    </g>
  );
}

export function RegionShape({ r, level, pal, show = true }: { r: Region; level: number; pal: Palette; show?: boolean }) {
  const on = show && level > 0.01;
  const { cx, cy } = r.shape;
  const [lx, ly] = r.labelAt;
  return (
    <g>
      <line x1={cx} y1={cy} x2={lx} y2={ly + (ly > cy ? -10 : 4)} stroke={pal.axis} strokeWidth={0.8} />
      <ellipse {...r.shape} fill={on ? pal.ramp(level) : pal.surface} stroke={on ? pal.ink : pal.axis} strokeWidth={1} />
      <text x={lx} y={ly} fontSize={10.5} textAnchor={r.anchor ?? "middle"} fill={on ? pal.ink : pal.ink2} fontWeight={on ? 500 : 400}>
        {r.label}
      </text>
    </g>
  );
}
