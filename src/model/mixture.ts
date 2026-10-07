// Phase 3: mixtures of two or more odorants.
//
// Components compete for the same binding site on a receptor. For agonists of
// equal efficacy at concentrations C_i with potencies EC50_i, the standard
// competitive model gives
//
//     a = Σ(C_i / EC50_i) / (1 + Σ(C_i / EC50_i))
//
// With C_i = f_i · C (fractions of one total concentration) this rearranges to
//
//     a = C / (EC50_mix + C),   EC50_mix = 1 / Σ(f_i / EC50_i)
//
// — an ordinary Hill curve with an effective EC50. So a mixture is expressible
// as one synthetic pair per receptor, and the existing simulation runs on it
// unchanged.
//
// What this does NOT model: antagonism and the suppression real mixtures show,
// where one component lowers the response to another. The model can only ever
// make a receptor respond *more* as components are added. The interface says so.

import type { PairRecord } from "../data/types";

import { dataState, evidenceTier } from "./evidence";
import type { ResponseModel, Stimulus } from "./stimulus";

export interface MixtureComponent {
  stimulus: Stimulus;
  /** Share of the total concentration, 0–1. */
  fraction: number;
}

export interface ReceptorContribution {
  component: string;
  fraction: number;
  /** EC50 (mol/L) of this component at this receptor, when measured. */
  ec50: number | null;
  /** Share of the mixture's potency at this receptor that this component supplies. */
  share: number;
  qualitative: boolean;
}

export interface MixtureReceptor {
  receptor: string;
  /** Effective EC50 (mol/L) of the mixture at this receptor. */
  ec50: number | null;
  /** True when any contributing component was known only from screening. */
  qualitative: boolean;
  contributions: ReceptorContribution[];
  /** The most potent single component's EC50, for comparison with the mixture. */
  bestSingleEc50: number | null;
}

/**
 * Concentration standing in for the potency of an agonist known only from
 * screening, so it can still enter the sum. Deliberately weak, and the result
 * is flagged qualitative wherever it was used.
 */
export const QUALITATIVE_EC50 = 1e-3;

function componentEc50(pair: PairRecord): { ec50: number; qualitative: boolean } | null {
  if (pair.status !== "agonist") return null;
  if (pair.log_ec50 !== undefined && pair.log_ec50 !== null) return { ec50: 10 ** pair.log_ec50, qualitative: false };
  if (pair.log_ec50_gt !== undefined && pair.log_ec50_gt !== null) return { ec50: 10 ** pair.log_ec50_gt, qualitative: true };
  if (pair.min_resp_um !== undefined && pair.min_resp_um !== null) return { ec50: pair.min_resp_um * 1e-6, qualitative: true };
  return { ec50: QUALITATIVE_EC50, qualitative: true };
}

export function normaliseFractions(components: MixtureComponent[]): MixtureComponent[] {
  const total = components.reduce((s, c) => s + Math.max(0, c.fraction), 0);
  if (total <= 0) return components.map((c) => ({ ...c, fraction: 1 / Math.max(1, components.length) }));
  return components.map((c) => ({ ...c, fraction: Math.max(0, c.fraction) / total }));
}

