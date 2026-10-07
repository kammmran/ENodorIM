// One complete run: stimulus → receptor activation → OSN responses → bulb →
// cortex/perception signals. Pure function of its inputs; the interface only
// animates the result along the timeline.

import type { GenotypeCase } from "../data/types";
import { bulbLayout, lateralInhibition, topShare, type GlomerulusPos } from "./bulb";
import { appraisalFactor, corticalFactor, detectionThresholdFactor, type PersonProfile } from "./modifiers";
import { activationVector, type ReceptorActivation, type Stimulus } from "./stimulus";
import { PARAMS, osnResponse, type Trace } from "./transduction";

export const POC_REGIONS = ["aon", "tubercle", "piriform-frontal", "piriform-temporal", "amygdala", "entorhinal"] as const;
export const DOWNSTREAM_REGIONS = ["ofc", "insula", "hippocampus", "amygdala-2", "hypothalamus"] as const;

/** Total OSN drive (sum of mean rates / max rate) needed for detection. Schematic. */
export const DETECTION_THRESHOLD = 0.05;
/** Half-saturation of the schematic cortical response to total bulb output. */
export const CORTEX_HALF = 0.5;

export interface SimulationResult {
  conc: number;
  acts: ReceptorActivation[];
  /** Responding receptors at this concentration, strongest first. */
  active: ReceptorActivation[];
  /** OSN trace for the strongest receptor (drives the transduction plots). */
  lead: { receptor: string; a: number; trace: Trace } | null;
  /** Mean OSN firing rate (Hz) per receptor, aligned with `acts`. */
  rates: number[];
  bulbPos: GlomerulusPos[];
  bulbIn: number[];
  bulbOut: number[];
  sharpening: { before: number; after: number };
  drive: number;
  threshold: number;
  detected: boolean;
  cortex: Record<string, number>;
  appraisal: number;
}

const layoutCache = new Map<string, GlomerulusPos[]>();

export function simulate(
  stim: Stimulus,
  order: string[],
  conc: number,
  profile: PersonProfile,
  cases: GenotypeCase[],
): SimulationResult {
  const acts = activationVector(stim, order, conc, profile, cases);
  const active = acts.filter((x) => x.a > 0).sort((p, q) => q.a - p.a || p.receptor.localeCompare(q.receptor));
  const rates = acts.map((x) => (x.a > 0 ? osnResponse(x.a).rate : 0));
  const key = order.join(",");
  let bulbPos = layoutCache.get(key);
  if (!bulbPos) {
    bulbPos = bulbLayout(order);
    layoutCache.set(key, bulbPos);
  }
  const bulbIn = rates.map((r) => r / PARAMS.fMax);
  const bulbOut = lateralInhibition(bulbIn, bulbPos);
  const drive = bulbIn.reduce((s, x) => s + x, 0);
  const threshold = DETECTION_THRESHOLD * detectionThresholdFactor(profile);
  const outSum = bulbOut.reduce((s, x) => s + x, 0);
  const S = outSum / (outSum + CORTEX_HALF);
  const cortex: Record<string, number> = {};
  for (const r of [...POC_REGIONS, ...DOWNSTREAM_REGIONS]) cortex[r] = S * corticalFactor(profile, r === "amygdala-2" ? "amygdala" : r);
  const lead = active[0] ? { receptor: active[0].receptor, a: active[0].a, trace: osnResponse(active[0].a).trace } : null;
  return {
    conc,
    acts,
    active,
    lead,
    rates,
    bulbPos,
    bulbIn,
    bulbOut,
    sharpening: { before: topShare(bulbIn, 3), after: topShare(bulbOut, 3) },
    drive,
    threshold,
    detected: drive >= threshold,
    cortex,
    appraisal: Math.min(1, S * appraisalFactor(profile)),
  };
}
