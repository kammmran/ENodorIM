// A Stimulus is everything the simulation needs about what is being smelled:
// how each receptor responds (with provenance) and what the percept data say.
//
// Phase 1 builds it from measured data (pairs.json). Phase 2 will build the
// same type from a prediction service (provenance "predicted"); Phase 3 will
// combine several stimuli into one. The simulation never looks behind this type.

import type { DescriptorSet, GenotypeCase, Odorant, OdorantPairs, PairRecord, Provenance } from "../data/types";
import { alleleActivation, pairActivation, type PairActivation } from "./activation";
import { dataState, evidenceTier, type DataState, type EvidenceTier } from "./evidence";
import type { PersonProfile } from "./modifiers";

export interface ResponseModel {
  receptor: string;
  state: DataState;
  evidence: EvidenceTier | null;
  provenance: Provenance;
  pair: PairRecord;
}

export interface Stimulus {
  id: string;
  label: string;
  inchikey: string | null;
  smiles: string | null;
  provenance: Provenance;
  /** Tested receptors only; any other receptor is "not tested". */
  responses: Map<string, ResponseModel>;
  variants: PairRecord[];
  percept: DescriptorSet[];
}

export function stimulusFromData(odorant: Odorant, pairs: OdorantPairs | undefined): Stimulus {
  const responses = new Map<string, ResponseModel>();
  for (const p of pairs?.pairs ?? []) {
    responses.set(p.receptor, {
      receptor: p.receptor,
      state: dataState(p),
      evidence: evidenceTier(p),
      provenance: p.provenance,
      pair: p,
    });
  }
  return {
    id: odorant.id,
    label: odorant.name,
    inchikey: odorant.inchikey,
    smiles: odorant.smiles,
    provenance: odorant.provenance,
    responses,
    variants: pairs?.variant_pairs ?? [],
    percept: odorant.descriptors,
  };
}

export interface GenotypeEffect {
  caseId: string;
  genotype: string;
  alleles: [string, string];
  doi: string;
}

export interface ReceptorActivation extends PairActivation {
  receptor: string;
  state: DataState;
  evidence: EvidenceTier | null;
  provenance: Provenance;
  genotype?: GenotypeEffect;
}

export function genotypeCasesFor(stimulusId: string, cases: GenotypeCase[]): GenotypeCase[] {
  return cases.filter((c) => c.odorant === stimulusId);
}

/** Activation of every receptor in `order` at concentration `conc` (mol/L). */
export function activationVector(
  stim: Stimulus,
  order: string[],
  conc: number,
  profile: PersonProfile,
  cases: GenotypeCase[],
): ReceptorActivation[] {
  const byReceptor = new Map(genotypeCasesFor(stim.id, cases).map((c) => [c.receptor, c]));
  return order.map((receptor) => {
    const gc = byReceptor.get(receptor);
    if (gc) return genotypeActivation(receptor, gc, conc, profile);
    const r = stim.responses.get(receptor);
    if (!r) return { receptor, a: 0, kind: "none", state: "untested", evidence: null, provenance: stim.provenance };
    return { receptor, ...pairActivation(r.pair, conc), state: r.state, evidence: r.evidence, provenance: r.provenance };
  });
}

/**
 * Receptors with a genotype case use the allele values of that one paper for
 * every genotype, so the comparison reflects genotype only. Heterozygotes are
 * the mean of the two alleles (monoallelic expression: half the neurons each).
 */
export function genotypeActivation(
  receptor: string,
  gc: GenotypeCase,
  conc: number,
  profile: PersonProfile,
): ReceptorActivation {
  const gid = profile.genotypes[gc.id] ?? gc.genotypes[0].id;
  const g = gc.genotypes.find((x) => x.id === gid) ?? gc.genotypes[0];
  const per = g.alleles.map((name) => {
    const al = gc.alleles[name];
    return alleleActivation(al.status, al.log_ec50, conc);
  });
  const a = (per[0] + per[1]) / 2;
  const anyAgonist = Object.values(gc.alleles).some((al) => al.status === "agonist");
  return {
    receptor,
    a,
    kind: anyAgonist ? "quantitative" : "none",
    state: anyAgonist ? "agonist" : "non_agonist",
    evidence: "dose-response",
    provenance: gc.provenance,
    genotype: { caseId: gc.id, genotype: g.id, alleles: g.alleles, doi: gc.doi },
  };
}

export function summarise(acts: ReceptorActivation[]) {
  let tested = 0, agonists = 0, active = 0, inconclusive = 0;
  for (const x of acts) {
    if (x.state !== "untested") tested++;
    if (x.state === "inconclusive") inconclusive++;
    if (x.state === "agonist") agonists++;
    if (x.a > 0) active++;
  }
  return { tested, agonists, active, inconclusive, total: acts.length };
}