/** Effective potency of the mixture at every receptor any component activates. */
export function combineReceptors(components: MixtureComponent[]): MixtureReceptor[] {
  const parts = normaliseFractions(components);
  const acc = new Map<string, { sum: number; qual: boolean; contribs: ReceptorContribution[]; best: number | null }>();
  for (const { stimulus, fraction } of parts) {
    if (fraction <= 0) continue;
    for (const [receptor, response] of stimulus.responses) {
      const e = componentEc50(response.pair);
      if (!e) continue;
      let a = acc.get(receptor);
      if (!a) {
        a = { sum: 0, qual: false, contribs: [], best: null };
        acc.set(receptor, a);
      }
      const term = fraction / e.ec50;
      a.sum += term;
      a.qual ||= e.qualitative;
      a.best = a.best === null ? e.ec50 : Math.min(a.best, e.ec50);
      a.contribs.push({
        component: stimulus.label,
        fraction,
        ec50: e.qualitative ? null : e.ec50,
        share: term, // normalised below, once the total is known
        qualitative: e.qualitative,
      });
    }
  }
  const out: MixtureReceptor[] = [];
  for (const [receptor, a] of acc) {
    if (a.sum <= 0) continue;
    for (const c of a.contribs) c.share = c.share / a.sum;
    a.contribs.sort((p, q) => q.share - p.share);
    out.push({
      receptor,
      ec50: 1 / a.sum,
      qualitative: a.qual,
      contributions: a.contribs,
      bestSingleEc50: a.best,
    });
  }
  out.sort((p, q) => (p.ec50 ?? Infinity) - (q.ec50 ?? Infinity) || p.receptor.localeCompare(q.receptor));
  return out;
}

export const MIXTURE_ID = "__mixture__";

/** The mixture as a Stimulus, so the whole simulation runs on it unchanged. */
export function mixtureStimulus(components: MixtureComponent[], label = "Mixture"): Stimulus {
  const combined = combineReceptors(components);
  const responses = new Map<string, ResponseModel>();
  const provenance = components.some((c) => c.stimulus.provenance === "predicted") ? "predicted" : "measured";
  for (const r of combined) {
    const pair: PairRecord = {
      receptor: r.receptor,
      status: "agonist",
      quality: r.qualitative ? "primaryScreening" : "ec50",
      provenance,
      n_positive: r.contributions.length,
      n_experiments: r.contributions.length,
      dois: [],
      assays: [],
      log_ec50: r.ec50 !== null ? Math.log10(r.ec50) : undefined,
    };
    responses.set(r.receptor, {
      receptor: r.receptor,
      state: dataState(pair),
      evidence: evidenceTier(pair),
      provenance,
      pair,
    });
  }
  return {
    id: MIXTURE_ID,
    label,
    inchikey: null,
    smiles: null,
    provenance,
    responses,
    variants: [],
    percept: [],
  };
}

export interface DescriptorShare {
  label: string;
  weight: number;
  from: string[];
}

/**
 * Descriptor words for a mixture: each component's words weighted by how much
 * of the mixture's total receptor drive it supplies. This is a presentational
 * blend, not a prediction of how the mixture is actually perceived — real
 * mixtures are not the sum of their parts.
 */
export function blendDescriptors(components: MixtureComponent[], weights: Map<string, number>): DescriptorShare[] {
  const acc = new Map<string, DescriptorShare>();
  let total = 0;
  for (const { stimulus } of components) {
    const w = weights.get(stimulus.id) ?? 0;
    if (w <= 0) continue;
    total += w;
    const labels = new Set<string>();
    for (const d of stimulus.percept) {
      const ls =
        d.source === "leffingwell"
          ? d.labels
          : d.source === "keller_2016"
            ? Object.keys(d.descriptors).slice(0, 6)
            : Object.keys(d.applicability).slice(0, 6).map((k) => k.toLowerCase());
      for (const l of ls) labels.add(l.toLowerCase());
    }
    for (const label of labels) {
      let e = acc.get(label);
      if (!e) {
        e = { label, weight: 0, from: [] };
        acc.set(label, e);
      }
      e.weight += w;
      if (!e.from.includes(stimulus.label)) e.from.push(stimulus.label);
    }
  }
  const out = [...acc.values()];
  if (total > 0) for (const e of out) e.weight /= total;
  out.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  return out.slice(0, 12);
}

/** Total receptor drive each component would produce on its own, for weighting. */
export function componentDrive(components: MixtureComponent[], conc: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const { stimulus, fraction } of normaliseFractions(components)) {
    let drive = 0;
    for (const [, response] of stimulus.responses) {
      const e = componentEc50(response.pair);
      if (!e) continue;
      const c = fraction * conc;
      drive += c / (e.ec50 + c);
    }
    out.set(stimulus.id, drive);
  }
  return out;
}
