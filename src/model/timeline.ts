// One continuous timeline through the seven stages. Durations are
// presentation time (seconds at 1× speed). The stages are explanatory zoom
// levels: in the nose they overlap in time, so each stage states its own
// physiological time scale in the interface.

export type StageId = "sniff" | "binding" | "transduction" | "firing" | "bulb" | "cortex" | "perception";

export interface StageDef {
  id: StageId;
  label: string;
  rail: string;
  duration: number;
}

export const STAGES: StageDef[] = [
  { id: "sniff", label: "Sniff", rail: "Nose", duration: 6 },
  { id: "binding", label: "Receptor binding", rail: "Receptor", duration: 7 },
  { id: "transduction", label: "Transduction", rail: "Neuron", duration: 9 },
  { id: "firing", label: "Firing and reset", rail: "Firing", duration: 8 },
  { id: "bulb", label: "Olfactory bulb", rail: "Bulb", duration: 8 },
  { id: "cortex", label: "Primary olfactory cortex", rail: "Cortex", duration: 7 },
  { id: "perception", label: "Perception", rail: "Perception", duration: 7 },
];

export const TOTAL_DURATION = STAGES.reduce((s, x) => s + x.duration, 0);

export function stageStart(index: number): number {
  return STAGES.slice(0, index).reduce((s, x) => s + x.duration, 0);
}

export interface Located {
  index: number;
  stage: StageDef;
  /** Progress through the current stage, 0–1. */
  p: number;
  start: number;
  end: number;
}

export function locate(t: number): Located {
  const tt = Math.max(0, Math.min(TOTAL_DURATION, t));
  let start = 0;
  for (let i = 0; i < STAGES.length; i++) {
    const end = start + STAGES[i].duration;
    if (tt < end || i === STAGES.length - 1) {
      return { index: i, stage: STAGES[i], p: Math.min(1, (tt - start) / STAGES[i].duration), start, end };
    }
    start = end;
  }
  throw new Error("unreachable");
}

/**
 * Physiological clock (ms) for the OSN traces: flat before transduction,
 * 0→700 ms during transduction, 700→1600 ms during firing and reset
 * (stimulus off at 1100 ms), then complete.
 */
export function physiologicalTime(t: number): number {
  const { stage, p } = locate(t);
  if (stage.id === "sniff" || stage.id === "binding") return 0;
  if (stage.id === "transduction") return p * 700;
  if (stage.id === "firing") return 700 + p * 900;
  return 1600;
}
