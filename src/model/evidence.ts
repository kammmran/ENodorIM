// Data states and evidence tiers shown for every receptor–odorant pair.
//
// The three main states follow the brief: responds / tested, no response /
// not tested. "Inconclusive" is a sub-state of tested (sources disagree;
// M2OR would discard the pair).

import type { PairRecord } from "../data/types";

export type DataState = "agonist" | "non_agonist" | "inconclusive" | "untested";

/**
 * Evidence behind an agonist:
 *  - "dose-response": tested across concentrations with a fitted response (EC50 or censored)
 *  - "confirmed": screening, responsive in ≥ 2 results or at ≥ 2 concentrations
 *  - "single": one positive screening result
 */
export type EvidenceTier = "dose-response" | "confirmed" | "single";

export function dataState(pair: PairRecord | undefined): DataState {
  return pair ? pair.status : "untested";
}

export function evidenceTier(pair: PairRecord): EvidenceTier | null {
  if (pair.status !== "agonist") return null;
  if (pair.quality === "ec50") return "dose-response";
  if (pair.quality === "secondaryScreening" || pair.n_positive >= 2) return "confirmed";
  return "single";
}

export const STATE_LABEL: Record<DataState, string> = {
  agonist: "Responds",
  non_agonist: "Tested, no response",
  inconclusive: "Tested, results disagree",
  untested: "Not tested",
};

export const EVIDENCE_LABEL: Record<EvidenceTier, string> = {
  "dose-response": "Dose–response",
  confirmed: "Screening, confirmed",
  single: "Single screening hit",
};

export const QUALITY_LABEL: Record<string, string> = {
  ec50: "dose–response",
  secondaryScreening: "secondary screening",
  primaryScreening: "primary screening",
  screening: "screening",
};
