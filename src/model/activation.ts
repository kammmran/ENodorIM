// Receptor activation from measured receptor–odorant data.
//
// With an EC50:          a = Cⁿ / (EC50ⁿ + Cⁿ), n = 1 (M2OR gives no Hill coefficients).
// Screening-only agonist: a fixed qualitative level, switched on at and above
//                         the lowest concentration where a response was seen.
// EC50 above the tested range ("> x"): a lower qualitative level above x.
//
// All concentrations are assay concentrations in buffer (mol/L), not
// concentrations in air or nasal mucus.

import type { PairRecord } from "../data/types";

/** Activation shown for agonists known only from screening (qualitative). */
export const QUALITATIVE_LEVEL = 0.5;
/** Activation shown when the EC50 lies above the highest tested concentration. */
export const CENSORED_LEVEL = 0.25;

export type ActivationKind = "quantitative" | "qualitative" | "none";

export interface PairActivation {
  a: number;
  kind: ActivationKind;
  /** EC50 in mol/L, when measured. */
  ec50?: number;
  /** Concentration (mol/L) from which a qualitative response is shown. */
  threshold?: number;
}

export function hill(conc: number, ec50: number, n = 1): number {
  if (!(conc > 0) || !(ec50 > 0)) return 0;
  const cn = Math.pow(conc, n);
  return cn / (Math.pow(ec50, n) + cn);
}

export function pairActivation(pair: PairRecord, conc: number): PairActivation {
  if (pair.status !== "agonist") return { a: 0, kind: "none" };
  if (pair.log_ec50 !== undefined && pair.log_ec50 !== null) {
    const ec50 = Math.pow(10, pair.log_ec50);
    return { a: hill(conc, ec50), kind: "quantitative", ec50 };
  }
  if (pair.log_ec50_gt !== undefined && pair.log_ec50_gt !== null) {
    const threshold = Math.pow(10, pair.log_ec50_gt);
    return { a: conc >= threshold ? CENSORED_LEVEL : 0, kind: "qualitative", threshold };
  }
  if (pair.min_resp_um !== undefined && pair.min_resp_um !== null) {
    const threshold = pair.min_resp_um * 1e-6;
    return { a: conc >= threshold ? QUALITATIVE_LEVEL : 0, kind: "qualitative", threshold };
  }
  // Responds, but the source gives no concentration.
  return { a: QUALITATIVE_LEVEL, kind: "qualitative" };
}

/** Activation of an allele measured in one paper (genotype cases). */
export function alleleActivation(status: string, logEc50: number | null, conc: number): number {
  if (status !== "agonist" || logEc50 === null) return 0;
  return hill(conc, Math.pow(10, logEc50));
}

export function formatConc(molar: number): string {
  const units: [number, string][] = [[1, "M"], [1e-3, "mM"], [1e-6, "µM"], [1e-9, "nM"]];
  for (const [f, u] of units) {
    if (molar >= f * 0.9999) {
      const v = molar / f;
      return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(v % 1 ? 1 : 0) : v.toPrecision(2).replace(/\.0$/, "")} ${u}`;
    }
  }
  return `${(molar / 1e-9).toPrecision(2)} nM`;
}
